import { describe, expect, it } from 'vitest';
import { assertCanonical, normalizeSong, SongFormatError } from './normalize';
import { hostileSongRaw, sampleSong } from '../../test/fixtures';
import { LIMITS } from './limits';
import { toAlphaTex } from '../music/alphatex';
import * as alphaTab from '@coderline/alphatab';

describe('normalizeSong', () => {
  it('leaves a valid song unchanged', () => {
    const s = sampleSong();
    const { song, repairs } = normalizeSong(structuredClone(s));
    expect(song).toEqual(s);
    expect(repairs).toEqual([]);
    expect(() => assertCanonical(s)).not.toThrow();
  });

  it('repairs hostile data into something every screen can use', () => {
    const { song, repairs } = normalizeSong(hostileSongRaw(), '2026-11-08T00:00:00.000Z');
    expect(repairs.length).toBeGreaterThan(0);
    expect(song.id).not.toBe('__proto__');
    expect(song.title).not.toMatch(/[\n\u0007]/);
    expect(song.title.length).toBeLessThanOrEqual(LIMITS.titleMaxChars);
    expect(song.beats).toBe(LIMITS.beatsMax);
    expect(song.beatType).toBe(4);
    expect(song.tempo).toBe(100);
    expect(song.createdAt).toBe(new Date('03/04/2025').toISOString());
    expect(song.updatedAt).toBe(song.createdAt);
    const ids = [song.id, ...song.bars.map((b) => b.id), ...song.bars.flatMap((b) => b.events.map((e) => e.id))];
    expect(new Set(ids).size).toBe(ids.length);
    expect(song.bars).toHaveLength(3);
    expect(song.bars[0]!.ending).toEqual([1, 3]);
    expect(song.bars[0]!.repeatClose).toBe(LIMITS.repeatTimesMax);
    expect(song.bars[0]!.marker!.length).toBeLessThanOrEqual(LIMITS.markerMaxChars);
    const evs = song.bars[0]!.events;
    expect(evs).toHaveLength(3);
    expect(evs.every((e) => e.rest)).toBe(true); // bad step, bad alter, octave 12
    expect(evs[1]!.duration).toBe('quarter');
    expect(evs[2]!.dotted).toBe(false);
    // normalising again is stable, and alphaTab can render the result
    expect(normalizeSong(structuredClone(song)).song).toEqual(song);
    expect(() => assertCanonical(song)).not.toThrow();
    expect(alphaTab.importer.ScoreLoader.loadAlphaTex(toAlphaTex(song)).masterBars).toHaveLength(3);
  });

  it('gives an empty song one bar of rests', () => {
    const { song } = normalizeSong({ ...sampleSong(), bars: [] });
    expect(song.bars).toHaveLength(1);
    expect(song.bars[0]!.events).toEqual([expect.objectContaining({ rest: true, duration: 'whole' })]);
  });

  it('caps oversized songs at the limits', () => {
    const big = sampleSong();
    big.bars = Array.from({ length: LIMITS.barsMax + 5 }, (_, i) => ({
      id: `b${i}`,
      events: Array.from({ length: LIMITS.eventsPerBarMax + 3 }, (_, j) => ({ id: `e${i}-${j}`, rest: true, duration: 'sixteenth' as const, dotted: false })),
    }));
    const { song } = normalizeSong(big);
    expect(song.bars).toHaveLength(LIMITS.barsMax);
    expect(song.bars[0]!.events).toHaveLength(LIMITS.eventsPerBarMax);
  });

  it('rejects things that are not songs', () => {
    expect(() => normalizeSong(null)).toThrow(SongFormatError);
    expect(() => normalizeSong([])).toThrow(SongFormatError);
    expect(() => normalizeSong({ title: 'x' })).toThrow(SongFormatError);
  });
});
