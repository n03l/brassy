import type { SeqNote } from '../music/sequence';
import { fingering, valveCaption } from '../music/fingering';
import { noteName, spokenName } from '../music/pitch';
import { ValveDiagram } from '../ui/ValveDiagram';
import { t } from '../i18n';

export function NowPlaying({ note, playing, compact }: { note: SeqNote | undefined; playing: boolean; compact?: boolean }) {
  const valves = note ? fingering(note.pitch) : undefined;
  return (
    <section className={`card now${compact ? ' now--compact' : ''}`} aria-labelledby="now-h">
      <h2 id="now-h" className="side-h">{playing ? t('now.playing') : t('now.first')}</h2>
      {note ? (
        <>
          <p className="now-name" aria-label={spokenName(note.pitch)}>
            {noteName(note.pitch)}<span className="now-oct">{note.pitch.octave}</span>
          </p>
          <ValveDiagram valves={valves} />
          <p className="now-caption">{valveCaption(valves)}</p>
        </>
      ) : (
        <p className="muted">{t('now.none')}</p>
      )}
    </section>
  );
}

export function UpNext({ notes }: { notes: SeqNote[] }) {
  return (
    <section className="card upnext" aria-labelledby="next-h">
      <h2 id="next-h" className="side-h">{t('next.title')}</h2>
      {notes.length === 0 ? (
        <p className="muted">{t('next.end')}</p>
      ) : (
        <ol className="upnext-list">
          {notes.map((n) => {
            const v = fingering(n.pitch);
            return (
              <li key={n.id} className="upnext-item">
                <span className="upnext-name" aria-label={`${spokenName(n.pitch)}, ${valveCaption(v)}`}>{noteName(n.pitch)}</span>
                <ValveDiagram valves={v} size="small" />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
