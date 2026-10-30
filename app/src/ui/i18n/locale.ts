/**
 * Locale state: the single place that knows which language the UI is in.
 *
 * Module-level state plus a subscription list (no framework): `text()` reads
 * {@link getLocale} on every call, and phases 2+ re-apply static labels and
 * refresh open panels through {@link onLocaleChange} after {@link setLocale}.
 *
 * Browser APIs live behind thin wrappers: detection in `detect.ts` and
 * persistence in `storage.ts`. Both are injectable so this module is exercised
 * in Node without `navigator`/`localStorage` stubs.
 */

import { browserLanguageCandidates, detectLocaleFrom } from './detect';
import { browserStorage, readStoredLocale, writeStoredLocale, type StorageFacade } from './storage';

/**
 * Supported UI locales.
 *
 * `de-CH` is a vocabulary variant of `de` (ß → ss, Swiss phrasing), never a
 * separate parser language family.
 */
export type Locale = 'it' | 'de' | 'fr' | 'en' | 'de-CH';

/** Selector order, as required by the product: it, de, fr, en, de-CH. */
export const LOCALES = ['it', 'de', 'fr', 'en', 'de-CH'] as const satisfies readonly Locale[];

/** Locale used when nothing is stored and nothing matches the browser. */
export const FALLBACK_LOCALE: Locale = 'en';

/** Endonym for each locale: a selector must label languages in their own name. */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  it: 'Italiano',
  de: 'Deutsch',
  fr: 'Français',
  en: 'English',
  'de-CH': 'Deutsch (Schweiz)',
};

/** Receives the new locale after every effective change. */
export type LocaleListener = (locale: Locale) => void;

const listeners = new Set<LocaleListener>();

let currentLocale: Locale = FALLBACK_LOCALE;

/** Narrows an untyped value (stored tag, `<select>` value) to a locale. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The locale the UI currently renders in. */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Detects the browser preference, falling back to `en`. Thin wrapper: the pure
 * decision lives in `detectLocaleFrom`.
 */
export function detectLocale(): Locale {
  return detectLocaleFrom(browserLanguageCandidates());
}

/**
 * Adopts the persisted locale when there is one, otherwise the detected one.
 * Called once at startup; the auto-detected value is NOT persisted, so a later
 * browser-language change is still honoured until the user chooses explicitly.
 */
export function initLocale(storage: StorageFacade | null = browserStorage()): Locale {
  const stored = readStoredLocale(storage);
  const next = stored !== null && isLocale(stored) ? stored : detectLocale();
  applyLocale(next);
  return currentLocale;
}

/**
 * Switches the locale, persists the explicit choice and notifies subscribers.
 * A no-op when the locale is unchanged, so re-selecting the same option does not
 * trigger a re-render.
 *
 * Persistence happens BEFORE the notification on purpose: listeners re-render the
 * UI and one of them throwing must not cost the user's explicit choice (the
 * locale would otherwise reset on reload even though the UI already switched).
 */
export function setLocale(next: Locale, storage: StorageFacade | null = browserStorage()): void {
  if (next === currentLocale) return;
  writeStoredLocale(next, storage);
  applyLocale(next);
}

/**
 * Subscribes to locale changes; returns the unsubscribe function so a disposed
 * panel can detach.
 */
export function onLocaleChange(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyLocale(next: Locale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  for (const listener of [...listeners]) listener(currentLocale);
}
