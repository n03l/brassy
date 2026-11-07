import { describe, expect, it } from 'vitest';
import { bumpy, loopDone, normalizeLadder, startLadder } from './ladder';

describe('speed ladder', () => {
  const cfg = { step: 5, every: 2, goal: 70 };
  it('adds 5% every 2 clean loops up to the goal', () => {
    let s = startLadder(60);
    s = loopDone(s, cfg); expect(s.speed).toBe(60);
    s = loopDone(s, cfg); expect(s.speed).toBe(65);
    s = loopDone(s, cfg); s = loopDone(s, cfg); expect(s.speed).toBe(70);
    s = loopDone(s, cfg); s = loopDone(s, cfg); expect(s.speed).toBe(70);
    expect(s.loops).toBe(6);
    expect(s.start).toBe(60);
  });
  it('restarts the streak after a bumpy loop', () => {
    let s = loopDone(startLadder(50), cfg);
    s = bumpy(s);
    s = loopDone(s, cfg); expect(s.speed).toBe(50);
    s = loopDone(s, cfg); expect(s.speed).toBe(55);
  });
  it('normalises stored settings', () => {
    expect(normalizeLadder({ step: 7, every: '2', goal: 999 })).toEqual({ step: 5, every: 2, goal: 150 });
    expect(normalizeLadder(null)).toEqual({ step: 5, every: 2, goal: 100 });
  });
});
