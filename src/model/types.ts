/** Our own song model. It is the source of truth; alphaTab only renders and plays what we generate from it. */

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type Alter = -1 | 0 | 1;

/** WRITTEN pitch for B♭ trumpet (sounds a major 2nd lower). */
export type Pitch = { step: Step; alter: Alter; octave: number };

export type Duration = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

/** `tie: true` means this note continues the previous note (same pitch, no new attack). */
export type NoteEvent = { id: string; rest: boolean; pitch?: Pitch; duration: Duration; dotted: boolean; tie?: true };

export type Bar = {
  id: string;
  events: NoteEvent[];
  repeatOpen?: boolean;
  /** Times the repeated section is played (2 = play twice). */
  repeatClose?: number;
  /** Volta numbers, e.g. [1] or [1, 2]. */
  ending?: number[];
  marker?: string;
  doubleBar?: boolean;
  /** A pickup (anacrusis): this bar may be shorter than the time signature, e.g. the notes before the first full bar. */
  pickup?: true;
};

export type Song = {
  id: string;
  title: string;
  tempo: number;
  beats: number;
  beatType: number;
  bars: Bar[];
  createdAt: string;
  updatedAt: string;
};

export const STEPS: readonly Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const DURATIONS: readonly Duration[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];

/** One practice session (at least some playback). */
export type PracticeEntry = {
  id: string;
  songId: string;
  /** Local calendar day, YYYY-MM-DD, used for the "This week" stars. */
  day: string;
  startedAt: string;
  seconds: number;
  /** Highest playback speed in percent. */
  topSpeed: number;
  loops: number;
  /** Bar range played last (1-based, inclusive), for the "Keep going" chip. */
  lastBar: number;
};

export type Tombstone = { id: string; deletedAt: string };
