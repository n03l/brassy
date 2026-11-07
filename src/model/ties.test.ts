import { describe, expect, it } from 'vitest';
import * as alphaTab from '@coderline/alphatab';
import { assertCanonical, cleanSongTies, normalizeSong } from './normalize';
import { sampleSong } from '../../test/fixtures';
import type { NoteEvent, Pitch, Song } from './types';
import { toAlphaTex } from '../music/alphatex';
import { toMusicXml } from '../io/musicxmlWrite';
import { readScore, scoreToSong } from '../io/importScore';
import { toMidiFile } from '../io/exportAlphaTab';
import * as ops from '../editor/ops';
import { notesInOrder, nowAndNext } from '../music/sequence';

const G4: Pitch = { step: 'G', alter: 0, octave: 4 };
const A4: Pitch = { step: 'A', alter: 0, octave: 4 };
let n = 0;
const note = (pitch: Pitch, duration: NoteEvent['duration'], extra: Partial<NoteEvent> = {}): NoteEvent => ({
  id: `e${++n}`, rest: false, pitch, duration, dotted: false, ...extra,
});
const rest = (duration: NoteEvent['duration']): NoteEvent => ({ id: `e${++n}`, rest: true, duration, dotted: false });

/** 2/4: G4 dotted quarter tied over the barline to an eighth, then a tie inside the bar. */
function tiedSong(): Song {
  return {
    ...sampleSong(),
    beats: 2,
    beatType: 4,
    bars: [
      { id: 'b1', events: [note(A4, 'eighth'), note(G4, 'quarter', { dotted: true })] },
      { id: 'b2', events: [note(G4, 'eighth', { tie: true }), note(A4, 'eighth'), note(A4, 'quarter', { tie: true })] },
    ],
  };
}

const ties = (s: Song) => s.bars.map((b) => b.events.map((e) => !!e.tie));
const bytes = (s: string) => new TextEncoder().encode(s);

describe('ties in the model', () => {
  it('keeps valid ties, also over the barline', () => {
    const s = tiedSong();
    const { song, repairs } = normalizeSong(structuredClone(s));
    expect(repairs).toEqual([]);
    expect(song).toEqual(s);
    expect(() => assertCanonical(s)).not.toThrow();
  });

  it('drops ties that cannot hold (hostile data)', () => {
    const raw = {
      ...sampleSong(),
      bars: [
        { id: 'b1', events: [note(G4, 'quarter', { tie: true }), rest('quarter'), { ...note(G4, 'quarter'), tie: 'yes' }, note(A4, 'quarter', { tie: true })] },
        { id: 'b2', events: [{ ...rest('quarter'), tie: true }, note(G4, 'quarter', { tie: true }), note(G4, 'half')] },
        { id: 'b3', events: [] },
        { id: 'b4', events: [note(G4, 'whole', { tie: true })] },
      ],
    };
    const { song, repairs } = normalizeSong(raw);
    expect(repairs).toContain('broken ties removed');
    expect(ties(song)).toEqual([[false, false, false, false], [false, false, false], [], [false]]);
    expect(() => assertCanonical(song)).not.toThrow();
  });

  it('gives a tied note the spelling of the note it continues', () => {
    const s = { ...sampleSong(), bars: [{ id: 'b', events: [note({ step: 'A', alter: 1, octave: 4 }, 'half'), note({ step: 'B', alter: -1, octave: 4 }, 'half', { tie: true })] }] };
    const { song } = normalizeSong(s);
    expect(song.bars[0]!.events[1]).toMatchObject({ tie: true, pitch: { step: 'A', alter: 1, octave: 4 } });
  });
});

