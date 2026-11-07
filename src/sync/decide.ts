/** What this device remembers about the last successful sync. */
export type SyncState = {
  accountId: string;
  email: string;
  fileId: string;
  remoteVersion: string;
  syncedHash: string;
  syncedAt: string;
};

export type RemoteInfo = { fileId: string; version: string } | null;

export type Decision = 'nothing' | 'push' | 'pull' | 'create' | 'conflict';

/**
 * Decide one sync from (local changed?, remote changed?).
 * - A device that never synced may silently take the remote copy only when its own data is pristine.
 * - Empty data on a device that synced before is a local change (the user erased it), never a reason to pull.
 * - A different file id counts as a remote change.
 */
export function decide(stored: SyncState | null, local: { hash: string; pristine: boolean }, remote: RemoteInfo): Decision {
  if (!stored) {
    if (!remote) return 'create';
    return local.pristine ? 'pull' : 'conflict';
  }
  if (!remote) return 'create';
  const localChanged = local.hash !== stored.syncedHash;
  const remoteChanged = remote.fileId !== stored.fileId || remote.version !== stored.remoteVersion;
  if (!localChanged && !remoteChanged) return 'nothing';
  if (localChanged && !remoteChanged) return 'push';
  if (!localChanged && remoteChanged) return 'pull';
  return 'conflict';
}

const ID = /^[A-Za-z0-9_-]{8,200}$/;
const VERSION = /^\d{1,20}$/;
const HASH = /^[0-9a-f]{64}$/;
const ACCOUNT = /^[0-9A-Za-z_-]{1,100}$/;

export function isDriveFileId(v: unknown): v is string {
  return typeof v === 'string' && ID.test(v);
}
export function isDriveVersion(v: unknown): v is string {
  return typeof v === 'string' && VERSION.test(v);
}
export function isAccountId(v: unknown): v is string {
  return typeof v === 'string' && ACCOUNT.test(v);
}

/** Stored sync state is untrusted too (it could be from an older version or hand-edited): validate on load. */
export function parseSyncState(v: unknown): SyncState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isAccountId(o.accountId) || !isDriveFileId(o.fileId) || !isDriveVersion(o.remoteVersion)) return null;
  if (typeof o.syncedHash !== 'string' || !HASH.test(o.syncedHash)) return null;
  const email = typeof o.email === 'string' && o.email.length <= 320 ? o.email : '';
  const syncedAt = typeof o.syncedAt === 'string' && Number.isFinite(Date.parse(o.syncedAt)) ? o.syncedAt : new Date(0).toISOString();
  return { accountId: o.accountId, email, fileId: o.fileId, remoteVersion: o.remoteVersion, syncedHash: o.syncedHash, syncedAt };
}
