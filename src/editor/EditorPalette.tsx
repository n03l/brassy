import type { Duration, NoteEvent } from '../model/types';
import { Icon } from '../ui/Icon';
import { ValveDiagram } from '../ui/ValveDiagram';
import { fingering } from '../music/fingering';
import { noteName, spokenName } from '../music/pitch';
import { t } from '../i18n';

export type PaletteAction =
  | { kind: 'step'; delta: 1 | -1 }
  | { kind: 'alter'; alter: -1 | 0 | 1 }
  | { kind: 'duration'; duration: Duration }
  | { kind: 'dot' }
  | { kind: 'rest' }
  | { kind: 'tie' }
  | { kind: 'insert' }
  | { kind: 'delete' };

const LENGTHS: { d: Duration; label: () => string; key: string }[] = [
  { d: 'whole', label: () => t('pal.whole'), key: '1' },
  { d: 'half', label: () => t('pal.half'), key: '2' },
  { d: 'quarter', label: () => t('pal.quarter'), key: '3' },
  { d: 'eighth', label: () => t('pal.eighth'), key: '4' },
];

/** Little note glyphs for the length buttons (drawn, not font characters). */
function NoteGlyph({ d }: { d: Duration }) {
  const hollow = d === 'whole' || d === 'half';
  return (
    <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true">
      <ellipse cx="9" cy="27" rx="7" ry="5" transform="rotate(-20 9 27)" fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="2.4" />
      {d !== 'whole' && <line x1="15.5" y1="26" x2="15.5" y2="3" stroke="currentColor" strokeWidth="2.4" />}
      {d === 'eighth' && <path d="M15.5 3 q6 6 5 13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

/** A small tie arc between two note heads. */
function TieGlyph() {
  return (
    <svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">
      <ellipse cx="6" cy="14" rx="4.5" ry="3.5" fill="currentColor" />
      <ellipse cx="24" cy="14" rx="4.5" ry="3.5" fill="currentColor" />
      <path d="M6 8 Q15 1 24 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function EditorPalette({ event, canTie, onAction }: { event: NoteEvent | undefined; canTie: boolean; onAction: (a: PaletteAction) => void }) {
  const none = !event;
  const isNote = !!event && !event.rest && !!event.pitch;
  const valves = isNote ? fingering(event.pitch!) : undefined;
  return (
    <div className="palette card" role="toolbar" aria-label={t('pal.toolbar')}>
      <section className="pal-group pal-note" aria-label={t('pal.note')}>
        <h3 className="pal-h">{t('pal.note')}</h3>
        <div className="pal-note-row">
          <div className="pal-updown">
            <button className="btn btn--big" disabled={!isNote} onClick={() => onAction({ kind: 'step', delta: 1 })} aria-label={t('pal.higher')}>
              <Icon name="up" size={28} strokeWidth={3} /> <span className="pal-word">{t('pal.higher')}</span>
            </button>
            <button className="btn btn--big" disabled={!isNote} onClick={() => onAction({ kind: 'step', delta: -1 })} aria-label={t('pal.lower')}>
              <Icon name="down" size={28} strokeWidth={3} /> <span className="pal-word">{t('pal.lower')}</span>
            </button>
          </div>
          <div className="pal-name" aria-live="polite" aria-label={isNote ? spokenName(event.pitch!) : event ? t('note.rest') : t('note.nothing')}>
            {isNote ? noteName(event.pitch!) : event ? t('note.rest') : '—'}
            {isNote && <span className="now-oct">{event.pitch!.octave}</span>}
          </div>
          <div className="pal-valves">
            <ValveDiagram valves={valves} size="small" />
          </div>
        </div>
      </section>

      <section className="pal-group" aria-label={t('pal.length')}>
        <h3 className="pal-h">{t('pal.length')}</h3>
        <div className="pal-row pal-len-row">
          {LENGTHS.map((l) => (
            <button key={l.d} className="btn pal-len" disabled={none} aria-pressed={event?.duration === l.d}
              aria-label={t('pal.withKey', l.label(), l.key)} onClick={() => onAction({ kind: 'duration', duration: l.d })}>
              <NoteGlyph d={l.d} /> <span className="pal-word">{l.label()}</span>
            </button>
          ))}
          <button className="btn pal-len" disabled={none} aria-pressed={!!event?.dotted} aria-label={t('pal.withKey', t('pal.dot'), '.')} onClick={() => onAction({ kind: 'dot' })}>
            <span className="dot-glyph" aria-hidden="true" /> <span className="pal-word">{t('pal.dot')}</span>
          </button>
        </div>
      </section>

      <section className="pal-group" aria-label={t('pal.sign')}>
        <h3 className="pal-h">{t('pal.sign')}</h3>
        <div className="pal-row pal-len-row">
          <button className="btn pal-sign" disabled={!isNote} aria-pressed={event?.pitch?.alter === 1} aria-label={t('pal.sharp')} onClick={() => onAction({ kind: 'alter', alter: 1 })}>♯</button>
          <button className="btn pal-sign" disabled={!isNote} aria-pressed={event?.pitch?.alter === -1} aria-label={t('pal.flat')} onClick={() => onAction({ kind: 'alter', alter: -1 })}>♭</button>
          <button className="btn pal-sign" disabled={!isNote} aria-pressed={isNote && event.pitch!.alter === 0} aria-label={t('pal.natural')} onClick={() => onAction({ kind: 'alter', alter: 0 })}>♮</button>
        </div>
      </section>

      <section className="pal-group" aria-label={t('pal.change')}>
        <h3 className="pal-h">{t('pal.change')}</h3>
        <div className="pal-row pal-change">
          <button className="btn" disabled={none} onClick={() => onAction({ kind: 'rest' })}>{event?.rest ? t('pal.makeNote') : t('pal.makeRest')}</button>
          <button className="btn pal-tie" disabled={!canTie} aria-pressed={!!event?.tie} onClick={() => onAction({ kind: 'tie' })}>
            <TieGlyph /> {t('pal.tie')}
          </button>
          <button className="btn pal-insert" disabled={none} onClick={() => onAction({ kind: 'insert' })}><Icon name="plus" /> {t('pal.insert')}</button>
          <button className="btn pal-delete" disabled={none} onClick={() => onAction({ kind: 'delete' })}><Icon name="trash" /> {t('common.delete')}</button>
        </div>
      </section>
    </div>
  );
}
