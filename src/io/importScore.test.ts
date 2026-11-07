import { describe, expect, it } from 'vitest';
import seedXml from '../../public/songs/when-the-saints.musicxml?raw';
import { ImportError, pitchKind, readScore, scoreToSong } from './importScore';
import { toMidi } from '../music/pitch';
import { barCapacity, barTicks } from '../music/duration';

const seedBytes = () => new TextEncoder().encode(seedXml);

describe('import the seed song', () => {
  const score = readScore(seedBytes());

  it('recognises a B♭ trumpet part', () => {
    expect(pitchKind(score)).toBe('trumpet');
  });

  it('keeps written pitches, structure and markers', () => {
    const { song, warnings } = scoreToSong(score, { concertPitch: false });
    expect(warnings).toEqual([]);
    expect(song.title).toBe('When the Saints Go Marching In');
    expect(song.tempo).toBe(100);
    expect([song.beats, song.beatType]).toEqual([4, 4]);
    expect(song.bars).toHaveLength(16);
    const first = song.bars[0]!.events;
    expect(first[0]!.rest).toBe(true);
    expect(first.slice(1).map((e) => toMidi(e.pitch!))).toEqual([60, 64, 65]); // C4 E4 F4 as written
    expect(song.bars[0]!.marker).toBe('A');
    expect(song.bars[7]!.doubleBar).toBe(true);
    expect(song.bars[8]).toMatchObject({ marker: 'B', repeatOpen: true });
    expect(song.bars[14]).toMatchObject({ ending: [1], repeatClose: 2 });
    expect(song.bars[15]!.ending).toEqual([2]);
    expect(song.bars[9]!.events[0]).toMatchObject({ duration: 'half', dotted: true });
    for (const bar of song.bars) expect(barTicks(bar.events)).toBe(barCapacity(song));
  });

  it('transposes up 2 semitones when the user says it is concert pitch', () => {
    const { song } = scoreToSong(score, { concertPitch: true });
    // concert Bb3 (sounding pitch of the written C4) → written C4 again
    expect(toMidi(song.bars[0]!.events[1]!.pitch!)).toBe(60);
  });
});

describe('unreadable files', () => {
  it('rejects empty and garbage files with friendly errors', () => {
    expect(() => readScore(new Uint8Array())).toThrow(ImportError);
    expect(() => readScore(new TextEncoder().encode('<html><img src=x onerror=alert(1)></html>'))).toThrow(ImportError);
  });
});
