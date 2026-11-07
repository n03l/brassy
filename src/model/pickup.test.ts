import { describe, expect, it } from 'vitest';
import * as alphaTab from '@coderline/alphatab';
import { assertCanonical, normalizeSong } from './normalize';
import { sampleSong } from '../../test/fixtures';
import type { NoteEvent, Pitch, Song } from './types';
import { toAlphaTex } from '../music/alphatex';
import { toMusicXml } from '../io/musicxmlWrite';
import { readScore, scoreToSong } from '../io/importScore';
import { canBePickup, checkBars } from '../music/barCheck';
import * as ops from '../editor/ops';

const D4: Pitch = { step: 'D', alter: 0, octave: 4 };
const G4: Pitch = { step: 'G', alter: 0, octave: 4 };
let n = 0;
const note = (pitch: Pitch, duration: NoteEvent['duration']): NoteEvent => ({ id: `p${++n}`, rest: false, pitch, duration, dotted: false });

/** 2/4 like Bella Ciao: a 3-eighth pickup, one full bar, and a 1-eighth closing bar. */
function pickupSong(): Song {
  return {
    ...sampleSong(),
    beats: 2,
    beatType: 4,
    bars: [
      { id: 'b1', pickup: true, events: [note(D4, 'eighth'), note(G4, 'eighth'), note(G4, 'eighth')] },
      { id: 'b2', events: [note(G4, 'quarter'), note(D4, 'quarter')] },
      { id: 'b3', pickup: true, events: [note(G4, 'eighth')] },
    ],
  };
}
const bytes = (s: string) => new TextEncoder().encode(s);

describe('pickup bars', () => {
  it('are kept by the loader, and only a literal true counts', () => {
    const s = pickupSong();
    expect(normalizeSong(structuredClone(s)).song).toEqual(s);
    expect(() => assertCanonical(s)).not.toThrow();
    const odd = normalizeSong({ ...s, bars: s.bars.map((b) => ({ ...b, pickup: 'yes' })) }).song;
    expect(odd.bars.some((b) => 'pickup' in b)).toBe(false);
  });

  it('may be short, but not empty or too long', () => {
    expect(checkBars(pickupSong())).toEqual([]);
    const s = pickupSong();
    s.bars[0] = { ...s.bars[0]!, events: [] };
    s.bars[2] = { ...s.bars[2]!, events: [note(G4, 'half'), note(G4, 'eighth')] };
    expect(checkBars(s).map((i) => [i.bar, i.kind])).toEqual([[0, 'short'], [2, 'long']]);
  });

  it('play for their real length, and bar numbers stay ours', () => {
    const tex = toAlphaTex(pickupSong());
    expect(tex).toContain('\\ac');
    expect(tex).toContain('\\barnumber 2');
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex);
    expect(score.masterBars.map((m) => m.isAnacrusis)).toEqual([true, false, true]);
    const file = new alphaTab.midi.MidiFile();
    new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), new alphaTab.midi.AlphaSynthMidiFileHandler(file)).generate();
    const ticks = file.tracks.flatMap((t) => t.events).filter((e) => e instanceof alphaTab.midi.NoteOnEvent && e.noteVelocity > 0).map((e) => e.tick);
    expect(ticks).toEqual([0, 480, 960, 1440, 2400, 3360]);
  });

  it('round-trip through MusicXML as implicit measures', () => {
    const s = pickupSong();
    const xml = toMusicXml(s);
    expect(xml).toContain('<measure number="1" implicit="yes">');
    const back = scoreToSong(readScore(bytes(xml)), { concertPitch: false });
    expect(back.warnings).toEqual([]);
    expect(back.song.bars.map((b) => !!b.pickup)).toEqual([true, false, true]);
    expect(checkBars(back.song)).toEqual([]);
  });

  it('can be switched on for a short first or last bar only', () => {
    const s = pickupSong();
    s.bars = s.bars.map((b) => ({ ...b, pickup: undefined }));
    const plain = normalizeSong(s).song;
    expect(canBePickup(plain, 0)).toBe(true);
    expect(canBePickup(plain, 1)).toBe(false); // full bar, and in the middle
    expect(canBePickup(plain, 2)).toBe(true);
    const on = ops.togglePickup(plain, 0);
    expect(on.bars[0]!.pickup).toBe(true);
    expect(checkBars(on).map((i) => i.bar)).toEqual([2]);
    expect(() => assertCanonical(on)).not.toThrow();
    expect(ops.togglePickup(on, 0).bars[0]!.pickup).toBeUndefined();
  });
});
