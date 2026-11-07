import { describe, expect, it } from 'vitest';
import { decide, parseSyncState, type SyncState } from './decide';

const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);
const stored: SyncState = { accountId: '123', email: 'x@y', fileId: 'file_AAAAAAAA', remoteVersion: '5', syncedHash: H1, syncedAt: '2026-01-01T00:00:00.000Z' };
const same = { fileId: 'file_AAAAAAAA', version: '5' };
const moved = { fileId: 'file_AAAAAAAA', version: '6' };

describe('decide', () => {
  it('covers the four rows of the table', () => {
    expect(decide(stored, { hash: H1, pristine: false }, same)).toBe('nothing');
    expect(decide(stored, { hash: H2, pristine: false }, same)).toBe('push');
    expect(decide(stored, { hash: H1, pristine: false }, moved)).toBe('pull');
    expect(decide(stored, { hash: H2, pristine: false }, moved)).toBe('conflict');
  });
  it('treats erasing after a sync as a local change', () => {
    expect(decide(stored, { hash: H2, pristine: true }, same)).toBe('push');
    expect(decide(stored, { hash: H2, pristine: true }, moved)).toBe('conflict');
  });
  it('treats a different file id as a remote change', () => {
    expect(decide(stored, { hash: H1, pristine: false }, { fileId: 'file_BBBBBBBB', version: '5' })).toBe('pull');
    expect(decide(stored, { hash: H2, pristine: false }, { fileId: 'file_BBBBBBBB', version: '5' })).toBe('conflict');
  });
  it('lets only a pristine fresh device take the remote copy silently', () => {
    expect(decide(null, { hash: H1, pristine: true }, same)).toBe('pull');
    expect(decide(null, { hash: H1, pristine: false }, same)).toBe('conflict');
    expect(decide(null, { hash: H1, pristine: true }, null)).toBe('create');
  });
  it('re-creates a file that disappeared', () => {
    expect(decide(stored, { hash: H1, pristine: false }, null)).toBe('create');
  });
});

describe('parseSyncState', () => {
  it('accepts valid state and rejects tampered state', () => {
    expect(parseSyncState(stored)).toEqual(stored);
    expect(parseSyncState({ ...stored, fileId: '../x' })).toBeNull();
    expect(parseSyncState({ ...stored, remoteVersion: '5; drop' })).toBeNull();
    expect(parseSyncState({ ...stored, syncedHash: 'zz' })).toBeNull();
    expect(parseSyncState('nope')).toBeNull();
  });
});
