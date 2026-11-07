import { useSyncExternalStore } from 'react';
import { deleteMeta, getMeta, setMeta, WriterLostError } from '../db/db';
import { loadAllData, onDataChanged, replaceAllData } from '../db/repo';
import { hashData, isPristine, mergeBackups, parseBackup, toBackupFile, type BackupData } from '../io/backup';
import { clientId, consumeRedirect, currentToken, dropToken, revokeToken, startSignIn } from './auth';
import { decide, parseSyncState, type SyncState } from './decide';
import * as drive from './drive';
import { t } from '../i18n';

export type SyncStatus =
  | { kind: 'off' } // no Google client id configured
  | { kind: 'disconnected' }
  | { kind: 'needs-signin'; email: string } // connected before, token expired
  | { kind: 'syncing' }
  | { kind: 'ok'; email: string; at: string }
  | { kind: 'conflict'; email: string }
  | { kind: 'wrong-account'; expected: string }
  | { kind: 'error'; message: string };

export type SyncView = { status: SyncStatus; unsynced: boolean; lastError?: string };

let view: SyncView = { status: { kind: 'disconnected' }, unsynced: false };
const subs = new Set<() => void>();
function set(v: Partial<SyncView>) {
  view = { ...view, ...v };
  subs.forEach((f) => f());
}
export function useSync(): SyncView {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => view);
}
export function getSyncView(): SyncView {
  return view;
}

/** A remote copy we are waiting for a grown-up to decide about. */
let conflict: { remote: BackupData; info: drive.FileInfo; account: drive.Account } | null = null;

/** All syncs and resolutions run one after another. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
}

async function stored(): Promise<SyncState | null> {
  return parseSyncState(await getMeta('sync'));
}

async function localSnapshot() {
  const data = await loadAllData();
  return { data, hash: await hashData(data) };
}

/* ---------- start-up ---------- */

let timer: number | undefined;
const AUTO_DELAY = 5000;

let initialised: Promise<void> | null = null;

/** Call after boot (runs once). Picks up a token from a sign-in redirect and starts auto backup. */
export function initSync(): Promise<void> {
  initialised ??= doInitSync();
  return initialised;
}

async function doInitSync(): Promise<void> {
  if (!clientId()) {
    set({ status: { kind: 'off' } });
    consumeRedirect();
    return;
  }
  const redirect = pendingRedirect;
  pendingRedirect = null;
  const st = await stored();
  set({ status: st ? { kind: 'needs-signin', email: st.email } : { kind: 'disconnected' } });
  if (redirect && !redirect.ok) set({ lastError: redirect.error });
  void refreshUnsynced();
  onDataChanged(() => {
    void refreshUnsynced();
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(500);
  });
  if (redirect?.ok) await syncNow();
}

let pendingRedirect: ReturnType<typeof consumeRedirect> = null;
/** Must run before the router looks at the URL. */
export function takeRedirect() {
  pendingRedirect = consumeRedirect();
}

function schedule(delay = AUTO_DELAY) {
  window.clearTimeout(timer);
  if (!currentToken() || view.status.kind === 'conflict' || view.status.kind === 'wrong-account') return;
  timer = window.setTimeout(() => void syncNow(), delay);
}

async function refreshUnsynced() {
  try {
    const st = await stored();
    if (!st) return set({ unsynced: false });
    const { hash } = await localSnapshot();
    set({ unsynced: hash !== st.syncedHash });
  } catch {
    /* ignore */
  }
}

/* ---------- user actions ---------- */

/** From a tap: sign in (first time with the account chooser) and then sync. */
export async function connect(): Promise<void> {
  const st = await stored();
  await startSignIn({ selectAccount: !st, loginHint: st?.email || undefined });
}

export async function disconnect(): Promise<void> {
  await serial(async () => {
    window.clearTimeout(timer);
    conflict = null;
    await revokeToken();
    await deleteMeta('sync');
    set({ status: { kind: 'disconnected' }, unsynced: false, lastError: undefined });
  });
}

export function syncNow(): Promise<void> {
  return serial(async () => {
    try {
      await runSync();
    } catch (e) {
      handleError(e);
    }
  });
}

export type Resolution = 'merge' | 'remote' | 'local';

export function resolveConflict(choice: Resolution): Promise<void> {
  return serial(async () => {
    try {
      await runResolve(choice);
    } catch (e) {
      handleError(e);
    }
  });
}

function handleError(e: unknown) {
  if (e instanceof drive.DriveAuthError) {
    dropToken();
    void stored().then((st) => set({ status: st ? { kind: 'needs-signin', email: st.email } : { kind: 'disconnected' } }));
    return;
  }
  if (e instanceof WriterLostError) {
    set({ status: { kind: 'error', message: e.message } });
    return;
  }
  const message = e instanceof Error ? e.message : t('gdrive.failed');
  void stored().then((st) =>
    set({ status: st ? { kind: 'needs-signin', email: st.email } : { kind: 'disconnected' }, lastError: message }),
  );
  if (currentToken()) set({ status: { kind: 'error', message } });
}

