import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../app/data';
import { navigate, routeHref } from '../app/router';
import type { Song } from '../model/types';
import { ScoreController, type EventRef } from '../player/ScoreController';
import { NowPlaying, UpNext } from '../player/NowPlaying';
import { Transport } from '../player/Transport';
import { usePractice } from '../player/usePractice';
import { notesInOrder, nowAndNext } from '../music/sequence';
import { partForBar, songParts } from '../music/parts';
import { Icon } from '../ui/Icon';
import { setCurrentSong } from '../app/currentSong';
import { LoopOverlay, type LoopRange } from '../player/LoopOverlay';
import { LoopPanel } from '../player/LoopPanel';
import { bumpy, DEFAULT_LADDER, loopDone, normalizeLadder, startLadder, type LadderConfig, type LadderState } from '../player/ladder';
import { getMeta, setMeta } from '../db/db';
import { t } from '../i18n';

export function PlayerScreen({ songId }: { songId: string }) {
  const { songs, ready } = useData();
  const song = songs.find((s) => s.id === songId);
  if (!ready) return null;
  if (!song) return <NotFound />;
  return <Player key={song.id} song={song} />;
}

function NotFound() {
  return (
    <section className="empty card">
      <h2>{t('common.songNotFound')}</h2>
      <a className="btn btn--primary" href={routeHref({ name: 'library' })}>{t('common.backToSongs')}</a>
    </section>
  );
}

