import { LIMITS } from '../model/limits';
import { normalizeSong, stableStringify } from '../model/normalize';
import type { PracticeEntry, Song, Tombstone } from '../model/types';
import { capTombstones, normalizePractice, parseTombstones } from '../db/repo';
import { t } from '../i18n';

export const BACKUP_FORMAT = 'brassy-backup';
export const BACKUP_VERSION = 1;

/** Everything that matters, as stored in a backup file or on Drive. */
export type BackupData = { songs: Song[]; practice: PracticeEntry[]; tombstones: Tombstone[] };
export type BackupFile = BackupData & { format: typeof BACKUP_FORMAT; version: number; exportedAt: string };

export class BackupError extends Error {}

export const SEED_SONG_ID = 'seed-when-the-saints';

export function toBackupFile(data: BackupData, now = new Date().toISOString()): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, ...canonical(data) };
}

/** Sorted, so the same data always serialises (and hashes) the same way. */
export function canonical(data: BackupData): BackupData {
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    songs: [...data.songs].sort(byId),
    practice: [...data.practice].sort(byId),
    tombstones: [...data.tombstones].sort(byId),
  };
}

export type ParseReport = { data: BackupData; skippedSongs: number; repairedSongs: number };

/**
 * Parse a backup (file or Drive copy). Repairs what it can, skips what it can't, and refuses data the app
 * couldn't save (over the limits) with an explanation.
 */
export function parseBackup(text: string): ParseReport {
  if (text.length > LIMITS.backupFileMaxBytes) throw new BackupError(t('backup.tooBig'));
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError(t('backup.notBackup'));
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BackupError(t('backup.notBackup'));
  const o = raw as Record<string, unknown>;
  if (o.format !== BACKUP_FORMAT) throw new BackupError(t('backup.notBackup'));
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) {
    throw new BackupError(t('backup.newer'));
  }
  if (!Array.isArray(o.songs)) throw new BackupError(t('backup.noSongs'));

  const songs = new Map<string, Song>();
  let skippedSongs = 0;
  let repairedSongs = 0;
  for (const s of o.songs) {
    try {
      const { song, repairs } = normalizeSong(s);
      if (repairs.length) repairedSongs++;
      const prev = songs.get(song.id);
      if (!prev || prev.updatedAt < song.updatedAt) songs.set(song.id, song);
    } catch {
      skippedSongs++;
    }
  }
  if (songs.size > LIMITS.songsMax) throw new BackupError(t('backup.tooMany', LIMITS.songsMax));

  const practice = new Map<string, PracticeEntry>();
  for (const p of Array.isArray(o.practice) ? o.practice : []) {
    const e = normalizePractice(p);
    if (e) practice.set(e.id, e);
  }
  const data: BackupData = {
    songs: [...songs.values()],
    practice: capPractice([...practice.values()]),
    tombstones: capTombstones(parseTombstones(o.tombstones)),
  };
  return { data: canonical(data), skippedSongs, repairedSongs };
}

function capPractice(p: PracticeEntry[]): PracticeEntry[] {
  if (p.length <= LIMITS.practiceEntriesMax) return p;
  return [...p].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, LIMITS.practiceEntriesMax);
}

export class MergeTooBigError extends BackupError {}

/**
 * Merge two copies: per song the newer edit wins, a deletion wins over older edits, practice logs are combined.
 * Refuses a result over the limits rather than saving something the app can't load.
 */
export function mergeBackups(a: BackupData, b: BackupData): BackupData {
  const tombs = new Map<string, Tombstone>();
  for (const t of [...a.tombstones, ...b.tombstones]) {
    const prev = tombs.get(t.id);
    if (!prev || prev.deletedAt < t.deletedAt) tombs.set(t.id, t);
  }
  const songs = new Map<string, Song>();
  for (const s of [...a.songs, ...b.songs]) {
    const prev = songs.get(s.id);
    if (!prev || prev.updatedAt < s.updatedAt) songs.set(s.id, s);
  }
  for (const [id, s] of songs) {
    const t = tombs.get(id);
    if (t && t.deletedAt >= s.updatedAt) songs.delete(id);
    else if (t) tombs.delete(id); // edited after it was deleted elsewhere: keep the song
  }
  const practice = new Map<string, PracticeEntry>();
  for (const p of [...a.practice, ...b.practice]) {
    const prev = practice.get(p.id);
    if (!prev || prev.seconds < p.seconds) practice.set(p.id, p);
  }
  if (songs.size > LIMITS.songsMax) {
    throw new MergeTooBigError(t('backup.mergeTooBig', LIMITS.songsMax));
  }
  return canonical({
    songs: [...songs.values()],
    practice: capPractice([...practice.values()]),
    tombstones: capTombstones([...tombs.values()]),
  });
}

/** SHA-256 of the canonical data (not the export time). */
export async function hashData(data: BackupData): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(canonical(data)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A brand-new install: only the untouched first song, no practice, nothing deleted. */
export function isPristine(data: BackupData): boolean {
  return (
    data.practice.length === 0 &&
    data.tombstones.length === 0 &&
    data.songs.every((s) => s.id === SEED_SONG_ID && s.updatedAt === s.createdAt)
  );
}
