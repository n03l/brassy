import { describe, expect, it } from 'vitest';
import { hashData, isPristine, mergeBackups, MergeTooBigError, parseBackup, SEED_SONG_ID, toBackupFile, BackupError, type BackupData } from './backup';
import { hostileSongRaw, sampleSong } from '../../test/fixtures';
import { LIMITS } from '../model/limits';
import type { PracticeEntry, Song } from '../model/types';

const song = (id: string, updatedAt: string, title = id): Song => ({ ...sampleSong(), id, title, updatedAt, createdAt: '2026-01-01T00:00:00.000Z' });
const practice = (id: string, seconds: number): PracticeEntry => ({ id, songId: 'song-1', day: '2026-01-02', startedAt: '2026-01-02T10:00:00.000Z', seconds, topSpeed: 100, loops: 0, lastBar: 1 });
const data = (songs: Song[], p: PracticeEntry[] = [], tombstones: BackupData['tombstones'] = []): BackupData => ({ songs, practice: p, tombstones });

describe('backup file', () => {
  it('produce → parse gives the same data', () => {
    const d = data([song('aaaa1', '2026-02-01T00:00:00.000Z')], [practice('p1', 70)], [{ id: 'gone1', deletedAt: '2026-01-05T00:00:00.000Z' }]);
    const parsed = parseBackup(JSON.stringify(toBackupFile(d))).data;
    expect(parsed).toEqual(d);
  });

  it('round-trips data at the limits', () => {
    const big = { ...sampleSong(), id: 'big1' };
    big.bars = Array.from({ length: LIMITS.barsMax }, (_, i) => ({ id: `b${i}`, events: Array.from({ length: 16 }, (_, j) => ({ id: `e${i}x${j}`, rest: true, duration: 'sixteenth' as const, dotted: false })) }));
    const d = data([big]);
    expect(parseBackup(JSON.stringify(toBackupFile(d))).data.songs[0]).toEqual(big);
  });

  it('repairs hostile songs, skips junk and keeps the newest duplicate', () => {
    const text = JSON.stringify({
      format: 'brassy-backup', version: 1, exportedAt: 'x',
      songs: [hostileSongRaw(), 'junk', null, song('dup11', '2026-01-01T00:00:00.000Z', 'old'), song('dup11', '2026-03-01T00:00:00.000Z', 'new')],
      practice: [practice('p1', 10), { id: '__proto__' }, practice('p1', 20)],
      tombstones: [{ id: 'x1234', deletedAt: 'yesterday' }, { id: 'y1234', deletedAt: '2026-01-01' }],
    });
    const r = parseBackup(text);
    expect(r.skippedSongs).toBe(2);
    expect(r.repairedSongs).toBe(1);
    expect(r.data.songs.find((s) => s.id === 'dup11')!.title).toBe('new');
    expect(r.data.practice).toHaveLength(1);
    expect(r.data.tombstones.map((t) => t.id)).toEqual(['y1234']);
  });

  it('refuses things that are not backups, newer formats and too many songs', () => {
    expect(() => parseBackup('<html>')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"brassy-backup","version":99,"songs":[]}')).toThrow(/newer/);
    const many = Array.from({ length: LIMITS.songsMax + 1 }, (_, i) => song(`s${i}xx`, '2026-01-01T00:00:00.000Z'));
    expect(() => parseBackup(JSON.stringify(toBackupFile(data(many))))).toThrow(BackupError);
  });
});

describe('merge', () => {
  it('keeps the newer edit of each song and combines practice', () => {
    const a = data([song('s1xx', '2026-01-02T00:00:00.000Z', 'A-newer'), song('s2xx', '2026-01-01T00:00:00.000Z')], [practice('p1', 10)]);
    const b = data([song('s1xx', '2026-01-01T00:00:00.000Z', 'B-older'), song('s3xx', '2026-01-01T00:00:00.000Z')], [practice('p1', 30), practice('p2', 5)]);
    const m = mergeBackups(a, b);
    expect(m.songs.map((s) => s.id)).toEqual(['s1xx', 's2xx', 's3xx']);
    expect(m.songs[0]!.title).toBe('A-newer');
    expect(m.practice.map((p) => [p.id, p.seconds])).toEqual([['p1', 30], ['p2', 5]]);
  });

  it('does not bring deleted songs back, unless edited after the deletion', () => {
    const local = data([], [], [{ id: 's1xx', deletedAt: '2026-01-05T00:00:00.000Z' }, { id: 's2xx', deletedAt: '2026-01-05T00:00:00.000Z' }]);
    const remote = data([song('s1xx', '2026-01-04T00:00:00.000Z'), song('s2xx', '2026-01-06T00:00:00.000Z')]);
    const m = mergeBackups(local, remote);
    expect(m.songs.map((s) => s.id)).toEqual(['s2xx']);
    expect(m.tombstones.map((t) => t.id)).toEqual(['s1xx']);
  });

  it('refuses a merge over the song limit', () => {
    const half = (p: string) => data(Array.from({ length: LIMITS.songsMax / 2 + 1 }, (_, i) => song(`${p}${i}xxx`, '2026-01-01T00:00:00.000Z')));
    expect(() => mergeBackups(half('a'), half('b'))).toThrow(MergeTooBigError);
  });
});

describe('hash and pristine', () => {
  it('hashes independent of order', async () => {
    const x = data([song('s1xx', '2026-01-01T00:00:00.000Z'), song('s2xx', '2026-01-01T00:00:00.000Z')]);
    const y = data([...x.songs].reverse());
    expect(await hashData(x)).toBe(await hashData(y));
    expect(await hashData(x)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('detects a brand-new install', () => {
    const seed = { ...song(SEED_SONG_ID, '2026-01-01T00:00:00.000Z') };
    expect(isPristine(data([seed]))).toBe(true);
    expect(isPristine(data([]))).toBe(true);
    expect(isPristine(data([{ ...seed, updatedAt: '2026-02-01T00:00:00.000Z' }]))).toBe(false);
    expect(isPristine(data([seed], [practice('p1', 5)]))).toBe(false);
  });
});
