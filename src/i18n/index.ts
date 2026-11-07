import { useSyncExternalStore } from 'react';
import { en, enExtra } from './en';
import { it } from './it';
import { de } from './de';

const enAll = { ...en, ...enExtra };
type En = typeof enAll;
export type Key = keyof En;
/** Same keys and parameters as English, so a missing or mistyped translation is a type error. */
export type Messages = { [K in Key]: En[K] extends (...a: infer A) => string ? (...a: A) => string : string };
type Args<K extends Key> = En[K] extends (...a: infer A) => string ? A : [];

export type Lang = 'en' | 'it' | 'de';
export type LangPref = 'auto' | Lang;
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'it', name: 'Italiano' },
  { id: 'de', name: 'Deutsch' },
];

const DICTS: Record<Lang, Messages> = { en: enAll as Messages, it, de };
const PREF_KEY = 'brassy-lang';

/** Device language: the first of the device's languages that Brassy speaks, otherwise English. */
export function detectLang(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'it') return 'it';
    if (base === 'de') return 'de';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function getPref(): LangPref {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(PREF_KEY);
    return v === 'en' || v === 'it' || v === 'de' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function resolve(pref: LangPref): Lang {
  return pref === 'auto' ? detectLang() : pref;
}

let lang: Lang = typeof window === 'undefined' ? 'en' : resolve(getPref());
const subs = new Set<() => void>();

function apply(l: Lang) {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  subs.forEach((f) => f());
}

/** Per-device preference (a UI convenience, kept in localStorage; never synced). */
export function setPref(pref: LangPref) {
  try {
    if (pref === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* private mode: the choice lasts until reload */
  }
  apply(resolve(pref));
}

export function currentLang(): Lang {
  return lang;
}

/** Only for tests. */
export function setLangForTests(l: Lang) {
  apply(l);
}

export function useLang(): Lang {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lang, () => lang);
}

/** Translate. Function entries take parameters (numbers, names) and handle plurals. */
export function t<K extends Key>(key: K, ...args: Args<K>): string {
  const v = (DICTS[lang][key] ?? DICTS.en[key]) as unknown;
  return typeof v === 'function' ? (v as (...a: unknown[]) => string)(...args) : (v as string);
}

/** Locale for dates and numbers. */
export function locale(): string {
  return lang === 'it' ? 'it-IT' : lang === 'de' ? 'de-DE' : 'en-GB';
}

if (typeof document !== 'undefined') document.documentElement.lang = lang;
