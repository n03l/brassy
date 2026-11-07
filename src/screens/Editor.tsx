import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../app/data';
import { navigate, routeHref } from '../app/router';
import { registerFlush } from '../app/flush';
import type { Song } from '../model/types';
import { ScoreController } from '../player/ScoreController';
import { useHistory } from '../editor/useHistory';
import * as ops from '../editor/ops';
import { EditorPalette, type PaletteAction } from '../editor/EditorPalette';
import { canBePickup, canLengthenLast, checkBars, fillLabel, issueMessage } from '../music/barCheck';
import { listVersions, saveSong } from '../db/repo';
import type { SongVersion } from '../db/db';
import { Icon } from '../ui/Icon';
import { setCurrentSong } from '../app/currentSong';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { WriterLostError } from '../db/db';
import { LIMITS } from '../model/limits';
import { cleanSongTies } from '../model/normalize';
import { locale, t } from '../i18n';

export function EditorScreen({ songId }: { songId: string }) {
  const { songs, ready } = useData();
  // Take the song once when the editor opens; from then on the editor's own copy is the truth.
  const [initial] = useState(() => songs.find((s) => s.id === songId));
  const found = initial ?? songs.find((s) => s.id === songId);
  if (!ready) return null;
  if (!found) {
    return (
      <section className="empty card">
        <h2>{t('common.songNotFound')}</h2>
        <a className="btn btn--primary" href={routeHref({ name: 'library' })}>{t('common.backToSongs')}</a>
      </section>
    );
  }
  return <Editor key={found.id} initial={found} />;
}

const SAVE_DELAY = 500;

