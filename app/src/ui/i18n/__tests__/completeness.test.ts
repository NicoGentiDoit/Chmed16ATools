/**
 * Per-locale completeness — fail-closed (i18n plan, phase 10).
 *
 * Three invariants, all asserted for the translated dictionaries (`it`, `de`,
 * `fr`), for the merged `de-CH` dictionary and, where it applies, for the raw
 * `de-CH` delta:
 *
 * 1. **Key set** — every locale covers exactly the English key set. A missing
 *    key is a failing test, not a silent runtime fallback to English.
 * 2. **Values** — every entry is a non-empty, already-trimmed string: a blank
 *    label would render as an empty control.
 * 3. **Placeholders** — for every key, the set of `{token}` placeholders in each
 *    locale equals the English set. `format()` substitutes by name and leaves
 *    unknown tokens untouched, so a translation that drops, renames or invents a
 *    placeholder would either print a literal `{value}` or swallow a value.
 *
 * Deliberate negative checks (what must make this suite fail):
 * - delete any key from `it`/`de`/`fr` (or from `de`): invariant 1 fails with the
 *   locale name as the message context;
 * - set any entry to `''` or to `'   '`: invariant 2 fails on that key;
 * - drop/add/rename a `{token}` in one locale (e.g. translate `{value}` away):
 *   invariant 3 fails on that locale/key pair;
 * - add a placeholder to a key that has none in English (a token no caller will
 *   ever fill): invariant 3 fails as well, because the English set is empty.
 *
 * What is deliberately NOT asserted: value difference from English. Some
 * legitimate coincidences exist (acronyms such as `CHMED16A`, short labels such
 * as `Patient`, `GLN`, `PDF`), listed in the phase 6 report; asserting
 * difference would flag correct translations.
 *
 * Pure dictionary introspection: no DOM, no jsdom, no storage — the module is
 * imported directly and the resolver is exercised through `dictionaryFor` /
 * `resolveText`.
 */

import { describe, expect, it } from 'vitest';

import { dictionaryFor, LOCALES, resolveMessage, resolveText, type Locale } from '..';
import { de } from '../messages/de';
import { deCH } from '../messages/de-CH';
import { en, type MessageKey } from '../messages/en';

/** Locales that ship a complete dictionary of their own (`de-CH` is merged). */
const TRANSLATED_LOCALES = ['it', 'de', 'fr'] as const satisfies readonly Locale[];

/** Locales resolved through a dictionary that must be complete for the user. */
const RESOLVED_LOCALES = ['it', 'de', 'fr', 'en', 'de-CH'] as const satisfies readonly Locale[];

const EN_KEYS = Object.keys(en) as MessageKey[];
const PLACEHOLDER = /\{(\w+)\}/g;

/** The `{name}` tokens of one template, sorted so set comparison is order-free. */
function placeholderTokens(template: string): string[] {
  const tokens: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const token = match[1];
    if (token !== undefined) tokens.push(token);
  }
  return tokens.sort();
}

/** English templates: every key whose value carries at least one placeholder. */
const TEMPLATE_KEYS = EN_KEYS.filter((key) => placeholderTokens(en[key]).length > 0);

describe('per-locale key set (fail-closed)', () => {
  it('gives every translated locale exactly the English key set', () => {
    // Negative check: removing a key from one dictionary must fail here.
    for (const locale of TRANSLATED_LOCALES) {
      const dictionary = dictionaryFor(locale);
      expect(Object.keys(dictionary).sort(), locale).toEqual([...EN_KEYS].sort());
    }
  });

  it('gives the merged de-CH dictionary exactly the English key set', () => {
    // `de-CH` is sparse by policy; completeness comes from the `de` base plus
    // the delta. Negative check: a delta key absent from `de` would surface here.
    const swiss = dictionaryFor('de-CH');
    expect(Object.keys(swiss).sort()).toEqual([...EN_KEYS].sort());
  });

  it('lets the raw de-CH delta contain only English keys', () => {
    // Negative check: adding `deCH.someRenamedKey` must fail here, before the
    // resolver silently carries a key the type union does not know.
    const englishKeys = new Set(EN_KEYS);
    for (const key of Object.keys(deCH)) {
      expect(englishKeys.has(key as MessageKey), key).toBe(true);
    }
  });
});

