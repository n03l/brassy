import type { Song } from '../model/types';
import { t } from '../i18n';

export type Part = { index: number; label: string; firstBar: number; lastBar: number };

const BARS_PER_PART_WITHOUT_MARKERS = 8;

/** Split a song into parts at rehearsal markers (or every 8 bars when there are none). Bar numbers are 0-based. */
export function songParts(song: Pick<Song, 'bars'>): Part[] {
  const starts: number[] = [];
  const hasMarkers = song.bars.some((b) => b.marker);
  song.bars.forEach((b, i) => {
    if (i === 0 || (hasMarkers ? !!b.marker : i % BARS_PER_PART_WITHOUT_MARKERS === 0)) starts.push(i);
  });
  return starts.map((first, k) => {
    const last = (starts[k + 1] ?? song.bars.length) - 1;
    const marker = song.bars[first]?.marker;
    return { index: k + 1, label: marker ? t('player.partMarker', k + 1, marker) : t('player.part', k + 1), firstBar: first, lastBar: last };
  });
}

export function partForBar(parts: Part[], bar: number): Part | undefined {
  return parts.find((p) => bar >= p.firstBar && bar <= p.lastBar);
}
