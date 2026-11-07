import * as alphaTab from '@coderline/alphatab';
import type { Song } from '../model/types';
import { toAlphaTex } from '../music/alphatex';

function scoreOf(song: Song, concertNotes = false) {
  return alphaTab.importer.ScoreLoader.loadAlphaTex(toAlphaTex(song, { concertNotes }), new alphaTab.Settings());
}

/** Guitar Pro 7 (.gp) via alphaTab's exporter. */
export function toGuitarPro(song: Song): Uint8Array {
  // alphaTab's GP7 exporter ignores the staff's playback transposition, so bake it into the notes.
  return new alphaTab.exporter.Gp7Exporter().export(scoreOf(song, true), new alphaTab.Settings());
}

/** Standard MIDI file at SOUNDING pitch (what you hear), with the trumpet program. */
export function toMidiFile(song: Song): Uint8Array {
  const score = scoreOf(song);
  const midi = new alphaTab.midi.MidiFile();
  const gen = new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true)); // SMF 1.0, like alphaTab's own downloadMidi
  gen.applyTranspositionPitches = true;
  gen.generate();
  return midi.toBinary();
}