describe('ties in alphaTab', () => {
  it('writes {t} and {t d} and alphaTab reads them back', () => {
    const s = tiedSong();
    s.bars[1]!.events[2] = { ...s.bars[1]!.events[2]!, duration: 'eighth', dotted: true };
    const tex = toAlphaTex(s);
    expect(tex).toContain('G4{t}');
    expect(tex).toContain('A4{t d}');
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex);
    const beats = score.tracks[0]!.staves[0]!.bars.flatMap((b) => b.voices[0]!.beats);
    expect(beats.map((b) => b.notes[0]?.isTieDestination ?? false)).toEqual([false, false, true, false, true]);
    expect(beats.map((b) => b.dots)).toEqual([0, 1, 0, 0, 1]);
  });

  it('plays a tied pair as one note', () => {
    const file = new alphaTab.midi.MidiFile();
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(toAlphaTex(tiedSong()));
    new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), new alphaTab.midi.AlphaSynthMidiFileHandler(file)).generate();
    const ons = file.tracks.flatMap((t) => t.events).filter((e) => e instanceof alphaTab.midi.NoteOnEvent && e.noteVelocity > 0);
    expect(ons).toHaveLength(3); // A, G (held into bar 2), A (held)
    expect(toMidiFile(tiedSong()).byteLength).toBeGreaterThan(0);
  });
});

describe('ties in MusicXML', () => {
  it('round-trips ties without warnings', () => {
    const s = tiedSong();
    const xml = toMusicXml(s);
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tied type="stop"/>');
    const back = scoreToSong(readScore(bytes(xml)), { concertPitch: false });
    expect(back.warnings).toEqual([]);
    expect(ties(back.song)).toEqual(ties(s));
  });

  it('imports a tie written by another program', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Trumpet</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>-2</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>
<note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>3</duration><tie type="start"/><type>quarter</type><dot/><notations><tied type="start"/></notations></note>
</measure>
<measure number="2">
<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><type>eighth</type><notations><tied type="stop"/></notations></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration><type>quarter</type><dot/></note>
</measure></part></score-partwise>`;
    const { song, warnings } = scoreToSong(readScore(bytes(xml)), { concertPitch: false });
    expect(warnings).toEqual([]);
    expect(ties(song)).toEqual([[false, false], [true, false]]);
  });
});

describe('ties in the editor and player', () => {
  it('toggles a tie, matching the pitch before', () => {
    const s = { ...sampleSong(), bars: [{ id: 'b', events: [note(G4, 'half'), note(A4, 'half')] }] };
    expect(ops.canTie(s, { bar: 0, event: 0 })).toBe(false);
    expect(ops.toggleTie(s, { bar: 0, event: 0 })).toBe(s);
    const on = ops.toggleTie(s, { bar: 0, event: 1 });
    expect(on.bars[0]!.events[1]).toMatchObject({ tie: true, pitch: G4 });
    expect(() => assertCanonical(on)).not.toThrow();
    const off = ops.toggleTie(on, { bar: 0, event: 1 });
    expect(off.bars[0]!.events[1]!.tie).toBeUndefined();
  });

  it('refuses a rest, and edits that break a tie drop it', () => {
    const s = { ...sampleSong(), bars: [{ id: 'b', events: [note(G4, 'quarter'), rest('quarter'), note(G4, 'half')] }] };
    expect(ops.canTie(s, { bar: 0, event: 1 })).toBe(false);
    expect(ops.canTie(s, { bar: 0, event: 2 })).toBe(false);
    const t = tiedSong();
    const moved = cleanSongTies(ops.stepPitch(t, { bar: 1, event: 0 }, 1));
    expect(moved.bars[1]!.events[0]!.tie).toBeUndefined();
    expect(() => assertCanonical(moved)).not.toThrow();
    const deleted = cleanSongTies(ops.deleteEvent(t, { bar: 0, event: 1 }).song);
    expect(deleted.bars[1]!.events[0]!.tie).toBeUndefined();
    const copy = ops.insertAfter(t, { bar: 1, event: 2 }).song;
    expect(copy.bars[1]!.events[3]!.tie).toBeUndefined();
    expect(cleanSongTies(t)).toBe(t);
  });

  it('shows a tied note as the note still sounding', () => {
    const s = tiedSong();
    const seq = notesInOrder(s);
    expect(seq).toHaveLength(3);
    const { now, next } = nowAndNext(seq, { bar: 1, event: 0 }, 4, true);
    expect(now?.ref).toEqual({ bar: 0, event: 1 });
    expect(next[0]?.ref).toEqual({ bar: 1, event: 1 });
    expect(nowAndNext(seq, { bar: 1, event: 2 }, 4, true).now?.ref).toEqual({ bar: 1, event: 1 });
  });
});
