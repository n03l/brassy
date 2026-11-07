import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { PracticeEntry, Song, Tombstone } from '../model/types';
import { t } from '../i18n';

export type SongVersion = { vid?: number; songId: string; savedAt: string; song: Song };

export interface BrassyDB extends DBSchema {
  songs: { key: string; value: Song };
  versions: { key: number; value: SongVersion; indexes: { bySong: string } };
  practice: { key: string; value: PracticeEntry; indexes: { byDay: string; bySong: string } };
  meta: { key: string; value: unknown };
}

export type MetaKey = 'writer' | 'seeded' | 'tombstones' | 'sync' | 'settings';

export const DB_NAME = 'brassy';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BrassyDB>> | undefined;

export function getDb(): Promise<IDBPDatabase<BrassyDB>> {
  dbPromise ??= openDB<BrassyDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Migrations go here, one `if (oldVersion < N)` block per version. They must keep existing songs.
      if (oldVersion < 1) {
        db.createObjectStore('songs', { keyPath: 'id' });
        const v = db.createObjectStore('versions', { keyPath: 'vid', autoIncrement: true });
        v.createIndex('bySong', 'songId');
        const p = db.createObjectStore('practice', { keyPath: 'id' });
        p.createIndex('byDay', 'day');
        p.createIndex('bySong', 'songId');
        db.createObjectStore('meta');
      }
    },
    blocking() {
      // A newer version of the app wants to upgrade the database: let it.
      void dbPromise?.then((db) => db.close());
      dbPromise = undefined;
    },
  });
  return dbPromise;
}

/* ---------- one writer across tabs ---------- */

export class WriterLostError extends Error {
  constructor() {
    super(t('app.writerLost'));
  }
}

const TAB_ID = crypto.randomUUID();
let lost = false;
const lostListeners = new Set<() => void>();

export function onWriterLost(fn: () => void): () => void {
  lostListeners.add(fn);
  return () => lostListeners.delete(fn);
}

export function isWriterLost(): boolean {
  return lost;
}

function markLost() {
  if (lost) return;
  lost = true;
  for (const fn of lostListeners) fn();
}

/** Called once at start: this tab becomes the only one allowed to write. */
export async function claimWriter(): Promise<void> {
  const db = await getDb();
  await db.put('meta', TAB_ID, 'writer');
  lost = false;
}

/** Re-check (e.g. when the tab becomes visible again) so the banner shows up promptly. */
export async function checkWriter(): Promise<boolean> {
  if (lost) return false;
  const db = await getDb();
  const w = await db.get('meta', 'writer');
  if (w !== TAB_ID) markLost();
  return !lost;
}

type WriteTx<S extends StoreNames<BrassyDB>[]> = IDBPTransaction<BrassyDB, [...S, 'meta'], 'readwrite'>;

/**
 * Run a write in one transaction that also reads the writer key. If another tab claimed the writer, the
 * transaction is aborted before anything is written and this tab stops saving.
 */
export async function writeTx<S extends StoreNames<BrassyDB>[], T>(stores: S, fn: (tx: WriteTx<S>) => Promise<T>): Promise<T> {
  if (lost) throw new WriterLostError();
  const db = await getDb();
  const names = [...new Set([...stores, 'meta'])] as [...S, 'meta'];
  const tx = db.transaction(names, 'readwrite') as WriteTx<S>;
  const writer = await tx.objectStore('meta').get('writer');
  if (writer !== TAB_ID) {
    tx.abort();
    await tx.done.catch(() => undefined);
    markLost();
    throw new WriterLostError();
  }
  try {
    const result = await fn(tx);
    await tx.done;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined);
    throw e;
  }
}

export async function getMeta<T = unknown>(key: MetaKey): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('meta', key)) as T | undefined;
}

export async function setMeta(key: Exclude<MetaKey, 'writer'>, value: unknown): Promise<void> {
  await writeTx(['meta'], async (tx) => {
    await tx.objectStore('meta').put(value, key);
  });
}

export async function deleteMeta(key: Exclude<MetaKey, 'writer'>): Promise<void> {
  await writeTx(['meta'], async (tx) => {
    await tx.objectStore('meta').delete(key);
  });
}

export async function requestPersistence(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

export async function persistenceStatus(): Promise<'persistent' | 'best-effort' | 'unknown'> {
  if (!navigator.storage?.persisted) return 'unknown';
  return (await navigator.storage.persisted()) ? 'persistent' : 'best-effort';
}

export type { Tombstone };
