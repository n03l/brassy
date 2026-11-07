import { useEffect, useRef, useState } from 'react';
import { HoldButton } from '../ui/HoldButton';
import { persistenceStatus, requestPersistence } from '../db/db';
import { loadAllData, localDay, replaceAllData } from '../db/repo';
import { BackupError, mergeBackups, parseBackup, toBackupFile, type ParseReport } from '../io/backup';
import { downloadBytes } from '../io/download';
import { useData } from '../app/data';
import { ConfirmDialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { connect, disconnect, resolveConflict, syncNow, useSync } from '../sync/syncEngine';
import { clientId, redirectUri } from '../sync/auth';
import { routeHref } from '../app/router';
import { NAMINGS, setNamingPref, useNamingPref, type NoteNaming } from '../i18n/noteNames';
import { LANGS, locale, setPref, getPref, t, type LangPref } from '../i18n';

/** The grown-up gate stays open for 10 minutes, also across the Google sign-in redirect (same tab only). */
const UNLOCK_KEY = 'brassy-grownup-until';
function isUnlocked(): boolean {
  try {
    return Date.now() < Number(sessionStorage.getItem(UNLOCK_KEY) ?? 0);
  } catch {
    return false;
  }
}
function unlock() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now() + 10 * 60_000));
  } catch {
    /* private mode: the gate just asks again next time */
  }
}

export function Settings() {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  if (!unlocked) {
    return (
      <section className="card plain-page gate">
        <h1>{t('set.gateTitle')}</h1>
        <p>{t('set.gateText')}</p>
        <HoldButton onDone={() => { unlock(); setUnlocked(true); }}>{t('set.hold')}</HoldButton>
        <p><a href={routeHref({ name: 'library' })}>{t('common.backToSongs')}</a></p>
      </section>
    );
  }
  return (
    <div className="plain-page settings">
      <h1>{t('set.title')}</h1>
      <LanguageSection />
      <DriveSection />
      <FileBackupSection />
      <StorageSection />
      <p className="muted"><a href={routeHref({ name: 'about' })}>{t('set.aboutLink')}</a></p>
    </div>
  );
}

const NAMING_LABEL: Record<NoteNaming, 'set.namesLetters' | 'set.namesGerman' | 'set.namesSolfege'> = {
  letters: 'set.namesLetters',
  german: 'set.namesGerman',
  solfege: 'set.namesSolfege',
};

