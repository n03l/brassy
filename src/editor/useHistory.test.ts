import { describe, expect, it } from 'vitest';
import { historyReducer } from './useHistory';
import { sampleSong } from '../../test/fixtures';
import { stepPitch } from './ops';

describe('history', () => {
  it('undoes and redoes edits, and a new edit clears redo', () => {
    const s0 = sampleSong();
    const s1 = stepPitch(s0, { bar: 0, event: 0 }, 1);
    const s2 = stepPitch(s1, { bar: 0, event: 0 }, 1);
    let h = { past: [], present: { song: s0, sel: null }, future: [] } as Parameters<typeof historyReducer>[0];
    h = historyReducer(h, { type: 'apply', song: s1, sel: { bar: 0, event: 0 } });
    h = historyReducer(h, { type: 'apply', song: s2, sel: { bar: 0, event: 0 } });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.song).toBe(s1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.song).toBe(s0);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.song).toBe(s0);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.song).toBe(s1);
    h = historyReducer(h, { type: 'apply', song: s0, sel: null });
    expect(h.future).toEqual([]);
    // a no-op edit doesn't add history
    const before = h.past.length;
    h = historyReducer(h, { type: 'apply', song: h.present.song, sel: null });
    expect(h.past.length).toBe(before);
  });
});
