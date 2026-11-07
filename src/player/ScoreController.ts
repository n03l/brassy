import * as alphaTab from '@coderline/alphatab';
import type { Song } from '../model/types';
import { toAlphaTex } from '../music/alphatex';

type Beat = alphaTab.model.Beat;

/** Position of a note in our model. */
export type EventRef = { bar: number; event: number };

export type ControllerEvents = {
  onReady?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  onCurrent?: (ref: EventRef | null) => void;
  onPosition?: (tick: number, endTick: number, isSeek: boolean) => void;
  onTap?: (ref: EventRef) => void;
  onRendered?: () => void;
  onFinished?: () => void;
  onError?: (message: string) => void;
};

const BASE = import.meta.env.BASE_URL;

/**
 * Owns one alphaTab instance. The score is always generated from our Song via alphaTex, so alphaTab beat
 * (bar i, beat j) is song.bars[i].events[j] (empty bars are padded with rests that map to no event).
 */
export class ScoreController {
  readonly api: alphaTab.AlphaTabApi;
  private song: Song | null = null;
  private events: ControllerEvents;
  private current: EventRef | null = null;
  private fadedFrom: EventRef | null = null;
  private styleEl: HTMLStyleElement;
  private destroyed = false;
  private userSeekAt = 0;
  private trumpetOn = true;

  constructor(host: HTMLElement, scrollEl: HTMLElement, events: ControllerEvents, opts: { player: boolean; editing?: boolean }) {
    this.events = events;
    const s = new alphaTab.Settings();
    s.core.fontDirectory = `${BASE}font/`;
    s.core.includeNoteBounds = true;
    s.core.enableLazyLoading = false;
    s.display.staveProfile = alphaTab.StaveProfile.Score;
    s.display.layoutMode = alphaTab.LayoutMode.Page;
    s.display.scale = host.clientWidth < 600 ? 0.85 : 1.1;
    for (const el of [
      alphaTab.NotationElement.ScoreTitle, alphaTab.NotationElement.ScoreSubTitle, alphaTab.NotationElement.ScoreArtist,
      alphaTab.NotationElement.ScoreAlbum, alphaTab.NotationElement.ScoreWords, alphaTab.NotationElement.ScoreMusic,
      alphaTab.NotationElement.ScoreWordsAndMusic, alphaTab.NotationElement.ScoreCopyright, alphaTab.NotationElement.TrackNames,
      alphaTab.NotationElement.GuitarTuning, alphaTab.NotationElement.EffectDynamics,
    ]) s.notation.elements.set(el, false);
    s.player.playerMode = opts.player ? alphaTab.PlayerMode.EnabledSynthesizer : alphaTab.PlayerMode.Disabled;
    s.player.soundFont = `${BASE}soundfont/sonivox.sf2`;
    s.player.scrollElement = scrollEl;
    s.player.scrollMode = alphaTab.ScrollMode.Continuous;
    s.player.scrollOffsetY = -40;
    s.player.enableCursor = opts.player && !opts.editing;
    s.player.enableAnimatedBeatCursor = false;
    s.player.enableElementHighlighting = !opts.editing;
    s.player.enableSeekToClick = false;
    s.player.enablePlaybackRangeSelection = false;
    this.api = new alphaTab.AlphaTabApi(host, s);

    this.styleEl = document.createElement('style');
    host.parentElement?.appendChild(this.styleEl);

    const api = this.api;
    // Ready = sounds loaded, notes drawn, and the timing map (tickCache) built for the current score.
    let soundOk = !opts.player, rendered = false, midiOk = !opts.player;
    const check = () => {
      if (soundOk && rendered && midiOk) this.events.onReady?.();
    };
    api.playerReady.on(() => { soundOk = true; check(); });
    api.midiLoaded.on(() => {
      this.applyTrumpet();
      midiOk = true;
      check();
    });
    api.renderFinished.on(() => { rendered = true; check(); });
    api.playerStateChanged.on((e) => this.events.onPlayingChange?.(e.state === alphaTab.synth.PlayerState.Playing));
    api.playedBeatChanged.on((beat) => this.setCurrent(this.refOf(beat)));
    api.playerPositionChanged.on((e) => this.events.onPosition?.(e.currentTick, e.endTick, e.isSeek));
    api.playerFinished.on(() => this.events.onFinished?.());
    api.beatMouseDown.on((beat) => {
      const ref = this.refOf(beat);
      if (ref) this.events.onTap?.(ref);
    });
    api.postRenderFinished.on(() => {
      this.applyFade();
      this.events.onRendered?.();
    });
    api.error.on((e) => this.events.onError?.(e.message));
  }

  setSong(song: Song) {
    this.song = song;
    this.api.tex(toAlphaTex(song));
  }

  /** Map an alphaTab beat to our event; padded beats of empty bars map to null. */
  refOf(beat: Beat | null | undefined): EventRef | null {
    if (!beat || !this.song) return null;
    const bar = beat.voice.bar.index;
    const event = beat.index;
    const b = this.song.bars[bar];
    if (!b || event >= b.events.length) return null;
    return { bar, event };
  }

