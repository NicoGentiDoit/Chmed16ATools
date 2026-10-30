/**
 * Locale state: ordered selector list, endonyms, switching and subscriptions.
 *
 * Nothing here touches a real browser: detection is injectable (Node has no
 * `navigator.languages`-driven UI) and persistence takes a storage facade.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  detectLocale,
  FALLBACK_LOCALE,
  getLocale,
  initLocale,
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  onLocaleChange,
  setLocale,
} from '../locale';
import { readStoredLocale, type StorageFacade } from '../storage';

function memoryStorage(initial: Record<string, string> = {}): StorageFacade {
  const values = { ...initial };
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

describe('locale catalogue', () => {
  it('keeps the selector order it, de, fr, en, de-CH', () => {
    expect(LOCALES).toEqual(['it', 'de', 'fr', 'en', 'de-CH']);
  });

  it('labels every locale with its own name', () => {
    expect(LOCALES.map((locale) => LOCALE_LABELS[locale])).toEqual([
      'Italiano',
      'Deutsch',
      'Français',
      'English',
      'Deutsch (Schweiz)',
    ]);
    const labels = LOCALES.map((locale) => LOCALE_LABELS[locale]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim()).not.toBe('');
  });

  it('falls back to en, never to the first selector entry', () => {
    expect(FALLBACK_LOCALE).toBe('en');
  });

  it('narrows exact locale tags only', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
    expect(isLocale('de-ch')).toBe(false);
    expect(isLocale('en-US')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('locale switching', () => {
  it('reports the new locale to subscribers until unsubscribed', () => {
    const seen: string[] = [];
    const unsubscribe = onLocaleChange((locale) => seen.push(locale));

    setLocale('de', memoryStorage());
    setLocale('fr', memoryStorage());
    unsubscribe();
    setLocale('it', memoryStorage());

    expect(seen).toEqual(['de', 'fr']);
    setLocale('en', null);
  });

  it('does not notify when the locale is unchanged', () => {
    const listener = vi.fn();
    const unsubscribe = onLocaleChange(listener);

    setLocale('de', null);
    listener.mockClear();
    setLocale('de', null);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    setLocale('en', null);
  });

  it('persists an explicit choice', () => {
    const storage = memoryStorage();
    setLocale('de-CH', storage);

    expect(getLocale()).toBe('de-CH');
    expect(readStoredLocale(storage)).toBe('de-CH');
    setLocale('en', null);
  });
});

describe('initLocale', () => {
  it('restores a stored locale on startup', () => {
    const locale = initLocale(memoryStorage({ 'chmed-locale': 'fr' }));

    expect(locale).toBe('fr');
    expect(getLocale()).toBe('fr');
    setLocale('en', null);
  });

  it('ignores an unsupported stored tag and detects instead', () => {
    expect(initLocale(memoryStorage({ 'chmed-locale': 'klingon' }))).toBe(detectLocale());
    setLocale('en', null);
  });

  it('detects when nothing is stored', () => {
    expect(initLocale(null)).toBe(detectLocale());
    setLocale('en', null);
  });

  it('detects en outside a browser', () => {
    // Node's navigator (if present) reports en-US, and no navigator at all also
    // means en: the documented fallback.
    expect(detectLocale()).toBe('en');
  });
});
