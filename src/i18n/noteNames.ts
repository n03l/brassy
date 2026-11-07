import { useSyncExternalStore } from 'react';
import type { Pitch } from '../model/types';
import { currentLang } from './index';

/**
 * How note names are written, independent of the app language (a child may read the UI in Italian but learn
 * the trumpet with German note names).
 */
export type NoteNaming = 'letters' | 'german' | 'solfege';
export type NoteNamingPref = 'auto' | NoteNaming;
export const NAMINGS: { id: NoteNaming; example: string }[] = [
  { id: 'letters', example: 'C D E F G A B' },
  { id: 'german', example: 'C D E F G A H' },
  { id: 'solfege', example: 'Do Re Mi Fa Sol La Si' },
];

const PREF_KEY = 'brassy-note-names';

export function getNamingPref(): NoteNamingPref {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(PREF_KEY);
    return v === 'letters' || v === 'german' || v === 'solfege' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let pref: NoteNamingPref = getNamingPref();
const subs = new Set<() => void>();

export function setNamingPref(p: NoteNamingPref) {
  try {
    if (p === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, p);
  } catch {
    /* private mode: lasts until reload */
  }
  pref = p;
  subs.forEach((f) => f());
}

/** Only for tests. */
export function setNamingForTests(p: NoteNamingPref) {
  pref = p;
}

export function useNamingPref(): NoteNamingPref {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => pref, () => pref);
}

/** "Same as the language": Do Re Mi in Italian, German names (H, B, Fis) in German, letters in English. */
export function currentNaming(): NoteNaming {
  if (pref !== 'auto') return pref;
  const l = currentLang();
  return l === 'it' ? 'solfege' : l === 'de' ? 'german' : 'letters';
}

const SOLFEGE: Record<Pitch['step'], string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/** German names: H = B natural, B = B flat, sharps add -is, flats add -es (Es, As shortened). */
export function germanName(p: Pick<Pitch, 'step' | 'alter'>): string {
  if (p.step === 'B') return p.alter === -1 ? 'B' : p.alter === 1 ? 'His' : 'H';
  if (p.alter === 1) return `${p.step}is`;
  if (p.alter === -1) return p.step === 'E' ? 'Es' : p.step === 'A' ? 'As' : `${p.step}es`;
  return p.step;
}

/** Name without octave, e.g. "B♭", "Si♭", "B" (German B♭), "Fis". */
export function formatNoteName(p: Pick<Pitch, 'step' | 'alter'>, naming = currentNaming()): string {
  if (naming === 'german') return germanName(p);
  const base = naming === 'solfege' ? SOLFEGE[p.step] : p.step;
  return base + (p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : '');
}
