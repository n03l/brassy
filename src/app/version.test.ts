import { describe, expect, it } from 'vitest';
import { safeCommit, safeRepoUrl } from './version';

describe('version', () => {
  it('accepts only http(s) repository URLs', () => {
    expect(safeRepoUrl('https://example.org/me/brassy/')).toBe('https://example.org/me/brassy');
    expect(safeRepoUrl('javascript:alert(1)')).toBe('https://github.com/n03l/brassy');
    expect(safeRepoUrl('<img src=x onerror=alert(1)>')).toBe('https://github.com/n03l/brassy');
    expect(safeRepoUrl(undefined)).toBe('https://github.com/n03l/brassy');
  });
  it('accepts only hex commit ids', () => {
    expect(safeCommit('9CA3BAA0123')).toBe('9ca3baa0123');
    expect(safeCommit('9ca3baa/../x')).toBe('');
    expect(safeCommit('abc')).toBe('');
    expect(safeCommit(undefined)).toBe('');
  });
});
