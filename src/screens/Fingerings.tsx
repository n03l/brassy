import { useEffect, useMemo, useRef, useState } from 'react';
import { chartNotes, fingering, valveCaption } from '../music/fingering';
import { noteName, spokenName, toMidi } from '../music/pitch';
import { ValveDiagram } from '../ui/ValveDiagram';
import { useData } from '../app/data';
import { useCurrentSongId } from '../app/currentSong';
import { ScoreController } from '../player/ScoreController';
import type { Song } from '../model/types';
import { t } from '../i18n';

/** A hidden one-note-per-bar score so tapping a card can play that note with the trumpet sound. */
function chartSong(): Song {
  const now = new Date(0).toISOString();
  return {
    id: 'fingering-chart', title: 'Chart', tempo: 100, beats: 4, beatType: 4, createdAt: now, updatedAt: now,
    bars: chartNotes().map((p, i) => ({ id: `b${i}`, events: [{ id: `n${i}`, rest: false, pitch: p, duration: 'whole', dotted: false }] })),
  };
}

export function Fingerings() {
  const { songs } = useData();
  const currentId = useCurrentSongId();
  const song = songs.find((s) => s.id === currentId);
  const used = useMemo(() => {
    const set = new Set<number>();
    song?.bars.forEach((b) => b.events.forEach((e) => { if (!e.rest && e.pitch) set.add(toMidi(e.pitch)); }));
    return set;
  }, [song]);
  const notes = useMemo(() => chartNotes(), []);

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctl = useRef<ScoreController | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const c = new ScoreController(hostRef.current!, scrollRef.current!, { onReady: () => setReady(true) }, { player: true, editing: true });
    c.setSong(chartSong());
    ctl.current = c;
    return () => c.destroy();
  }, []);

  return (
    <div className="fingerings">
      <div className="fing-head">
        <h1>{t('fing.title')}</h1>
        <p className="muted">
          {song ? t('fing.inSong', song.title) : t('fing.openSong')} {ready ? t('fing.tap') : t('fing.loading')}
        </p>
      </div>
      <ul className="fing-grid">
        {notes.map((p, i) => {
          const v = fingering(p);
          const inSong = used.has(toMidi(p));
          return (
            <li key={i}>
              <button className={`fing-card card${inSong ? ' fing-card--used' : ''}`} disabled={!ready}
                aria-label={t('fing.cardAria', spokenName(p), valveCaption(v), inSong)}
                onClick={() => ctl.current?.previewBeat({ bar: i, event: 0 })}>
                <span className="fing-name">{noteName(p)}<span className="now-oct">{p.octave}</span></span>
                <ValveDiagram valves={v} size="small" />
                <span className="fing-cap">{v && v.length ? v.join(' + ') : t('valves.openShort')}</span>
                {inSong && <span className="fing-badge">{t('fing.badge')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="offscreen" aria-hidden="true">
        <div ref={scrollRef}><div ref={hostRef} /></div>
      </div>
    </div>
  );
}