describe('non-empty translated values (fail-closed)', () => {
  it('fills every key of every locale with a trimmed, non-empty string', () => {
    // Negative check: an empty or whitespace-only value must fail on its key.
    for (const locale of RESOLVED_LOCALES) {
      const dictionary = dictionaryFor(locale);
      for (const key of EN_KEYS) {
        const value = dictionary[key];
        expect(typeof value, `${locale}/${key}`).toBe('string');
        expect(value?.trim(), `${locale}/${key}`).not.toBe('');
        expect(value, `${locale}/${key}`).toBe(value?.trim());
      }
    }
  });
});

describe('placeholder invariant (fail-closed)', () => {
  it('finds the expected number of English templates', () => {
    // A floor, not a pin: later phases may add templates, but extraction must
    // never silently find none (that would make the per-key test vacuous).
    expect(TEMPLATE_KEYS.length).toBeGreaterThanOrEqual(29);
    for (const key of [
      'versionBadge',
      'pdfSuccess',
      'recapValid',
      'taskAddSectionData',
      'coreParseBadDose',
      'coreParseUnitLeak',
    ] as const) {
      expect(TEMPLATE_KEYS, key).toContain(key);
    }
  });

  it('keeps the placeholder token set identical to English in every locale', () => {
    // Covers every key, not just the English templates: a locale that invents a
    // `{token}` where English has none compares against an empty English set.
    for (const key of EN_KEYS) {
      const englishTokens = placeholderTokens(en[key]);
      for (const locale of RESOLVED_LOCALES) {
        expect(placeholderTokens(dictionaryFor(locale)[key] ?? ''), `${locale}/${key}`).toEqual(
          englishTokens,
        );
      }
    }
  });

  it('never leaves a template without its placeholder', () => {
    // Negative check: a translation of `pdfSuccess` that writes "aus der Datei"
    // instead of "{pages} Seite(n)" must fail — English has `["pages"]`.
    for (const key of TEMPLATE_KEYS) {
      expect(placeholderTokens(en[key]).length, key).toBeGreaterThan(0);
      for (const locale of RESOLVED_LOCALES) {
        const tokens = placeholderTokens(dictionaryFor(locale)[key] ?? '');
        expect(tokens, `${locale}/${key}`).not.toEqual([]);
      }
    }
  });
});

describe('de-CH delta (differing entries only)', () => {
  it('keeps every delta value different from its de counterpart', () => {
    // The locked policy: the delta holds ONLY entries that differ from `de`.
    // Negative check: re-adding `uiLanguageLabel: 'Sprache'` (identical to `de`)
    // must fail here.
    for (const [key, value] of Object.entries(deCH)) {
      expect(value, key).not.toBe(de[key as MessageKey]);
    }
  });

  it('overrides only, never drops, the inherited de entries', () => {
    const swiss = dictionaryFor('de-CH');
    for (const key of EN_KEYS) {
      const overridden = Object.hasOwn(deCH, key);
      expect(swiss[key], key).toBe(overridden ? deCH[key] : de[key]);
    }
  });

  it('resolves the pruned language label through de unchanged', () => {
    // `uiLanguageLabel` no longer sits in the delta; it must still render the
    // German word for the header selector (selector options use LOCALE_LABELS).
    expect(deCH).not.toHaveProperty('uiLanguageLabel');
    expect(resolveText('de-CH', 'uiLanguageLabel')).toBe(de.uiLanguageLabel);
  });
});

describe('resolution chain stays locale → en → key', () => {
  it('resolves every key in every locale to that locale’s own text', () => {
    // Negative check: a locale that lost its dictionary would fall back to
    // English, and a key missing everywhere would resolve to its own name.
    for (const locale of LOCALES) {
      const dictionary = dictionaryFor(locale);
      for (const key of EN_KEYS) {
        const value = resolveText(locale, key);
        expect(value, `${locale}/${key}`).not.toBe(key);
        expect(value, `${locale}/${key}`).toBe(dictionary[key] ?? en[key]);
      }
    }
  });

  it('falls back to English and then to the key name', () => {
    expect(resolveMessage({}, en, 'appTitle')).toBe(en.appTitle);
    expect(resolveMessage(undefined, en, 'appTitle')).toBe(en.appTitle);
    expect(resolveMessage({}, {}, 'unbekannterSchluessel')).toBe('unbekannterSchluessel');
  });
});
