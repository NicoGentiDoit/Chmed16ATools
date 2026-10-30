/**
 * Browser-language detection matrix.
 *
 * The decision is pure (`localeFromTag` / `detectLocaleFrom`), so the matrix is
 * covered without touching `navigator`: exact tags, region variants, the
 * `de-CH`-over-`de` precedence, unknown tags and the `en` fallback.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserLanguageCandidates, detectLocaleFrom, localeFromTag } from '../detect';
import type { Locale } from '../locale';

describe('localeFromTag', () => {
  it('maps exact supported tags', () => {
    expect(localeFromTag('it')).toBe('it');
    expect(localeFromTag('de')).toBe('de');
    expect(localeFromTag('fr')).toBe('fr');
    expect(localeFromTag('en')).toBe('en');
    expect(localeFromTag('de-CH')).toBe('de-CH');
  });

  it('prefers de-CH over its de parent', () => {
    // The exact Swiss tag must never collapse to plain German: de-CH is the
    // vocabulary variant (ß → ss, Swiss phrasing) the plan defines.
    expect(localeFromTag('de-CH')).toBe('de-CH');
    expect(localeFromTag('de-CH-1996')).toBe('de-CH');
  });

  it('is case-insensitive and accepts underscore separators', () => {
    expect(localeFromTag('DE-ch')).toBe('de-CH');
    expect(localeFromTag('de_ch')).toBe('de-CH');
    expect(localeFromTag('IT-it')).toBe('it');
  });

  it('maps region variants to their primary language', () => {
    const cases: ReadonlyArray<readonly [string, Locale]> = [
      ['it-IT', 'it'],
      ['it-CH', 'it'],
      ['de-DE', 'de'],
      ['de-AT', 'de'],
      ['fr-FR', 'fr'],
      ['fr-CH', 'fr'],
      ['en-GB', 'en'],
      ['en-US', 'en'],
    ];
    for (const [tag, expected] of cases) {
      expect(localeFromTag(tag), tag).toBe(expected);
    }
  });

  it('rejects unsupported and empty tags', () => {
    expect(localeFromTag('ja-JP')).toBeUndefined();
    expect(localeFromTag('de-LI')).toBe('de');
    expect(localeFromTag('')).toBeUndefined();
    expect(localeFromTag('   ')).toBeUndefined();
    expect(localeFromTag('-')).toBeUndefined();
  });
});

describe('detectLocaleFrom', () => {
  it('takes the first supported candidate in preference order', () => {
    expect(detectLocaleFrom(['de-CH', 'de', 'en'])).toBe('de-CH');
    expect(detectLocaleFrom(['de-DE', 'de-CH'])).toBe('de');
    expect(detectLocaleFrom(['it-IT', 'de'])).toBe('it');
  });

  it('skips unsupported candidates instead of stopping at them', () => {
    expect(detectLocaleFrom(['ja-JP', 'fr-CA', 'en'])).toBe('fr');
  });

  it('falls back to en when nothing matches', () => {
    expect(detectLocaleFrom([])).toBe('en');
    expect(detectLocaleFrom(undefined)).toBe('en');
    expect(detectLocaleFrom(['ja-JP', 'ko-KR'])).toBe('en');
  });
});

describe('browserLanguageCandidates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no candidates when navigator carries neither list nor language', () => {
    // The empty-candidates path: detection must fall back to en, not throw.
    vi.stubGlobal('navigator', {});
    expect(browserLanguageCandidates()).toEqual([]);
    expect(detectLocaleFrom(browserLanguageCandidates())).toBe('en');
  });

  it('tolerates a partial navigator without languages (Node 21+)', () => {
    vi.stubGlobal('navigator', { language: 'de-CH' });
    expect(browserLanguageCandidates()).toEqual(['de-CH']);
  });

  it('reads languages first and appends the single language', () => {
    vi.stubGlobal('navigator', { languages: ['fr-CH', 'fr'], language: 'en-GB' });
    expect(browserLanguageCandidates()).toEqual(['fr-CH', 'fr', 'en-GB']);
  });
});
