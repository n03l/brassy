import { claimWriter, getMeta, requestPersistence } from '../db/db';
import { addSeedSong } from '../db/repo';
import { readScore, scoreToSong } from '../io/importScore';
import { SEED_SONG_ID } from '../io/backup';
import { t } from '../i18n';

export const SEED_URL = `${import.meta.env.BASE_URL}songs/when-the-saints.musicxml`;

export class StorageUnavailableError extends Error {}

let booted: Promise<void> | undefined;

/** Start-up (once per tab): become the writing tab, ask for persistent storage, add the seed song once. */
export function boot(): Promise<void> {
  booted ??= doBoot();
  return booted;
}

async function doBoot(): Promise<void> {
  try {
    await claimWriter();
  } catch (e) {
    throw new StorageUnavailableError(
      t('app.storageUnavailable'),
      { cause: e },
    );
  }
  if (!(await getMeta('seeded'))) {
    await requestPersistence().catch(() => undefined);
    try {
      const res = await fetch(SEED_URL);
      if (!res.ok) throw new Error(`Seed song not found (${res.status})`);
      const { song } = scoreToSong(readScore(new Uint8Array(await res.arrayBuffer())), { concertPitch: false });
      // A fixed id, so the first song on two devices is the same song when backups are merged.
      await addSeedSong({ ...song, id: SEED_SONG_ID });
    } catch (e) {
      // Not fatal: the library starts empty and we try again next time.
      console.warn('Could not add the first song', e);
    }
  }
}