/** UI language and, separately, how note names are written (e.g. Italian app, German note names). */
function LanguageSection() {
  const [lang, setLang] = useState<LangPref>(getPref);
  const naming = useNamingPref();
  const pickLang = (v: LangPref) => { setLang(v); setPref(v); };
  return (
    <section className="card settings-card" aria-labelledby="lang-h">
      <h2 id="lang-h">{t('set.language')}</h2>
      <div className="settings-actions" role="group" aria-labelledby="lang-h">
        {([['auto', t('set.langAuto')], ...LANGS.map((l) => [l.id, l.name])] as [LangPref, string][]).map(([id, name]) => (
          <button key={id} className="btn" aria-pressed={lang === id} onClick={() => pickLang(id)}>{name}</button>
        ))}
      </div>
      <h2 id="names-h">{t('set.noteNames')}</h2>
      <div className="settings-actions" role="group" aria-labelledby="names-h">
        <button className="btn" aria-pressed={naming === 'auto'} onClick={() => setNamingPref('auto')}>{t('set.namesAuto')}</button>
        {NAMINGS.map((n) => (
          <button key={n.id} className="btn naming-btn" aria-pressed={naming === n.id} onClick={() => setNamingPref(n.id)}>
            <span className="naming-lang">{t(NAMING_LABEL[n.id])}</span>
            <span>{n.example}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{t('set.namesHint')}</p>
    </section>
  );
}

function DriveSection() {
  const v = useSync();
  const s = v.status;
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const run = (fn: () => Promise<void>) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (!clientId()) {
    return (
      <section className="card settings-card">
        <h2>{t('drive.title')}</h2>
        <p className="muted">{t('drive.notSetUp')}</p>
      </section>
    );
  }
  return (
    <section className="card settings-card" aria-labelledby="drive-h">
      <h2 id="drive-h">{t('drive.title')}</h2>
      <p className="muted small">{t('drive.intro')}</p>
      <p className="status-line" role="status">
        {s.kind === 'disconnected' && t('drive.disconnected')}
        {s.kind === 'needs-signin' && t('drive.needsSignin', s.email, v.unsynced)}
        {s.kind === 'syncing' && t('drive.syncing')}
        {s.kind === 'ok' && t('drive.ok', s.email, new Date(s.at).toLocaleString(locale()))}
        {s.kind === 'conflict' && t('drive.conflict')}
        {s.kind === 'wrong-account' && t('drive.wrongAccount', s.expected)}
        {s.kind === 'error' && <span className="warn-text">{s.message}</span>}
      </p>
      {v.lastError && s.kind !== 'error' && <p className="warn-text small">{v.lastError}</p>}
      {s.kind === 'conflict' && (
        <div className="conflict-actions">
          <button className="btn btn--primary" disabled={busy} onClick={run(() => resolveConflict('merge'))}>{t('drive.merge')}</button>
          <button className="btn" disabled={busy} onClick={run(() => resolveConflict('remote'))}>{t('drive.useRemote')}</button>
          <button className="btn" disabled={busy} onClick={run(() => resolveConflict('local'))}>{t('drive.keepLocal')}</button>
          <p className="muted small">{t('drive.mergeHint')}</p>
        </div>
      )}
      <div className="settings-actions">
        {(s.kind === 'disconnected' || s.kind === 'needs-signin' || s.kind === 'wrong-account' || s.kind === 'error') && (
          <button className="btn btn--primary" disabled={busy} onClick={run(connect)}>
            {s.kind === 'disconnected' ? t('drive.connect') : t('drive.signIn')}
          </button>
        )}
        {s.kind === 'ok' && <button className="btn" disabled={busy} onClick={run(syncNow)}>{t('drive.backUpNow')}</button>}
        {s.kind !== 'disconnected' && (
          <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{t('drive.disconnect')}</button>
        )}
      </div>
      <p className="muted small redirect-uri">{t('drive.redirectUri')} <code>{redirectUri()}</code></p>
      <ConfirmDialog open={confirmDisconnect} title={t('drive.disconnectTitle')}
        message={<p>{t('drive.disconnectMsg')}</p>}
        confirmLabel={t('drive.disconnect')} onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => { setConfirmDisconnect(false); void disconnect(); }} />
    </section>
  );
}

function FileBackupSection() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [error, setError] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  const exportAll = async () => {
    const data = await loadAllData();
    downloadBytes(JSON.stringify(toBackupFile(data), null, 1), `brassy-backup-${localDay()}.json`, 'application/json');
  };
  const pick = async (f: File) => {
    setError('');
    setReport(null);
    try {
      if (f.size > 50 * 1024 * 1024) throw new BackupError(t('backup.tooBig'));
      setReport(parseBackup(await f.text()));
    } catch (e) {
      setError(e instanceof BackupError ? e.message : t('file.unreadable'));
    }
  };
  const apply = async (mode: 'merge' | 'replace') => {
    if (!report) return;
    try {
      const data = mode === 'replace' ? report.data : mergeBackups(await loadAllData(), report.data);
      await replaceAllData(data);
      toast({ message: mode === 'replace' ? t('file.restored') : t('file.added') });
      setReport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('file.restoreFailed'));
    }
  };
  return (
    <section className="card settings-card" aria-labelledby="file-h">
      <h2 id="file-h">{t('file.title')}</h2>
      <p className="muted small">{t('file.intro')}</p>
      <div className="settings-actions">
        <button className="btn" onClick={() => void exportAll()}>{t('file.export')}</button>
        <button className="btn" onClick={() => input.current?.click()}>{t('file.import')}</button>
        <input ref={input} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
      </div>
      {error && <p className="warn-text" role="alert">{error}</p>}
      {report && (
        <div className="card-inset">
          <p>
            {t('file.summary', report.data.songs.length, report.data.practice.length)}
            {report.skippedSongs > 0 && t('file.skipped', report.skippedSongs)}
            {report.repairedSongs > 0 && t('file.repaired', report.repairedSongs)}
          </p>
          <div className="settings-actions">
            <button className="btn btn--primary" onClick={() => void apply('merge')}>{t('file.merge')}</button>
            <button className="btn btn--warn" onClick={() => setConfirmReplace(true)}>{t('file.replace')}</button>
            <button className="btn btn--ghost" onClick={() => setReport(null)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirmReplace} title={t('file.replaceTitle')} danger confirmLabel={t('file.replaceConfirm')}
        message={<p>{t('file.replaceMsg')}</p>}
        onCancel={() => setConfirmReplace(false)} onConfirm={() => { setConfirmReplace(false); void apply('replace'); }} />
    </section>
  );
}

function StorageSection() {
  const { unreadable } = useData();
  const [status, setStatus] = useState<string>('…');
  const [usage, setUsage] = useState<string>('');
  const refresh = async () => {
    const s = await persistenceStatus();
    setStatus(s === 'persistent' ? t('storage.persistent') : s === 'best-effort' ? t('storage.bestEffort') : t('storage.unknown'));
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) setUsage(t('storage.used', (est.usage / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })));
  };
  useEffect(() => { void refresh(); }, []);
  return (
    <section className="card settings-card" aria-labelledby="storage-h">
      <h2 id="storage-h">{t('storage.title')}</h2>
      <p role="status">{status} <span className="muted">{usage}</span></p>
      <div className="settings-actions">
        <button className="btn" onClick={() => void requestPersistence().then(refresh)}>{t('storage.ask')}</button>
      </div>
      <p className="muted small">{t('storage.android')}</p>
      <p className="muted small">{t('storage.ipad')}</p>
      {unreadable > 0 && <p className="warn-text">{t('storage.unreadable', unreadable)}</p>}
    </section>
  );
}