/* ---------- the sync itself ---------- */

async function checkedAccount(token: string): Promise<drive.Account | null> {
  const account = await drive.getAccount(token);
  const st = await stored();
  if (st && st.accountId !== account.accountId) {
    // A different Google account: touch nothing, and offer the account chooser next time.
    await revokeToken();
    set({ status: { kind: 'wrong-account', expected: st.email } });
    return null;
  }
  return account;
}

async function saveState(account: drive.Account, info: drive.FileInfo, hash: string) {
  const state: SyncState = {
    accountId: account.accountId, email: account.email, fileId: info.fileId,
    remoteVersion: info.version, syncedHash: hash, syncedAt: new Date().toISOString(),
  };
  await setMeta('sync', state);
  set({ status: { kind: 'ok', email: account.email, at: state.syncedAt }, unsynced: false, lastError: undefined });
}

async function upload(token: string, account: drive.Account, existing: drive.FileInfo | null, expectedVersion: string | null) {
  // Read the newest local data right before uploading, and make sure nobody changed the Drive copy meanwhile.
  const { data, hash } = await localSnapshot();
  if (existing) {
    const now = await drive.getFileInfo(token, existing.fileId);
    if (!now || now.version !== expectedVersion) return 'moved' as const;
  }
  const content = JSON.stringify(toBackupFile(data));
  const info = existing ? await drive.updateBackup(token, existing.fileId, content) : await drive.createBackup(token, content);
  await saveState(account, info, hash);
  return 'done' as const;
}

async function runSync(attempt = 0): Promise<void> {
  const token = currentToken();
  if (!token) {
    const st = await stored();
    set({ status: st ? { kind: 'needs-signin', email: st.email } : { kind: 'disconnected' } });
    return;
  }
  if (attempt > 3) throw new Error(t('gdrive.keptChanging'));
  set({ status: { kind: 'syncing' } });
  const account = await checkedAccount(token);
  if (!account) return;
  const st = await stored();
  const local = await localSnapshot();
  const remote = await drive.findBackup(token);
  const d = decide(st, { hash: local.hash, pristine: isPristine(local.data) }, remote);

  if (d === 'nothing') {
    set({ status: { kind: 'ok', email: account.email, at: st?.syncedAt ?? new Date().toISOString() }, unsynced: false });
    return;
  }
  if (d === 'create' || d === 'push') {
    const r = await upload(token, account, d === 'push' ? remote : null, d === 'push' ? remote!.version : null);
    if (r === 'moved') return runSync(attempt + 1);
    return;
  }
  // pull or conflict: we need the remote content
  const remoteData = parseBackup(await drive.download(token, remote!.fileId)).data;
  const remoteHash = await hashData(remoteData);
  if (remoteHash === local.hash) {
    await saveState(account, remote!, local.hash);
    return;
  }
  if (d === 'conflict' && st && remoteHash === st.syncedHash) {
    // Only the version number moved (same content): it's really a push.
    const r = await upload(token, account, remote, remote!.version);
    if (r === 'moved') return runSync(attempt + 1);
    return;
  }
  if (d === 'pull') {
    // Re-check after the download: a change made meanwhile turns this into a conflict, not an overwrite.
    const again = await localSnapshot();
    if (again.hash === local.hash) {
      await replaceAllData(remoteData);
      await saveState(account, remote!, remoteHash);
      return;
    }
  }
  conflict = { remote: remoteData, info: remote!, account };
  set({ status: { kind: 'conflict', email: account.email } });
}

async function runResolve(choice: Resolution): Promise<void> {
  const token = currentToken();
  if (!token || !conflict) return runSync();
  const c = conflict;
  const account = await checkedAccount(token);
  if (!account) return;
  // The dialog may have been open for a while: if Drive changed again, look again instead of overwriting.
  const now = await drive.getFileInfo(token, c.info.fileId);
  if (!now || now.version !== c.info.version) {
    conflict = null;
    return runSync();
  }
  set({ status: { kind: 'syncing' } });
  if (choice === 'remote') {
    await replaceAllData(c.remote);
    await saveState(account, c.info, await hashData(c.remote));
  } else {
    if (choice === 'merge') {
      const local = await loadAllData();
      await replaceAllData(mergeBackups(local, c.remote));
    }
    const r = await upload(token, account, c.info, c.info.version);
    if (r === 'moved') {
      conflict = null;
      return runSync();
    }
  }
  conflict = null;
}

export function needsGrownUp(v: SyncView): boolean {
  return v.status.kind === 'conflict' || v.status.kind === 'wrong-account';
}
