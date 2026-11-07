import * as alphaTab from '@coderline/alphatab';
import { LIMITS } from '../model/limits';
import { newId } from '../model/ids';
import { cleanText, normalizeSong, restsForTicks } from '../model/normalize';
import type { Bar, Duration, NoteEvent, Pitch, Song } from '../model/types';
import { fromMidi } from '../music/pitch';
import { barCapacity } from '../music/duration';
import { t } from '../i18n';

type Score = alphaTab.model.Score;
const { NoteAccidentalMode, Duration: AtDuration, GraceType, BarLineStyle } = alphaTab.model;

export const IMPORT_EXTENSIONS = ['.musicxml', '.xml', '.mxl', '.gp', '.gpx', '.gp3', '.gp4', '.gp5'] as const;

export class ImportError extends Error {}

export function hasImportExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return IMPORT_EXTENSIONS.some((e) => lower.endsWith(e));
}

/** Parse a MusicXML / Guitar Pro file with alphaTab. Throws ImportError with a child-friendly message. */
export function readScore(bytes: Uint8Array): Score {
  if (bytes.byteLength > LIMITS.importFileMaxBytes) throw new ImportError(t('import.tooBig'));
  if (bytes.byteLength === 0) throw new ImportError(t('import.empty'));
  let score: Score;
  // Unreadable files are expected here and get our own message, so silence alphaTab's global logger meanwhile.
  const level = alphaTab.Logger.logLevel;
  alphaTab.Logger.logLevel = alphaTab.LogLevel.None;
  try {
    score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings());
  } catch {
    throw new ImportError(t('import.unreadable'));
  } finally {
    alphaTab.Logger.logLevel = level;
  }
  if (!score.tracks.length || !score.tracks[0]!.staves.length || !score.masterBars.length) {
    throw new ImportError(t('import.noMusic'));
  }
  return score;
}

/** How the first part is pitched. */
export type PitchKind = 'trumpet' | 'concert' | 'other-transposition';

export function pitchKind(score: Score): PitchKind {
  const staff = score.tracks[0]!.staves[0]!;
  // B♭ trumpet: sounds 2 semitones below written. alphaTab keeps notes at sounding pitch and shows them
  // shifted back by the display transposition (MusicXML <transpose chromatic="-2">), or transposes the staff.
  const shift = staff.displayTranspositionPitch !== 0 ? staff.displayTranspositionPitch : -staff.transpositionPitch;
  if (shift === -2) return 'trumpet';
  if (shift === 0) return 'concert';
  return 'other-transposition';
}

export type ConvertOptions = {
  /** true: the file is concert pitch and must be written 2 semitones higher for B♭ trumpet. */
  concertPitch: boolean;
  fallbackTitle?: string;
  now?: string;
};

export type ConvertResult = { song: Song; warnings: string[] };

const DURATION_MAP = new Map<number, Duration>([
  [AtDuration.Whole, 'whole'],
  [AtDuration.Half, 'half'],
  [AtDuration.Quarter, 'quarter'],
  [AtDuration.Eighth, 'eighth'],
  [AtDuration.Sixteenth, 'sixteenth'],
]);

/**
 * Convert the first track's first staff and voice into our model. Whatever we can't represent is simplified or
 * skipped, and listed in `warnings` (child-friendly, for the import dialog).
 */
