import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../app/data';
import { SHORT_COMMIT, SOURCE_URL } from '../app/version';
import { routeHref } from '../app/router';
import type { Song } from '../model/types';
import { SongPreview } from '../ui/SongPreview';
import { Icon } from '../ui/Icon';
import { AddSongDialog } from './AddSongDialog';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { deleteSong, saveSong } from '../db/repo';
import { duplicateSong, renameSong } from '../model/songOps';
import { thisWeek } from '../music/week';
import { partForBar, songParts } from '../music/parts';
import { toMusicXml } from '../io/musicxmlWrite';
import { downloadBytes, fileName } from '../io/download';
import { useToast } from '../ui/Toast';
import { LIMITS } from '../model/limits';
import { t } from '../i18n';

export function Library() {
  const { songs, ready, recentPractice, unreadable } = useData();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Song | null>(null);
  const [deleting, setDeleting] = useState<Song | null>(null);
  const [exporting, setExporting] = useState<Song | null>(null);
  const toast = useToast();

  const week = useMemo(() => thisWeek(recentPractice), [recentPractice]);
  const keepGoing = useMemo(() => {
    const last = [...recentPractice].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    const song = last && songs.find((s) => s.id === last.songId);
    if (!last || !song) return null;
    const part = partForBar(songParts(song), last.lastBar - 1);
    return { songId: song.id, label: part ? t('lib.keepGoingPart', part.index) : t('lib.keepGoing') };
  }, [recentPractice, songs]);

  if (!ready) return null;
  const stars = week.filter((d) => d.practised).length;

  return (
    <div className="library">
      <div className="lib-head">
        <h1>{t('lib.greeting')}</h1>
        <section className="week card" aria-label={t('lib.weekAria', stars)}>
          <h2 className="side-h">{t('lib.thisWeek')}</h2>
          <ol className="week-days">
            {week.map((d) => (
              <li key={d.day} className={`day${d.practised ? ' day--done' : ''}${d.today ? ' day--today' : ''}`}
                aria-label={t('lib.dayAria', d.label, d.today, d.practised)}>
                <span className="day-circle">{d.practised ? <Icon name="star" size={22} /> : null}</span>
                <span className="day-label" aria-hidden="true">{d.short}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {unreadable > 0 && (
        <p className="warn-text" role="alert">
          {t('lib.unreadable', unreadable)}
        </p>
      )}

      <ul className="song-grid">
        {songs.map((s) => (
          <li key={s.id}>
            <SongCard song={s} chip={keepGoing?.songId === s.id ? keepGoing.label : undefined}
              onRename={() => setRenaming(s)}
              onDuplicate={async () => {
                try {
                  await saveSong(duplicateSong(s), { version: true });
                  toast({ message: t('lib.copied') });
                } catch (e) {
                  toast({ message: e instanceof Error ? e.message : t('lib.copyFailed'), tone: 'warn' });
                }
              }}
              onExport={() => setExporting(s)}
              onDelete={() => setDeleting(s)} />
          </li>
        ))}
        <li>
          <button className="add-card" onClick={() => setAdding(true)}>
            <span className="add-plus"><Icon name="plus" size={36} strokeWidth={3} /></span>
            {t('lib.add')}
          </button>
        </li>
      </ul>
      {songs.length === 0 && <p className="muted empty-hint">{t('lib.empty')}</p>}

      <p className="lib-foot muted">
        <a href={routeHref({ name: 'about' })}>{t('lib.about')}</a>
        <a className="lib-source" href={SOURCE_URL} rel="noopener noreferrer" aria-label={SHORT_COMMIT ? t('lib.sourceAria', SHORT_COMMIT) : t('about.github')}>
          <Icon name="github" size={20} />{SHORT_COMMIT && <code>{SHORT_COMMIT}</code>}
        </a>
      </p>

      <AddSongDialog open={adding} onClose={() => setAdding(false)} />
      <RenameDialog song={renaming} onClose={() => setRenaming(null)} />
      <ExportDialog song={exporting} onClose={() => setExporting(null)} />
      <ConfirmDialog
        open={!!deleting}
        title={t('lib.deleteTitle')}
        message={<p>{t('lib.deleteMsg', deleting?.title ?? '')}</p>}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const s = deleting;
          setDeleting(null);
          if (!s) return;
          try {
            await deleteSong(s.id);
            toast({ message: t('lib.deleted') });
          } catch (e) {
            toast({ message: e instanceof Error ? e.message : t('lib.deleteFailed'), tone: 'warn' });
          }
        }}
      />
    </div>
  );
}

function SongCard({ song, chip, onRename, onDuplicate, onExport, onDelete }: {
  song: Song; chip?: string; onRename: () => void; onDuplicate: () => void; onExport: () => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && menuRef.current?.contains(e.target as Node)) return;
      setMenu(false);
      if (e instanceof KeyboardEvent) btnRef.current?.focus();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    menuRef.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);
  const pick = (fn: () => void) => () => { setMenu(false); fn(); };
  return (
    <article className="song-card card">
      <a className="song-card-link" href={routeHref({ name: 'player', songId: song.id })}>
        <SongPreview song={song} />
        <h3 className="song-card-title">{song.title}</h3>
        <p className="muted song-card-meta">{t('lib.meta', song.bars.length, song.tempo)}</p>
        {chip && <span className="chip"><Icon name="play" size={14} /> {chip}</span>}
      </a>
      <div className="song-card-menu" ref={menuRef}>
        <button ref={btnRef} className="btn btn--icon btn--ghost" aria-haspopup="menu" aria-expanded={menu}
          aria-label={t('lib.more', song.title)} onClick={() => setMenu((m) => !m)}>
          <Icon name="more" size={28} strokeWidth={4} />
        </button>
        {menu && (
          <div className="menu card" role="menu">
            <button role="menuitem" className="menu-item" onClick={pick(onRename)}><Icon name="edit" size={20} /> {t('lib.rename')}</button>
            <button role="menuitem" className="menu-item" onClick={pick(onDuplicate)}><Icon name="plus" size={20} /> {t('lib.duplicate')}</button>
            <button role="menuitem" className="menu-item" onClick={pick(onExport)}><Icon name="download" size={20} /> {t('lib.export')}</button>
            <button role="menuitem" className="menu-item menu-item--warn" onClick={pick(onDelete)}><Icon name="trash" size={20} /> {t('common.delete')}</button>
          </div>
        )}
      </div>
    </article>
  );
}

