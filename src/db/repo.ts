import { getDb, writeTx, type SongVersion } from './db';
import { LIMITS } from '../model/limits';
import { assertCanonical, normalizeSong, toIsoDate } from '../model/normalize';
import { isValidId } from '../model/ids';
import type { PracticeEntry, Song, Tombstone } from '../model/types';
import { t } from '../i18n';

/* ---------- change notifications (UI refresh, sync scheduling) ---------- */

type ChangeKind = 'songs' | 'practice' | 'restore';
const listeners = new Set<(kind: ChangeKind) => void>();
export function onDataChanged(fn: (kind: ChangeKind) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed(kind: ChangeKind) {
  for (const fn of listeners) fn(kind);
}

/* ---------- songs ---------- */

export type LoadedSongs = { songs: Song[]; unreadable: number; repaired: number };

/** Load every song, repairing what can be repaired. Unreadable records stay in the database untouched. */
export async function loadSongs(): Promise<LoadedSongs> {
  const db = await getDb();
  const raw = await db.getAll('songs');
  const songs: Song[] = [];
  let unreadable = 0;
  let repaired = 0;
  for (const r of raw) {
    try {
      const { song, repairs } = normalizeSong(r);
      if (repairs.length) repaired++;
      songs.push(song);
    } catch {
      unreadable++;
    }
  }
  songs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return { songs, unreadable, repaired };
}

export async function loadSong(id: string): Promise<Song | undefined> {
  if (!isValidId(id)) return undefined;
  const db = await getDb();
  const r = await db.get('songs', id);
  return r === undefined ? undefined : normalizeSong(r).song;
}

const VERSION_COALESCE_MS = 60_000;

/**
 * Save a song. Validates first (whatever is saved must load). With `version`, also records a version for
 * "restore an older version"; versions saved within a minute of each other are merged into one.
 */
export async function saveSong(song: Song, opts: { version?: boolean } = {}): Promise<void> {
  assertCanonical(song);
  await writeTx(['songs', 'versions'], async (tx) => {
    const songs = tx.objectStore('songs');
    if (!(await songs.get(song.id))) {
      const count = await songs.count();
      if (count >= LIMITS.songsMax) throw new Error(t('limit.songs', LIMITS.songsMax));
    }
    await songs.put(song);
    if (opts.version) {
      const versions = tx.objectStore('versions');
      const idx = versions.index('bySong');
      const existing = await idx.getAll(song.id);
      existing.sort((a, b) => (a.vid ?? 0) - (b.vid ?? 0));
      const last = existing.at(-1);
      if (last && Date.parse(song.updatedAt) - Date.parse(last.savedAt) < VERSION_COALESCE_MS) {
        await versions.put({ ...last, savedAt: song.updatedAt, song });
      } else {
        await versions.add({ songId: song.id, savedAt: song.updatedAt, song });
        existing.push({ songId: song.id, savedAt: song.updatedAt, song });
      }
      const extra = existing.length - LIMITS.versionsPerSong;
      for (let i = 0; i < extra; i++) {
        const vid = existing[i]!.vid;
        if (vid !== undefined) await versions.delete(vid);
      }
    }
  });
  changed('songs');
}

/** Add the first-run song and mark the database as seeded, atomically (only if not seeded yet). */
export async function addSeedSong(song: Song): Promise<void> {
  assertCanonical(song);
  await writeTx(['songs'], async (tx) => {
    const meta = tx.objectStore('meta');
    if (await meta.get('seeded')) return;
    if ((await tx.objectStore('songs').count()) === 0) await tx.objectStore('songs').put(song);
    await meta.put(true, 'seeded');
  });
  changed('songs');
}

export async function listVersions(songId: string): Promise<SongVersion[]> {
  const db = await getDb();
  const out: SongVersion[] = [];
  for (const v of await db.getAllFromIndex('versions', 'bySong', songId)) {
    try {
      out.push({ ...v, song: normalizeSong(v.song).song });
    } catch {
      /* skip unreadable version */
    }
  }
  return out.sort((a, b) => (b.vid ?? 0) - (a.vid ?? 0));
}

export async function deleteSong(id: string): Promise<void> {
  await writeTx(['songs', 'versions'], async (tx) => {
    await tx.objectStore('songs').delete(id);
    const versions = tx.objectStore('versions');
    for (const key of await versions.index('bySong').getAllKeys(id)) await versions.delete(key);
    const meta = tx.objectStore('meta');
    const tombs = parseTombstones(await meta.get('tombstones'));
    tombs.push({ id, deletedAt: new Date().toISOString() });
    await meta.put(capTombstones(tombs), 'tombstones');
  });
  changed('songs');
}

/* ---------- tombstones (so a merge doesn't bring deleted songs back) ---------- */

export function parseTombstones(v: unknown): Tombstone[] {
  if (!Array.isArray(v)) return [];
  const byId = new Map<string, Tombstone>();
  for (const t of v) {
    if (!t || typeof t !== 'object') continue;
    const { id, deletedAt } = t as Record<string, unknown>;
    if (!isValidId(id)) continue;
    const d = toIsoDate(deletedAt, '');
    if (!d) continue;
    const prev = byId.get(id);
    if (!prev || prev.deletedAt < d) byId.set(id, { id, deletedAt: d });
  }
  return [...byId.values()];
}

export function capTombstones(t: Tombstone[]): Tombstone[] {
  return [...t].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1)).slice(0, LIMITS.tombstonesMax);
}

