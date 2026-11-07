import type { Bar, NoteEvent, Song } from '../model/types';
import { durationTicks, TPQ } from '../music/duration';

/** Divisions per quarter: 8 so a dotted sixteenth (3) is a whole number. */
const DIVISIONS = 8;
const TICKS_PER_DIVISION = TPQ / DIVISIONS;

/** Escape text for XML content and attribute values. */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const sameEnding = (a?: number[], b?: number[]) => !!a && !!b && a.join(',') === b.join(',');

/**
 * Our own MusicXML 4.0 writer. One part, B♭ trumpet: pitches are written pitch and the part declares
 * <transpose> (down a major 2nd) plus the GM trumpet program (57 in MusicXML's 1-based numbering).
 */
export function toMusicXml(song: Song): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  out.push('<score-partwise version="4.0">');
  out.push(`  <work><work-title>${xmlEscape(song.title)}</work-title></work>`);
  out.push('  <identification><encoding><software>Brassy</software></encoding></identification>');
  out.push('  <part-list>');
  out.push('    <score-part id="P1"><part-name>Trumpet in B♭</part-name>');
  out.push('      <score-instrument id="P1-I1"><instrument-name>Trumpet in B♭</instrument-name></score-instrument>');
  out.push('      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>57</midi-program></midi-instrument>');
  out.push('    </score-part>');
  out.push('  </part-list>');
  out.push('  <part id="P1">');
  song.bars.forEach((bar, i) => out.push(...measure(song, bar, i)));
  out.push('  </part>');
  out.push('</score-partwise>');
  return out.join('\n') + '\n';
}

function measure(song: Song, bar: Bar, i: number): string[] {
  const prev = song.bars[i - 1];
  const next = song.bars[i + 1];
  const o: string[] = [`    <measure number="${i + 1}"${bar.pickup ? ' implicit="yes"' : ''}>`];

  const endingStarts = bar.ending && !sameEnding(prev?.ending, bar.ending);
  if (bar.repeatOpen || endingStarts) {
    o.push('      <barline location="left">');
    if (bar.repeatOpen) o.push('        <bar-style>heavy-light</bar-style>');
    if (endingStarts) o.push(`        <ending number="${bar.ending!.join(', ')}" type="start">${bar.ending!.join(', ')}.</ending>`);
    if (bar.repeatOpen) o.push('        <repeat direction="forward"/>');
    o.push('      </barline>');
  }
  if (i === 0) {
    o.push(`      <attributes><divisions>${DIVISIONS}</divisions><key><fifths>0</fifths></key>` +
      `<time><beats>${song.beats}</beats><beat-type>${song.beatType}</beat-type></time>` +
      '<clef><sign>G</sign><line>2</line></clef>' +
      '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>');
    o.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
      `<per-minute>${song.tempo}</per-minute></metronome></direction-type><sound tempo="${song.tempo}"/></direction>`);
  }
  if (bar.marker) {
    o.push(`      <direction placement="above"><direction-type><rehearsal>${xmlEscape(bar.marker)}</rehearsal></direction-type></direction>`);
  }
  bar.events.forEach((e, j) => {
    // The next event in score order; an empty bar in between breaks a tie (cleanTies enforces the same).
    const after = j + 1 < bar.events.length ? bar.events[j + 1] : next?.events[0];
    o.push(noteXml(e, !!after?.tie));
  });

  const endingStops = bar.ending && !sameEnding(next?.ending, bar.ending);
  if (bar.repeatClose || endingStops || bar.doubleBar) {
    o.push('      <barline location="right">');
    o.push(`        <bar-style>${bar.repeatClose ? 'light-heavy' : bar.doubleBar ? 'light-light' : endingStops && !next ? 'light-heavy' : 'regular'}</bar-style>`);
    if (endingStops) o.push(`        <ending number="${bar.ending!.join(', ')}" type="${bar.repeatClose ? 'stop' : 'discontinue'}"/>`);
    if (bar.repeatClose) o.push(`        <repeat direction="backward" times="${bar.repeatClose}"/>`);
    o.push('      </barline>');
  }
  o.push('    </measure>');
  return o;
}

/** One <note>. `tieStart`: the next note continues this one. */
function noteXml(e: NoteEvent, tieStart: boolean): string {
  const dur = durationTicks(e.duration, e.dotted) / TICKS_PER_DIVISION;
  const type = `<voice>1</voice><type>${e.duration === 'sixteenth' ? '16th' : e.duration}</type>${e.dotted ? '<dot/>' : ''}`;
  if (e.rest || !e.pitch) return `      <note><rest/><duration>${dur}</duration>${type}</note>`;
  const p = e.pitch;
  const alter = p.alter ? `<alter>${p.alter}</alter>` : '';
  const acc = p.alter === 1 ? '<accidental>sharp</accidental>' : p.alter === -1 ? '<accidental>flat</accidental>' : '';
  // MusicXML order: pitch, duration, tie*, voice, type, dot, accidental, notations.
  const stop = !!e.tie;
  const ties = (stop ? '<tie type="stop"/>' : '') + (tieStart ? '<tie type="start"/>' : '');
  const tied = (stop ? '<tied type="stop"/>' : '') + (tieStart ? '<tied type="start"/>' : '');
  const notations = tied ? `<notations>${tied}</notations>` : '';
  return `      <note><pitch><step>${p.step}</step>${alter}<octave>${p.octave}</octave></pitch><duration>${dur}</duration>${ties}${type}${acc}${notations}</note>`;
}