  beatOf(ref: EventRef): Beat | null {
    const bar = this.api.score?.tracks[0]?.staves[0]?.bars[ref.bar];
    return bar?.voices[0]?.beats[ref.event] ?? null;
  }

  get currentRef(): EventRef | null {
    return this.current;
  }

  private setCurrent(ref: EventRef | null) {
    this.current = ref;
    this.fadedFrom = ref;
    this.applyFade();
    this.events.onCurrent?.(ref);
  }

  /**
   * Fade every note before the current one (in score order). Done with one CSS rule per bar range, so a
   * re-render (resize) keeps the effect without touching the SVG.
   */
  private applyFade() {
    const score = this.api.score;
    const ref = this.fadedFrom;
    if (!score || !ref) {
      this.styleEl.textContent = '';
      return;
    }
    const bars = score.tracks[0]?.staves[0]?.bars ?? [];
    const sel: string[] = [];
    for (let i = 0; i <= ref.bar && i < bars.length; i++) {
      const beats = bars[i]!.voices[0]?.beats ?? [];
      const end = i < ref.bar ? beats.length : ref.event;
      for (let j = 0; j < end; j++) sel.push(`.score-host .b${beats[j]!.id}`);
    }
    this.styleEl.textContent = sel.length ? `${sel.join(',')}{opacity:.35}` : '';
  }

  clearFade() {
    this.fadedFrom = null;
    this.applyFade();
  }

  play() {
    this.api.play();
  }
  pause() {
    this.api.pause();
  }
  playPause() {
    this.api.playPause();
  }

  /** Back to the start (or loop start) and clear the faded notes. */
  restart() {
    this.userSeekAt = performance.now();
    this.api.stop();
    this.setCurrent(null);
  }

  seekTo(ref: EventRef) {
    const beat = this.beatOf(ref);
    const cache = this.api.tickCache;
    if (!beat || !cache) return;
    this.userSeekAt = performance.now();
    this.api.tickPosition = cache.getBeatStart(beat);
    this.setCurrent(ref);
  }

  /** True right after a seek we asked for (so a jump back isn't counted as a finished loop). */
  get recentlySeeked(): boolean {
    return performance.now() - this.userSeekAt < 500;
  }

  set speed(percent: number) {
    this.api.playbackSpeed = percent / 100;
  }

  set metronome(on: boolean) {
    this.api.metronomeVolume = on ? 1 : 0;
  }

  /** Trumpet sound on/off. Off still moves the highlight and cursor (play along silently, or with the click). */
  set trumpet(on: boolean) {
    this.trumpetOn = on;
    this.applyTrumpet();
  }

  private applyTrumpet() {
    const tracks = this.api.score?.tracks;
    if (tracks?.length) this.api.changeTrackMute(tracks, !this.trumpetOn);
  }

  /** Loop whole bars [first, last] (0-based), or clear with null. */
  setLoop(range: { first: number; last: number } | null) {
    const score = this.api.score;
    const cache = this.api.tickCache;
    if (!range || !score || !cache) {
      this.api.playbackRange = null;
      this.api.isLooping = false;
      return;
    }
    const first = score.masterBars[range.first];
    const last = score.masterBars[range.last];
    if (!first || !last) return;
    const startTick = cache.getMasterBarStart(first);
    const endTick = cache.getMasterBarStart(last) + last.calculateDuration();
    this.api.playbackRange = { startTick, endTick } as alphaTab.synth.PlaybackRange;
    this.api.isLooping = true;
  }

  /** Bounds of a beat relative to the score host, for overlays. */
  beatBounds(ref: EventRef) {
    const beat = this.beatOf(ref);
    return beat ? (this.api.boundsLookup?.findBeat(beat)?.visualBounds ?? null) : null;
  }

  barBounds(index: number) {
    return this.api.boundsLookup?.findMasterBarByIndex(index)?.realBounds ?? null;
  }

  get barCount(): number {
    return this.api.score?.masterBars.length ?? 0;
  }

  /** The bar at (or nearest to) a point in score-host coordinates. */
  barAt(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.barCount; i++) {
      const b = this.barBounds(i);
      if (!b) continue;
      const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - b.x - b.w : 0;
      const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - b.y - b.h : 0;
      const d = dx + dy * 4; // prefer the same line
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Bars fully or mostly inside a vertical window [top, bottom] (score-host coordinates). */
  barsInView(top: number, bottom: number): { first: number; last: number } | null {
    let first = -1;
    let last = -1;
    for (let i = 0; i < this.barCount; i++) {
      const b = this.barBounds(i);
      if (!b) continue;
      const mid = b.y + b.h / 2;
      if (mid >= top && mid <= bottom) {
        if (first < 0) first = i;
        last = i;
      }
    }
    return first < 0 ? null : { first, last };
  }

  get playbackRangeStartTick(): number {
    return this.api.playbackRange?.startTick ?? 0;
  }

  set tickPosition(t: number) {
    this.api.tickPosition = t;
  }

  /** Play one written note briefly through the trumpet sound (used by the editor and fingering chart). */
  previewBeat(ref: EventRef) {
    const beat = this.beatOf(ref);
    if (beat && !beat.isRest && beat.notes[0]) this.api.playNote(beat.notes[0]);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.styleEl.remove();
    this.api.destroy();
  }
}