function Player({ song }: { song: Song }) {
  useEffect(() => setCurrentSong(song.id), [song.id]);
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctl = useRef<ScoreController | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<EventRef | null>(null);
  const [speed, setSpeed] = useState(100);
  const [click, setClick] = useState(false);
  const [sound, setSound] = useState(true);
  const [loopRange, setLoopRange] = useState<LoopRange | null>(null);
  const [ladder, setLadder] = useState<LadderState>(() => startLadder(100));
  const [ladderCfg, setLadderCfg] = useState<LadderConfig>(DEFAULT_LADDER);
  const [renderTick, setRenderTick] = useState(0);
  const [totalLoops, setTotalLoops] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastTick = useRef(0);
  const loopRef = useRef<{ range: LoopRange | null; playing: boolean; cfg: LadderConfig }>({ range: null, playing: false, cfg: DEFAULT_LADDER });
  loopRef.current = { range: loopRange, playing, cfg: ladderCfg };

  useEffect(() => {
    void getMeta<Record<string, unknown>>('settings').then((s) => setLadderCfg(normalizeLadder(s?.ladder))).catch(() => undefined);
  }, []);
  const changeLadderCfg = (c: LadderConfig) => {
    setLadderCfg(c);
    void getMeta<Record<string, unknown>>('settings')
      .then((s) => setMeta('settings', { ...(s && typeof s === 'object' ? s : {}), ladder: c }))
      .catch(() => undefined);
  };

  useEffect(() => {
    const c = new ScoreController(hostRef.current!, scrollRef.current!, {
      onReady: () => setReady(true),
      onPlayingChange: setPlaying,
      onCurrent: setCurrent,
      onTap: (ref) => ctl.current?.seekTo(ref),
      onError: (m) => setError(m),
      onRendered: () => setRenderTick((t) => t + 1),
      onPosition: (tick) => {
        const { range, playing: isPlaying, cfg } = loopRef.current;
        // alphaTab jumped back to the loop start by itself (it reports that as a seek too): one loop done.
        if (range && isPlaying && !ctl.current?.recentlySeeked && tick + 480 < lastTick.current) {
          setLadder((l) => loopDone(l, cfg));
          setTotalLoops((n) => n + 1);
        }
        lastTick.current = tick;
      },
    }, { player: true });
    ctl.current = c;
    if (import.meta.env.DEV) (window as unknown as { __brassy?: ScoreController }).__brassy = c;
    c.setSong(song);
    return () => {
      c.destroy();
      ctl.current = null;
    };
    // The song is fixed for this component (keyed by id); edits happen in the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ctl.current) ctl.current.speed = speed;
  }, [speed, ready]);
  // The ladder drives the speed while looping.
  useEffect(() => {
    if (loopRange) setSpeed(ladder.speed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladder.speed]);
  useEffect(() => {
    ctl.current?.setLoop(loopRange);
  }, [loopRange, renderTick]);

  function changeSpeed(v: number) {
    setSpeed(v);
    if (loopRange) setLadder((l) => ({ ...l, speed: v }));
  }

  function toggleLoop() {
    const c = ctl.current;
    if (!c) return;
    if (loopRange) {
      setLoopRange(null);
      return;
    }
    // Default: the bars currently on screen.
    const scroll = scrollRef.current!;
    const hostTop = hostRef.current!.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
    const inView = c.barsInView(scroll.scrollTop - hostTop, scroll.scrollTop - hostTop + scroll.clientHeight);
    const range = inView ?? { first: 0, last: Math.min(3, Math.max(0, c.barCount - 1)) };
    setLoopRange(range);
    setLadder(startLadder(speed));
    const cur = c.currentRef;
    if (!cur || cur.bar < range.first || cur.bar > range.last) c.seekTo({ bar: range.first, event: 0 });
  }

  useEffect(() => {
    if (ctl.current) ctl.current.metronome = click;
  }, [click, ready]);
  useEffect(() => {
    if (ctl.current) ctl.current.trumpet = sound;
  }, [sound, ready]);

  usePractice(song.id, playing, speed, totalLoops, current?.bar ?? 0);

  // Space bar plays/pauses (when focus isn't on another control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target === document.body || e.target === scrollRef.current)) {
        e.preventDefault();
        if (ready) ctl.current?.playPause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready]);

  const seq = useMemo(() => notesInOrder(song), [song]);
  const held = !!(current && song.bars[current.bar]?.events[current.event]?.tie);
  const { now, next } = nowAndNext(seq, current, 4, held);
  const parts = useMemo(() => songParts(song), [song]);
  const part = partForBar(parts, current?.bar ?? 0);

  return (
    <div className="player">
      <header className="screen-head">
        <a className="btn btn--icon" href={routeHref({ name: 'library' })} aria-label={t('player.backToSongs')}>
          <Icon name="back" />
        </a>
        <div className="screen-title">
          <h1 className="song-title">{song.title}</h1>
          <p className="muted subtitle">
            {part ? t('player.subtitle', part.label, part.firstBar + 1, part.lastBar + 1) : ''}
          </p>
        </div>
        <button className="btn" onClick={() => { ctl.current?.pause(); navigate({ name: 'editor', songId: song.id }); }}>
          <Icon name="edit" /> {t('player.edit')}
        </button>
      </header>

      <div className="player-body">
        <section className="card score-card" aria-label={t('player.music')}>
          {error && <p className="warn-text score-msg" role="alert">{t('player.renderError', error)}</p>}
          {!ready && !error && <p className="muted score-msg" aria-live="polite">{t('player.warming')}</p>}
          <div className="score-scroll" ref={scrollRef} tabIndex={-1}>
            <div className="score-wrap">
              <div className="score-host" ref={hostRef} />
              {loopRange && ctl.current && (
                <LoopOverlay ctl={ctl.current} range={loopRange} renderTick={renderTick} onChange={setLoopRange} />
              )}
            </div>
          </div>
        </section>
        <aside className="side">
          <NowPlaying note={now} playing={playing || current !== null} compact={!!loopRange} />
          {loopRange ? (
            <LoopPanel range={loopRange} ladder={ladder} cfg={ladderCfg} onCfg={changeLadderCfg}
              onBumpy={() => setLadder(bumpy)} onStop={() => setLoopRange(null)} />
          ) : (
            <UpNext notes={next} />
          )}
        </aside>
      </div>

      <Transport
        ready={ready}
        tempo={song.tempo}
        playing={playing}
        speed={speed}
        loop={!!loopRange}
        click={click}
        sound={sound}
        onRestart={() => ctl.current?.restart()}
        onPlayPause={() => ctl.current?.playPause()}
        onSpeed={changeSpeed}
        onLoop={toggleLoop}
        onClick={() => setClick((c) => !c)}
        onSound={() => setSound((s) => !s)}
      />
    </div>
  );
}
