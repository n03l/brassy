import { describe, expect, it } from 'vitest';
import * as ops from './ops';
import { checkBars, issueMessage, fillLabel, canLengthenLast, beatsText } from '../music/barCheck';
import { sampleSong } from '../../test/fixtures';
import { assertCanonical } from '../model/normalize';
import { toMidi } from '../music/pitch';
import { createBlankSong } from '../model/songOps';
import type { Song } from '../model/types';

const r = (bar: number, event: number) => ({ bar, event });

describe('pitch edits', () => {
  it('steps by letter and stays in the trumpet range', () => {
    const s = sampleSong();
    const up = ops.stepPitch(s, r(0, 0), 1);
    expect(up.bars[0]!.events[0]!.pitch).toEqual({ step: 'D', alter: 0, octave: 4 });
    expect(s.bars[0]!.events[0]!.pitch!.step).toBe('C'); // original untouched
    let low = s;
    for (let i = 0; i < 10; i++) low = ops.stepPitch(low, r(0, 0), -1);
    expect(toMidi(low.bars[0]!.events[0]!.pitch!)).toBeGreaterThanOrEqual(54);
    expect(low.bars[0]!.events[0]!.pitch).toEqual({ step: 'G', alter: 0, octave: 3 });
  });
  it('sets and clears sharps and flats', () => {
    const s = ops.setAlter(sampleSong(), r(0, 0), 1);
    expect(s.bars[0]!.events[0]!.pitch!.alter).toBe(1);
    expect(ops.setAlter(s, r(0, 0), 1).bars[0]!.events[0]!.pitch!.alter).toBe(0);
    expect(ops.setAlter(s, r(0, 0), 0).bars[0]!.events[0]!.pitch!.alter).toBe(0);
  });
  it('ignores pitch edits on rests and bad refs', () => {
    const s = sampleSong();
    expect(ops.stepPitch(s, r(0, 3), 1)).toBe(s);
    expect(ops.stepPitch(s, r(9, 9), 1)).toBe(s);
  });
});

describe('note edits', () => {
  it('turns rests into notes with a nearby pitch and back', () => {
    const s = ops.toggleRest(sampleSong(), r(0, 3));
    expect(s.bars[0]!.events[3]).toMatchObject({ rest: false, pitch: { step: 'E', alter: -1, octave: 4 } });
    const back = ops.toggleRest(s, r(0, 3));
    expect(back.bars[0]!.events[3]).toEqual({ id: 'e4', rest: true, duration: 'quarter', dotted: false });
    assertCanonical(back);
  });
  it('inserts after and deletes, moving the selection', () => {
    const ins = ops.insertAfter(sampleSong(), r(1, 0));
    expect(ins.sel).toEqual(r(1, 1));
    expect(ins.song.bars[1]!.events).toHaveLength(2);
    expect(ins.song.bars[1]!.events[1]!.id).not.toBe('e5');
    assertCanonical(ins.song);
    const del = ops.deleteEvent(sampleSong(), r(1, 0));
    expect(del.song.bars[1]!.events).toHaveLength(0);
    expect(del.sel).toEqual(r(0, 3));
  });
  it('moves the selection across bars', () => {
    const s = sampleSong();
    expect(ops.moveSelection(s, r(0, 3), 1)).toEqual(r(1, 0));
    expect(ops.moveSelection(s, r(1, 0), -1)).toEqual(r(0, 3));
    expect(ops.moveSelection(s, r(2, 4), 1)).toEqual(r(2, 4));
  });
});

describe('bar check and fixes', () => {
  const short = (): Song => {
    const s = createBlankSong('x', 4, 2);
    s.bars[0]!.events = [{ id: 'n1', rest: false, pitch: { step: 'C', alter: 0, octave: 5 }, duration: 'half', dotted: true }];
    return s;
  };
  it('finds short and long bars with child-friendly messages', () => {
    const s = short();
    const issues = checkBars(s);
    expect(issues).toEqual([{ bar: 0, ticks: 2880, capacity: 3840, kind: 'short' }]);
    expect(issueMessage(issues[0]!, s)).toBe('Bar 1 has 3 beats — it needs 4');
    expect(fillLabel(issues[0]!)).toBe('Add a quarter rest');
    expect(canLengthenLast(s.bars[0]!, issues[0]!)).toBe(true);
    expect(beatsText(2.5)).toBe('2½');
    expect(fillLabel({ bar: 0, ticks: 3360, capacity: 3840, kind: 'short' })).toBe('Add an eighth rest');
  });
  it('fills with rests or lengthens the last note', () => {
    const filled = ops.fillWithRests(short(), 0);
    expect(checkBars(filled)).toEqual([]);
    expect(filled.bars[0]!.events.at(-1)).toMatchObject({ rest: true, duration: 'quarter' });
    const longer = ops.lengthenLast(short(), 0);
    expect(longer.bars[0]!.events).toEqual([expect.objectContaining({ duration: 'whole', dotted: false })]);
  });
  it('moves extra notes into the next bar, replacing a whole-bar rest', () => {
    let s = createBlankSong('x', 4, 1);
    s.bars[0]!.events = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, rest: false, pitch: { step: 'G' as const, alter: 0 as const, octave: 4 }, duration: 'quarter' as const, dotted: false }));
    s = ops.moveExtraToNext(s, 0);
    expect(s.bars).toHaveLength(2);
    expect(s.bars[0]!.events).toHaveLength(4);
    expect(s.bars[1]!.events.map((e) => e.id)).toEqual(['q4', 'q5']);
    s = ops.addBar(s);
    s.bars[1]!.events.push(...Array.from({ length: 3 }, (_, i) => ({ id: `z${i}`, rest: true, duration: 'quarter' as const, dotted: false })));
    s = ops.moveExtraToNext(s, 1);
    expect(s.bars[2]!.events.map((e) => e.id)).toEqual(['z2']);
    assertCanonical(s);
    expect(issueMessage({ bar: 0, ticks: 0, capacity: 3840, kind: 'short' }, s)).toBe('Bar 1 is empty — it needs 4 beats');
  });
});

describe('tempo', () => {
  it('steps by 5 within the limits and stays canonical', () => {
    let s = { ...sampleSong(), tempo: 97 };
    expect(ops.stepTempo(s, 1).tempo).toBe(100);
    expect(ops.stepTempo(s, -1).tempo).toBe(95);
    s = ops.setTempo(s, 9999);
    expect(s.tempo).toBe(240);
    expect(ops.stepTempo(s, 1)).toBe(s);
    expect(ops.setTempo(s, 1).tempo).toBe(30);
    assertCanonical(ops.setTempo(sampleSong(), 123));
  });
});