export async function loadTombstones(): Promise<Tombstone[]> {
  const db = await getDb();
  return parseTombstones(await db.get('meta', 'tombstones'));
}

/* ---------- practice log ---------- */

export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizePractice(raw: unknown): PracticeEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!isValidId(r.id) || !isValidId(r.songId)) return undefined;
  const startedAt = toIsoDate(r.startedAt, '');
  if (!startedAt) return undefined;
  const day = typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : localDay(new Date(startedAt));
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
  return {
    id: r.id,
    songId: r.songId,
    day,
    startedAt,
    seconds: num(r.seconds, LIMITS.practiceSecondsMax),
    topSpeed: Math.min(LIMITS.speedMax, Math.max(LIMITS.speedMin, num(r.topSpeed, LIMITS.speedMax) || 100)),
    loops: num(r.loops, LIMITS.loopsMax),
    lastBar: Math.max(1, num(r.lastBar, LIMITS.barsMax)),
  };
}

export async function savePractice(entry: PracticeEntry): Promise<void> {
  const clean = normalizePractice(entry);
  if (!clean) throw new Error('Invalid practice entry');
  await writeTx(['practice'], async (tx) => {
    const store = tx.objectStore('practice');
    await store.put(clean);
    const count = await store.count();
    if (count > LIMITS.practiceEntriesMax) {
      // Drop the oldest entries.
      let toDrop = count - LIMITS.practiceEntriesMax;
      let cursor = await store.index('byDay').openCursor();
      while (cursor && toDrop > 0) {
        await cursor.delete();
        toDrop--;
        cursor = await cursor.continue();
      }
    }
  });
  changed('practice');
}

export async function loadPracticeSince(day: string): Promise<PracticeEntry[]> {
  const db = await getDb();
  const raw = await db.getAllFromIndex('practice', 'byDay', IDBKeyRange.lowerBound(day));
  return raw.map(normalizePractice).filter((e): e is PracticeEntry => !!e);
}

export async function loadAllPractice(): Promise<PracticeEntry[]> {
  const db = await getDb();
  return (await db.getAll('practice')).map(normalizePractice).filter((e): e is PracticeEntry => !!e);
}

export async function latestPractice(): Promise<PracticeEntry | undefined> {
  const all = await loadPracticeSince(localDay(new Date(Date.now() - 60 * 86400_000)));
  return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
}

export { changed as notifyDataChanged };

/* ---------- whole-database snapshot / restore (backups and Drive sync) ---------- */

export type AllData = { songs: Song[]; practice: PracticeEntry[]; tombstones: Tombstone[] };

/** Everything that goes into a backup, read in one transaction so it is consistent. */
export async function loadAllData(): Promise<AllData> {
  const db = await getDb();
  const tx = db.transaction(['songs', 'practice', 'meta'], 'readonly');
  const [rawSongs, rawPractice, rawTombs] = await Promise.all([
    tx.objectStore('songs').getAll(),
    tx.objectStore('practice').getAll(),
    tx.objectStore('meta').get('tombstones'),
  ]);
  await tx.done;
  const songs: Song[] = [];
  for (const r of rawSongs) {
    try {
      songs.push(normalizeSong(r).song);
    } catch {
      /* unreadable records stay in the database but can't be backed up */
    }
  }
  return {
    songs,
    practice: rawPractice.map(normalizePractice).filter((e): e is PracticeEntry => !!e),
    tombstones: parseTombstones(rawTombs),
  };
}

/** Replace all songs, practice and tombstones in one transaction (restore / pull). Validates everything first. */
export async function replaceAllData(data: AllData): Promise<void> {
  if (data.songs.length > LIMITS.songsMax) throw new Error(`More than ${LIMITS.songsMax} songs.`);
  if (data.practice.length > LIMITS.practiceEntriesMax) throw new Error('Too many practice entries.');
  for (const s of data.songs) assertCanonical(s);
  const practice = data.practice.map((p) => {
    const n = normalizePractice(p);
    if (!n) throw new Error('Invalid practice entry');
    return n;
  });
  await writeTx(['songs', 'versions', 'practice'], async (tx) => {
    const songs = tx.objectStore('songs');
    await songs.clear();
    for (const s of data.songs) await songs.put(s);
    const keep = new Set(data.songs.map((s) => s.id));
    const versions = tx.objectStore('versions');
    let cursor = await versions.openCursor();
    while (cursor) {
      if (!keep.has(cursor.value.songId)) await cursor.delete();
      cursor = await cursor.continue();
    }
    const ps = tx.objectStore('practice');
    await ps.clear();
    for (const p of practice) await ps.put(p);
    await tx.objectStore('meta').put(capTombstones(data.tombstones), 'tombstones');
  });
  changed('restore');
}
