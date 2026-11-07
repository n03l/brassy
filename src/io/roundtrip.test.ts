import { describe, expect, it } from 'vitest';
import { toMusicXml, xmlEscape } from './musicxmlWrite';
import { pitchKind, readScore, scoreToSong } from './importScore';
import { toGuitarPro, toMidiFile } from './exportAlphaTab';
import { sampleSong, HOSTILE_TEXT } from '../../test/fixtures';
import type { Song } from '../model/types';
import seedXml from '../../public/songs/when-the-saints.musicxml?raw';

/** Compare songs ignoring ids and dates. */
function shape(s: Song) {
  return {
    title: s.title, tempo: s.tempo, beats: s.beats, beatType: s.beatType,
    bars: s.bars.map(({ id: _id, events, ...rest }) => ({ ...rest, events: events.map(({ id: _e, ...e }) => e) })),
  };
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe('MusicXML round trip', () => {
  it('model → MusicXML → import → model gives the same song', () => {
    const song = sampleSong();
    const score = readScore(bytes(toMusicXml(song)));
    expect(pitchKind(score)).toBe('trumpet');
    const back = scoreToSong(score, { concertPitch: false });
    expect(back.warnings).toEqual([]);
    expect(shape(back.song)).toEqual(shape(song));
  });

  it('round-trips the seed song', () => {
    const seed = scoreToSong(readScore(bytes(seedXml)), { concertPitch: false }).song;
    const back = scoreToSong(readScore(bytes(toMusicXml(seed))), { concertPitch: false }).song;
    expect(shape(back)).toEqual(shape(seed));
  });

  it('round-trips other time signatures, every length and accidental', () => {
    const song: Song = {
      ...sampleSong(),
      beats: 3,
      beatType: 4,
      bars: [
        { id: 'a', events: [
          { id: '1', rest: false, pitch: { step: 'F', alter: 1, octave: 3 }, duration: 'quarter', dotted: true },
          { id: '2', rest: false, pitch: { step: 'G', alter: 1, octave: 3 }, duration: 'sixteenth', dotted: true },
          { id: '3', rest: true, duration: 'sixteenth', dotted: false },
          { id: '4', rest: false, pitch: { step: 'C', alter: 0, octave: 6 }, duration: 'quarter', dotted: false },
        ] },
        { id: 'b', events: [{ id: '5', rest: false, pitch: { step: 'A', alter: -1, octave: 4 }, duration: 'half', dotted: true }] },
      ],
    };
    expect(shape(scoreToSong(readScore(bytes(toMusicXml(song))), { concertPitch: false }).song)).toEqual(shape(song));
  });

  it('escapes hostile text', () => {
    const song = sampleSong();
    song.title = HOSTILE_TEXT.replace(/[\u0000-\u001f]/g, ' ');
    song.bars[0]!.marker = '<b>&"';
    const xml = toMusicXml(song);
    expect(xml).not.toContain('<img');
    expect(xml).not.toContain('<b>&');
    const back = scoreToSong(readScore(bytes(xml)), { concertPitch: false }).song;
    expect(back.bars[0]!.marker).toBe('<b>&"');
    expect(xmlEscape('a\u0001b')).toBe('ab');
  });
});

describe('alphaTab exporters', () => {
  it('writes a Guitar Pro file alphaTab can read back as trumpet', () => {
    const gp = toGuitarPro(sampleSong());
    expect(gp.byteLength).toBeGreaterThan(100);
    const score = readScore(gp);
    const back = scoreToSong(score, { concertPitch: pitchKind(score) === 'concert' });
    expect(shape(back.song).bars.map((b) => b.events)).toEqual(shape(sampleSong()).bars.map((b) => b.events));
  });

  it('writes a MIDI file at sounding pitch', () => {
    const midi = toMidiFile(sampleSong());
    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd');
    // First note C4 written → 58; look for a note-on with key 58 (0x9n 0x3A vv).
    const hex = Array.from(midi, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toMatch(/9[0-9a-f]3a[0-7][0-9a-f]/);
    expect(hex).toMatch(/c[0-9a-f]38/); // program change to 56 (0x38)
  });
});
