import { describe, expect, it } from 'vitest';
import { partForBar, songParts } from './parts';

const bars = (n: number, markers: Record<number, string> = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, events: [], ...(markers[i] ? { marker: markers[i] } : {}) }));

describe('songParts', () => {
  it('splits at markers', () => {
    const parts = songParts({ bars: bars(16, { 0: 'A', 8: 'B' }) });
    expect(parts).toEqual([
      { index: 1, label: 'Part 1 (A)', firstBar: 0, lastBar: 7 },
      { index: 2, label: 'Part 2 (B)', firstBar: 8, lastBar: 15 },
    ]);
    expect(partForBar(parts, 9)?.index).toBe(2);
  });
  it('treats bars before the first marker as part 1', () => {
    expect(songParts({ bars: bars(6, { 2: 'A' }) }).map((p) => [p.firstBar, p.lastBar])).toEqual([[0, 1], [2, 5]]);
  });
  it('uses 8-bar parts without markers', () => {
    expect(songParts({ bars: bars(20) }).map((p) => p.firstBar)).toEqual([0, 8, 16]);
  });
});
