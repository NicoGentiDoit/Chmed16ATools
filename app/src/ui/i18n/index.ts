/**
 * Locale runtime and message resolver — the public surface of the i18n layer.
 *
 * Resolution chain for `resolveText(locale, key)`:
 * 1. the effective dictionary of `locale` — for `de-CH` this is `de` merged with
 *    the `de-CH` delta, computed once and cached, never per lookup;
 * 2. the English dictionary (the single source of truth for keys);
 * 3. the key name itself, so a missing entry shows up as text, never as blank.
 *
 * Dictionaries are static bundled modules: no fetch, no dependency, offline-safe.
 * `ui/strings.ts` re-exports this module for compatibility, so existing
 * `text()`/`format()`/`STRINGS` imports keep working untouched.
 */

import { getLocale, type Locale } from './locale';
import { de } from './messages/de';
import { deCH } from './messages/de-CH';
import { en, type MessageDelta, type MessageKey, type Messages } from './messages/en';
import { fr } from './messages/fr';
import { it } from './messages/it';

export { format } from './format';
export {
  detectLocale,
  FALLBACK_LOCALE,
  getLocale,
  initLocale,
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  onLocaleChange,
  setLocale,
} from './locale';
export type { Locale, LocaleListener } from './locale';
export type { MessageDelta, MessageKey, Messages } from './messages/en';

/** The English dictionary, kept under its historical name for compatibility. */
export { en as STRINGS };

/** A panel may only request keys of the English source dictionary. */
export type UiStringKey = MessageKey;

/** Complete dictionaries; `de-CH` is derived, so it is not part of this map. */
const BASE_DICTIONARIES: Readonly<Record<Exclude<Locale, 'de-CH'>, Messages>> = {
  it,
  de,
  fr,
  en,
};

const dictionaryCache = new Map<Locale, Messages>();

/**
 * Returns the effective dictionary for a locale. The `de-CH` merge over `de` is
 * computed once and cached, so switching locale pays it once and `text()` calls
 * stay a plain lookup.
 */
export function dictionaryFor(locale: Locale): Messages {
  const cached = dictionaryCache.get(locale);
  if (cached !== undefined) return cached;

  const dictionary = buildDictionary(locale);
  dictionaryCache.set(locale, dictionary);
  return dictionary;
}

function buildDictionary(locale: Locale): Messages {
  if (locale === 'de-CH') return mergeMessages(de, deCH);
  return BASE_DICTIONARIES[locale];
}

/**
 * Merges sparse overrides over a complete dictionary without letting an
 * `undefined` value shadow a real entry.
 */
export function mergeMessages(base: Messages, delta: MessageDelta): Messages {
  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * The fallback chain alone: locale entry → English entry → key name. Exported
 * separately so the chain is tested without depending on any real dictionary.
 */
export function resolveMessage(
  messages: Messages | undefined,
  fallback: Messages,
  key: string,
): string {
  return messages?.[key] ?? fallback[key] ?? key;
}

/** Resolves one key for an explicit locale (used by tests and by non-UI code). */
export function resolveText(locale: Locale, key: MessageKey): string {
  return resolveMessage(dictionaryFor(locale), en, key);
}

/** Looks up a single UI string in the current locale. */
export function text(key: UiStringKey): string {
  return resolveText(getLocale(), key);
}