export function scoreToSong(score: Score, opts: ConvertOptions): ConvertResult {
  const now = opts.now ?? new Date().toISOString();
  const skipped = new Set<string>();
  const track = score.tracks[0]!;
  const staff = track.staves[0]!;
  if (score.tracks.length > 1) skipped.add(t('skip.otherParts'));
  if (track.staves.length > 1) skipped.add(t('skip.staves'));

  const first = score.masterBars[0]!;
  const beats = Math.min(LIMITS.beatsMax, Math.max(LIMITS.beatsMin, first.timeSignatureNumerator));
  const beatType = LIMITS.beatTypes.includes(first.timeSignatureDenominator) ? first.timeSignatureDenominator : 4;
  if (beats !== first.timeSignatureNumerator || beatType !== first.timeSignatureDenominator) skipped.add(t('skip.timeSig'));
  if (score.masterBars.some((mb) => mb.timeSignatureNumerator !== first.timeSignatureNumerator || mb.timeSignatureDenominator !== first.timeSignatureDenominator)) {
    skipped.add(t('skip.timeSigChanges'));
  }
  if (score.masterBars.some((mb, i) => i > 0 && mb.tempoAutomations.length > 0)) skipped.add(t('skip.tempoChanges'));

  const shift = opts.concertPitch ? 2 : 0;
  const masterBars = score.masterBars.slice(0, LIMITS.barsMax);
  if (score.masterBars.length > LIMITS.barsMax) skipped.add(t('skip.barsAfter', LIMITS.barsMax));

  const bars: Bar[] = masterBars.map((mb, i) => {
    const sbar = staff.bars[i];
    const bar: Bar = { id: newId(), events: [] };
    if (mb.isRepeatStart) bar.repeatOpen = true;
    if (mb.repeatCount > 0) bar.repeatClose = Math.min(LIMITS.repeatTimesMax, Math.max(LIMITS.repeatTimesMin, mb.repeatCount));
    if (mb.alternateEndings) {
      const nums: number[] = [];
      for (let n = 1; n <= LIMITS.endingMax; n++) if (mb.alternateEndings & (1 << (n - 1))) nums.push(n);
      if (nums.length) bar.ending = nums.slice(0, LIMITS.endingsPerBarMax);
    }
    if (mb.section) {
      const m = cleanText(mb.section.text || mb.section.marker, LIMITS.markerMaxChars);
      if (m) bar.marker = m;
    }
    if (mb.isAnacrusis) bar.pickup = true;
    if (mb.isDoubleBar || sbar?.barLineRight === BarLineStyle.LightLight) bar.doubleBar = true;
    if (!sbar) return bar;
    if (sbar.voices.slice(1).some((v) => !v.isEmpty && v.beats.some((b) => !b.isRest))) skipped.add(t('skip.voices'));
    const keyFlat = sbar.keySignature + (opts.concertPitch ? 2 : 0) < 0;
    for (const beat of sbar.voices[0]?.beats ?? []) {
      if (beat.graceType !== GraceType.None) {
        skipped.add(t('skip.grace'));
        continue;
      }
      if (beat.hasTuplet) skipped.add(t('skip.tuplets'));
      let duration = DURATION_MAP.get(beat.duration);
      if (!duration) {
        duration = beat.duration < AtDuration.Whole ? 'whole' : 'sixteenth';
        skipped.add(t('skip.lengths'));
      }
      if (beat.dots > 1) skipped.add(t('skip.doubleDots'));
      const ev: NoteEvent = { id: newId(), rest: true, duration, dotted: beat.dots >= 1 };
      if (!beat.isRest && beat.notes.length > 0) {
        if (beat.notes.length > 1) skipped.add(t('skip.chords'));
        const note = beat.notes.reduce((a, b) => (b.displayValue > a.displayValue ? b : a));
        const written = (opts.concertPitch ? note.realValue : note.displayValue) + shift;
        if (written < LIMITS.storedMidiMin || written > LIMITS.storedMidiMax) {
          skipped.add(t('skip.range'));
        } else {
          ev.rest = false;
          ev.pitch = spell(written, note.accidentalMode, keyFlat, opts.concertPitch);
          if (note.isTieDestination) ev.tie = true;
        }
      }
      if (bar.events.length < LIMITS.eventsPerBarMax) bar.events.push(ev);
      else skipped.add(t('skip.crowded'));
    }
    if (bar.events.length === 0 || (sbar.voices[0]?.isEmpty ?? true)) {
      bar.events = restsForTicks(barCapacity({ beats, beatType }));
    }
    return bar;
  });

  const raw = {
    id: newId(),
    title: cleanText(score.title, LIMITS.titleMaxChars) || cleanText(opts.fallbackTitle, LIMITS.titleMaxChars) || t('song.newFromFile'),
    tempo: score.tempo,
    beats,
    beatType,
    bars,
    createdAt: now,
    updatedAt: now,
  };
  const { song } = normalizeSong(raw, now);
  return { song, warnings: [...skipped] };
}

function spell(midi: number, mode: alphaTab.model.NoteAccidentalMode, keyFlat: boolean, transposed: boolean): Pitch {
  // A forced spelling refers to the written note; after transposing concert pitch it no longer applies.
  if (!transposed && (mode === NoteAccidentalMode.ForceFlat || mode === NoteAccidentalMode.ForceDoubleFlat)) return fromMidi(midi, 'flat');
  if (!transposed && (mode === NoteAccidentalMode.ForceSharp || mode === NoteAccidentalMode.ForceDoubleSharp)) return fromMidi(midi, 'sharp');
  return fromMidi(midi, keyFlat ? 'flat' : 'sharp');
}

/** Strip the extension, for a title when the file has none. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
}