function Editor({ initial: initialProp }: { initial: Song }) {
  const [initial] = useState(initialProp);
  const h = useHistory(initial);
  useEffect(() => setCurrentSong(initial.id), [initial.id]);
  const { song, sel } = h;
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctl = useRef<ScoreController | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const toast = useToast();
  const previewNext = useRef(false);

  /* ---------- alphaTab ---------- */
  useEffect(() => {
    const c = new ScoreController(hostRef.current!, scrollRef.current!, {
      onRendered: () => setRenderTick((t) => t + 1),
      onTap: (ref) => h.select(ref),
    }, { player: true, editing: true });
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    c.setSong(song);
    if (previewNext.current && sel) c.previewBeat(sel);
    previewNext.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  /* ---------- autosave (debounced) + versions ---------- */
  const pending = useRef<Song | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const s = pending.current;
    if (!s) return;
    pending.current = null;
    setSaveState('saving');
    try {
      await saveSong(s, { version: true });
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      if (!(e instanceof WriterLostError)) toast({ message: t('edit.saveFailed'), tone: 'warn' });
    }
  }, [toast]);
  useEffect(() => registerFlush(flush), [flush]);
  useEffect(() => {
    if (song === initial) return;
    pending.current = song;
    setSaveState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  }, [song, initial, flush]);
  useEffect(() => () => void flush(), [flush]);

  /* ---------- editing ---------- */
  const commit = useCallback((next: Song, nextSel = sel, preview = true) => {
    if (next === song) return;
    previewNext.current = preview;
    // Edits can break a tie (new pitch, rest, delete…); drop those so the saved song stays canonical.
    h.apply({ ...cleanSongTies(next), updatedAt: new Date().toISOString() }, nextSel);
  }, [song, sel, h]);

  const act = useCallback((a: PaletteAction) => {
    if (!sel) return;
    switch (a.kind) {
      case 'step': return commit(ops.stepPitch(song, sel, a.delta));
      case 'alter': return commit(ops.setAlter(song, sel, a.alter));
      case 'duration': return commit(ops.setDuration(song, sel, a.duration));
      case 'dot': return commit(ops.toggleDot(song, sel));
      case 'rest': return commit(ops.toggleRest(song, sel));
      case 'tie': return commit(ops.toggleTie(song, sel));
      case 'insert': {
        const r = ops.insertAfter(song, sel);
        return commit(r.song, r.sel);
      }
      case 'delete': {
        const r = ops.deleteEvent(song, sel);
        if (r.song === song) return;
        commit(r.song, r.sel, false);
        toast({ message: t('edit.noteDeleted'), action: { label: t('edit.undo'), run: h.undo } });
        return;
      }
    }
  }, [sel, song, commit, toast, h.undo]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, dialog[open], .loop-handle')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? h.redo : h.undo)(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); h.redo(); return; }
      if (mod || e.altKey) return;
      const map: Record<string, () => void> = {
        ArrowLeft: () => h.select(ops.moveSelection(song, sel, -1)),
        ArrowRight: () => h.select(ops.moveSelection(song, sel, 1)),
        ArrowUp: () => act({ kind: 'step', delta: 1 }),
        ArrowDown: () => act({ kind: 'step', delta: -1 }),
        '1': () => act({ kind: 'duration', duration: 'whole' }),
        '2': () => act({ kind: 'duration', duration: 'half' }),
        '3': () => act({ kind: 'duration', duration: 'quarter' }),
        '4': () => act({ kind: 'duration', duration: 'eighth' }),
        '.': () => act({ kind: 'dot' }),
        Delete: () => act({ kind: 'delete' }),
        Backspace: () => act({ kind: 'delete' }),
      };
      const fn = Object.prototype.hasOwnProperty.call(map, e.key) ? map[e.key] : undefined;
      if (fn) {
        // Arrow keys on a focused button would otherwise scroll; the editor owns them.
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [song, sel, act, h]);

  /* ---------- bar check ---------- */
  const issues = useMemo(() => checkBars(song), [song]);
  const firstIssue = issues[0];

  const done = async () => {
    await flush();
    navigate({ name: 'player', songId: song.id }, { replace: true });
  };

  const event = ops.eventAt(song, sel);
  const c = ctl.current;
  void renderTick;
  const selBox = c && sel ? c.beatBounds(sel) : null;

  return (
    <div className="editor">
      <header className="screen-head">
        <button className="btn btn--icon" onClick={() => void done()} aria-label={t('edit.back')}><Icon name="back" /></button>
        <div className="screen-title">
          <h1 className="song-title">{song.title}</h1>
          <p className="subtitle">
            <span className="badge">{t('edit.badge')}</span>
            <span className="muted save-state" aria-live="polite">
              {saveState === 'saving' ? t('edit.saving') : saveState === 'error' ? t('edit.notSaved') : t('edit.saved')}
            </span>
          </p>
        </div>
        <div className="head-tools">
          <button className="btn btn--icon" onClick={h.undo} disabled={!h.canUndo} aria-label={t('edit.undo')}><Icon name="undo" /></button>
          <button className="btn btn--icon" onClick={h.redo} disabled={!h.canRedo} aria-label={t('edit.redo')}><Icon name="redo" /></button>
          <button className="btn head-versions" onClick={() => setVersionsOpen(true)}>{t('edit.versions')}</button>
          <button className="btn btn--primary" onClick={() => void done()}><Icon name="check" /> {t('edit.done')}</button>
        </div>
      </header>

      <section className="card score-card editor-score" aria-label={t('edit.musicAria')}>
        {firstIssue && (
          <div className="barcheck" role="status">
            <Icon name="warn" />
            <div className="barcheck-text">
              <strong>{issueMessage(firstIssue, song)}</strong>
              {issues.length > 1 && <span className="muted small"> {t('edit.moreBars', issues.length - 1)}</span>}
            </div>
            <div className="barcheck-fixes">
              {firstIssue.kind === 'short' ? (
                <>
                  <button className="btn btn--small" onClick={() => commit(ops.fillWithRests(song, firstIssue.bar), sel, false)}>{fillLabel(firstIssue)}</button>
                  {!song.bars[firstIssue.bar]!.pickup && canBePickup(song, firstIssue.bar) && (
                    <button className="btn btn--small" onClick={() => commit(ops.togglePickup(song, firstIssue.bar), sel, false)}>{t('edit.makePickup')}</button>
                  )}
                  {canLengthenLast(song.bars[firstIssue.bar]!, firstIssue) && (
                    <button className="btn btn--small" onClick={() => commit(ops.lengthenLast(song, firstIssue.bar), sel, false)}>{t('edit.lengthen')}</button>
                  )}
                </>
              ) : (
                <button className="btn btn--small" onClick={() => commit(ops.moveExtraToNext(song, firstIssue.bar), sel, false)}>{t('edit.moveExtra')}</button>
              )}
              <button className="btn btn--small btn--ghost" onClick={() => {
                const b = song.bars[firstIssue.bar]!;
                h.select(b.events.length ? { bar: firstIssue.bar, event: 0 } : ops.moveSelection(song, { bar: firstIssue.bar, event: 0 }, -1));
              }}>{t('edit.showMe')}</button>
            </div>
          </div>
        )}
        <div className="score-scroll" ref={scrollRef}>
          <div className="score-wrap">
            <div className="score-host" ref={hostRef} />
            {c && (
              <div className="edit-layer" aria-hidden="true">
                {issues.map((i) => {
                  const b = c.barBounds(i.bar);
                  return b ? <div key={i.bar} className="bar-issue" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} /> : null;
                })}
                {selBox && <div className="sel-box" style={{ left: selBox.x - 6, top: selBox.y - 6, width: selBox.w + 12, height: selBox.h + 12 }} />}
              </div>
            )}
          </div>
        </div>
        <div className="editor-foot">
          <button className="btn btn--small add-bar" aria-label={t('edit.addBar')} onClick={() => commit(ops.addBar(song), sel, false)}>
            <Icon name="plus" size={20} /> <span className="add-bar-word">{t('edit.addBar')}</span>
          </button>
          <div className="tempo-edit" role="group" aria-label={t('edit.tempoGroup')}>
            <span className="tempo-label">{t('edit.tempo')}</span>
            <button className="btn btn--small btn--icon" aria-label={t('edit.slower')} disabled={song.tempo <= LIMITS.tempoMin}
              onClick={() => commit(ops.stepTempo(song, -1), sel, false)}><Icon name="minus" size={20} /></button>
            <output className="tempo-value" aria-live="polite" aria-label={t('edit.tempoAria', song.tempo)}>♩ = {song.tempo}</output>
            <button className="btn btn--small btn--icon" aria-label={t('edit.faster')} disabled={song.tempo >= LIMITS.tempoMax}
              onClick={() => commit(ops.stepTempo(song, 1), sel, false)}><Icon name="plus" size={20} /></button>
          </div>
          {sel && (song.bars[sel.bar]?.pickup || canBePickup(song, sel.bar)) && (
            <button className="btn btn--small" aria-pressed={!!song.bars[sel.bar]!.pickup}
              onClick={() => commit(ops.togglePickup(song, sel.bar), sel, false)}>{t('edit.pickup')}</button>
          )}
          {!sel && <span className="muted tap-hint">{t('edit.tapHint')}</span>}
        </div>
      </section>

      <EditorPalette event={event} canTie={ops.canTie(song, sel)} onAction={act} />

      <VersionsDialog open={versionsOpen} songId={song.id} onClose={() => setVersionsOpen(false)}
        onRestore={(v) => { setVersionsOpen(false); commit({ ...v.song, id: song.id }, null, false); toast({ message: t('edit.restored') }); }} />
    </div>
  );
}

function VersionsDialog({ open, songId, onClose, onRestore }: {
  open: boolean; songId: string; onClose: () => void; onRestore: (v: SongVersion) => void;
}) {
  const [versions, setVersions] = useState<SongVersion[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setVersions(null);
    void listVersions(songId).then(setVersions, () => setVersions([]));
  }, [open, songId]);
  return (
    <Dialog open={open} onClose={onClose} title={t('versions.title')}>
      <div className="dialog-body">
        <p className="muted">{t('versions.intro')}</p>
        {versions === null ? <p>{t('versions.loading')}</p> : versions.length === 0 ? <p>{t('versions.none')}</p> : (
          <ul className="version-list">
            {versions.map((v) => (
              <li key={v.vid}>
                <span>
                  <strong>{new Date(v.savedAt).toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</strong>
                  <span className="muted small"> · {t('versions.bars', v.song.bars.length)}</span>
                </span>
                <button className="btn btn--small" onClick={() => onRestore(v)}>{t('versions.use')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
