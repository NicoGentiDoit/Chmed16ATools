/**
 * Browser language detection.
 *
 * The decision logic is pure and takes language tags as input
 * ({@link localeFromTag}, {@link detectLocaleFrom}), so the detection matrix is
 * unit-tested without a browser. Only {@link browserLanguageCandidates} touches
 * the browser APIs (`navigator.languages` / `navigator.language`), and it reads
 * both defensively: a partial `navigator` (Node 21+ has one without
 * `languages`) yields an empty candidate list instead of a throw.
 *
 * Rules:
 * - A `de-CH` tag (region `CH`, any private-use suffix) resolves to `de-CH`, so
 *   the exact Swiss match wins over its `de` parent.
 * - Any other tag resolves by its primary language, if supported.
 * - Unsupported or empty tags are skipped; when nothing matches the result is
 *   `en` (the documented fallback, see `FALLBACK_LOCALE` in `locale.ts`).
 */

import type { Locale } from './locale';

/** Supported primary languages (region variants aside from `de-CH` inherit). */
const BASE_LOCALES: Readonly<Record<string, Locale | undefined>> = {
  it: 'it',
  de: 'de',
  fr: 'fr',
  en: 'en',
};

/**
 * Resolves one BCP-47-ish tag (`de-CH`, `de_CH`, `it-IT`, `en`) to a supported
 * locale, or `undefined` when the language is not supported.
 */
export function localeFromTag(tag: string): Locale | undefined {
  const normalized = tag.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === '') return undefined;

  const [language, region] = normalized.split('-');
  if (language === undefined) return undefined;
  if (language === 'de' && region === 'ch') return 'de-CH';

  return BASE_LOCALES[language];
}

/**
 * Picks the first supported locale from the ordered candidate list, preferring
 * an exact `de-CH` match over its `de` parent because candidates are ordered by
 * user preference. `undefined`/empty input yields `en`.
 */
export function detectLocaleFrom(candidates: readonly string[] | undefined): Locale {
  for (const candidate of candidates ?? []) {
    const locale = localeFromTag(candidate);
    if (locale !== undefined) return locale;
  }
  return 'en';
}

/**
 * Reads the browser's language preference, most specific first. This is the only
 * function in the module that touches `navigator`; it returns an empty list
 * outside a browser (Node tests) so detection falls back to `en`.
 *
 * `navigator` is not enough of a guarantee: Node 21+ exposes a partial
 * `navigator` without `languages`, so that property is read defensively instead
 * of being spread — throwing here would abort `initLocale()` at app boot.
 */
export function browserLanguageCandidates(): readonly string[] {
  if (typeof navigator === 'undefined') return [];

  const languages = Array.isArray(navigator.languages) ? [...navigator.languages] : [];
  if (typeof navigator.language === 'string' && navigator.language !== '') {
    languages.push(navigator.language);
  }
  return languages;
}