function RenameDialog({ song, onClose }: { song: Song | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const toast = useToast();
  useEffect(() => setName(song?.title ?? ''), [song]);
  return (
    <Dialog open={!!song} onClose={onClose} title={t('lib.renameTitle')}>
      <form className="dialog-body" onSubmit={async (e) => {
        e.preventDefault();
        if (!song) return;
        try {
          await saveSong(renameSong(song, name), { version: true });
          onClose();
        } catch (err) {
          toast({ message: err instanceof Error ? err.message : t('common.savingFailed'), tone: 'warn' });
        }
      }}>
        <label className="field">
          {t('lib.newName')}
          <input className="input" value={name} maxLength={LIMITS.titleMaxChars} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn--primary" disabled={!name.trim()}>{t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ExportDialog({ song, onClose }: { song: Song | null; onClose: () => void }) {
  const toast = useToast();
  const run = async (kind: 'xml' | 'gp' | 'midi') => {
    if (!song) return;
    try {
      if (kind === 'xml') downloadBytes(toMusicXml(song), fileName(song.title, 'musicxml'), 'application/vnd.recordare.musicxml+xml');
      else {
        const m = await import('../io/exportAlphaTab');
        if (kind === 'gp') downloadBytes(m.toGuitarPro(song), fileName(song.title, 'gp'), 'application/octet-stream');
        else downloadBytes(m.toMidiFile(song), fileName(song.title, 'mid'), 'audio/midi');
      }
      onClose();
    } catch {
      toast({ message: t('lib.exportFailed'), tone: 'warn' });
    }
  };
  return (
    <Dialog open={!!song} onClose={onClose} title={t('lib.exportTitle')}>
      <div className="dialog-body export-list">
        <button className="btn" onClick={() => void run('xml')}><Icon name="download" /> {t('lib.exportXml')}</button>
        <button className="btn" onClick={() => void run('gp')}><Icon name="download" /> {t('lib.exportGp')}</button>
        <button className="btn" onClick={() => void run('midi')}><Icon name="download" /> {t('lib.exportMidi')}</button>
      </div>
    </Dialog>
  );
}
