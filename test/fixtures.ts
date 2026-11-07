import type { Song } from '../src/model/types';

export const HOSTILE_TEXT = '<img src=x onerror=alert(1)>"\\ \n\u0007|. \\title "x"';

/** A small valid song covering every feature of the model. */
export function sampleSong(): Song {
  return {
    id: 'song-1',
    title: 'Sample',
    tempo: 100,
    beats: 4,
    beatType: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    bars: [
      {
        id: 'b1',
        repeatOpen: true,
        marker: 'A',
        events: [
          { id: 'e1', rest: false, pitch: { step: 'C', alter: 0, octave: 4 }, duration: 'quarter', dotted: false },
          { id: 'e2', rest: false, pitch: { step: 'D', alter: 0, octave: 4 }, duration: 'quarter', dotted: true },
          { id: 'e3', rest: false, pitch: { step: 'E', alter: -1, octave: 4 }, duration: 'eighth', dotted: false },
          { id: 'e4', rest: true, duration: 'quarter', dotted: false },
        ],
      },
      {
        id: 'b2',
        ending: [1],
        repeatClose: 2,
        events: [{ id: 'e5', rest: false, pitch: { step: 'F', alter: 1, octave: 4 }, duration: 'whole', dotted: false }],
      },
      {
        id: 'b3',
        ending: [2],
        doubleBar: true,
        events: [
          { id: 'e6', rest: false, pitch: { step: 'B', alter: -1, octave: 4 }, duration: 'half', dotted: false },
          { id: 'e7', rest: true, duration: 'quarter', dotted: false },
          { id: 'e8', rest: false, pitch: { step: 'C', alter: 0, octave: 5 }, duration: 'sixteenth', dotted: false },
          { id: 'e9', rest: true, duration: 'sixteenth', dotted: false },
          { id: 'e10', rest: true, duration: 'eighth', dotted: false },
        ],
      },
    ],
  };
}

/** Hostile, messy data: duplicate ids, mixed dates, hostile strings, wrong types, empty lists. */
export function hostileSongRaw(): unknown {
  return {
    id: '__proto__',
    title: HOSTILE_TEXT,
    tempo: '120',
    beats: 99,
    beatType: 5,
    createdAt: '03/04/2025',
    updatedAt: 'not a date',
    bars: [
      { id: 'dup', marker: HOSTILE_TEXT, ending: [3, 1, 1, 'x', 99], repeatClose: 50, events: [
        { id: 'dup', rest: false, pitch: { step: 'H', alter: 0, octave: 4 }, duration: 'quarter' },
        { id: 'dup', rest: false, pitch: { step: 'C', alter: 2, octave: 4 }, duration: 'tiny' },
        { id: 'ok', rest: false, pitch: { step: 'C', alter: 0, octave: 12 }, duration: 'half', dotted: 'yes' },
        null,
      ] },
      { id: 'dup', events: [] },
      'junk',
      { events: 'not a list' },
    ],
  };
}
