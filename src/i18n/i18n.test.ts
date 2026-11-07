import { afterEach, describe, expect, it as test } from 'vitest';
import { en, enExtra } from './en';
import { it } from './it';
import { de } from './de';
import { detectLang, setLangForTests, t } from './index';
import { formatNoteName, setNamingForTests } from './noteNames';
import { noteName, spokenName } from '../music/pitch';
import type { Pitch } from '../model/types';

afterEach(() => {
  setLangForTests('en');
  setNamingForTests('auto');
});

describe('translations', () => {
  test.each([['Italian', it], ['German', de]])('%s has every English key, with the same kind of entry', (_, dict) => {
    const all = { ...en, ...enExtra } as Record<string, unknown>;
    const other = dict as Record<string, unknown>;
    expect(Object.keys(other).sort()).toEqual(Object.keys(all).sort());
    for (const k of Object.keys(all)) expect(typeof other[k], k).toBe(typeof all[k]);
    for (const k of Object.keys(all)) if (typeof all[k] === 'function') expect((other[k] as (...a: unknown[]) => unknown).length, k).toBe((all[k] as (...a: unknown[]) => unknown).length);
  });
  test('switches language and handles plurals', () => {
    expect(t('lib.meta', 1, 100)).toBe('1 bar · 100 bpm · Trumpet in B♭');
    setLangForTests('it');
    expect(t('lib.meta', 16, 100)).toBe('16 battute · 100 bpm · Tromba in Si♭');
    expect(t('lib.greeting')).toBe('Pronto a suonare?');
    setLangForTests('de');
    expect(t('lib.meta', 1, 100)).toBe('1 Takt · 100 bpm · Trompete in B');
    expect(t('lib.meta', 16, 100)).toBe('16 Takte · 100 bpm · Trompete in B');
  });
  test('detects the device language', () => {
    expect(detectLang(['it-IT', 'en'])).toBe('it');
    expect(detectLang(['de-CH', 'en-US'])).toBe('de');
    expect(detectLang(['fr-FR', 'en-US'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
});

const p = (step: Pitch['step'], alter: Pitch['alter'], octave = 4): Pitch => ({ step, alter, octave });

describe('note names', () => {
  test('German names', () => {
    const names = [p('B', -1), p('B', 0), p('F', 1), p('E', -1), p('A', -1), p('C', 1), p('G', -1), p('D', 0)].map((x) => formatNoteName(x, 'german'));
    expect(names).toEqual(['B', 'H', 'Fis', 'Es', 'As', 'Cis', 'Ges', 'D']);
  });
  test('solfège and letters', () => {
    expect(formatNoteName(p('B', -1), 'solfege')).toBe('Si♭');
    expect(formatNoteName(p('G', 1), 'solfege')).toBe('Sol♯');
    expect(formatNoteName(p('B', -1), 'letters')).toBe('B♭');
  });
  test('note names follow the language unless chosen separately', () => {
    expect(noteName(p('B', -1))).toBe('B♭');
    setLangForTests('it');
    expect(noteName(p('B', -1))).toBe('Si♭');
    expect(spokenName(p('B', -1))).toBe('Si bemolle 4');
    setLangForTests('de');
    expect(noteName(p('B', -1))).toBe('B');
    expect(noteName(p('B', 0))).toBe('H');
    setLangForTests('it');
    setNamingForTests('german');
    expect(noteName(p('B', -1))).toBe('B');
    expect(noteName(p('B', 0))).toBe('H');
    expect(spokenName(p('F', 1))).toBe('Fis 4');
  });
});
