import { describe, expect, it } from 'vitest';
import { createBlankSong, duplicateSong, renameSong } from './songOps';
import { assertCanonical } from './normalize';
import { barCapacity, barTicks } from '../music/duration';
import { sampleSong } from '../../test/fixtures';
import { LIMITS } from './limits';

describe('song operations', () => {
  it('creates blank songs filled with rests', () => {
    for (const beats of [2, 3, 4]) {
      const s = createBlankSong('  Hi  ', beats, 8);
      expect(s.title).toBe('Hi');
      expect(s.bars).toHaveLength(8);
      for (const b of s.bars) expect(barTicks(b.events)).toBe(barCapacity(s));
      expect(s.bars[0]!.events).toHaveLength(1); // one (dotted) whole/half rest
      assertCanonical(s);
    }
  });
  it('duplicates with fresh ids and a capped title', () => {
    const src = { ...sampleSong(), title: 'x'.repeat(LIMITS.titleMaxChars) };
    const d = duplicateSong(src);
    expect(d.id).not.toBe(src.id);
    expect(d.title.length).toBeLessThanOrEqual(LIMITS.titleMaxChars);
    expect(d.title.endsWith('(copy)')).toBe(true);
    const ids = (s: typeof d) => s.bars.flatMap((b) => [b.id, ...b.events.map((e) => e.id)]);
    expect(ids(d).some((id) => ids(src).includes(id))).toBe(false);
    assertCanonical(d);
  });
  it('renames, ignoring empty names', () => {
    expect(renameSong(sampleSong(), '  New  ').title).toBe('New');
    expect(renameSong(sampleSong(), '   ').title).toBe('Sample');
  });
});
