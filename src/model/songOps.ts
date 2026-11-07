import { LIMITS } from './limits';
import { newId } from './ids';
import { cleanText, emptyBar } from './normalize';
import type { Song } from './types';
import { t } from '../i18n';

export function createBlankSong(title: string, beats: number, bars: number, now = new Date().toISOString()): Song {
  const sig = { beats: Math.min(LIMITS.beatsMax, Math.max(LIMITS.beatsMin, beats)), beatType: 4 };
  const n = Math.min(LIMITS.barsMax, Math.max(1, bars));
  return {
    id: newId(),
    title: cleanText(title, LIMITS.titleMaxChars) || t('song.defaultTitle'),
    tempo: 100,
    ...sig,
    bars: Array.from({ length: n }, () => emptyBar(sig)),
    createdAt: now,
    updatedAt: now,
  };
}

/** A copy with fresh ids everywhere. */
export function duplicateSong(song: Song, now = new Date().toISOString()): Song {
  const suffix = t('song.copySuffix');
  const base = Array.from(song.title).slice(0, LIMITS.titleMaxChars - suffix.length).join('');
  return {
    ...structuredClone(song),
    id: newId(),
    title: base + suffix,
    bars: song.bars.map((b) => ({ ...structuredClone(b), id: newId(), events: b.events.map((e) => ({ ...structuredClone(e), id: newId() })) })),
    createdAt: now,
    updatedAt: now,
  };
}

export function renameSong(song: Song, title: string, now = new Date().toISOString()): Song {
  return { ...song, title: cleanText(title, LIMITS.titleMaxChars) || song.title, updatedAt: now };
}
