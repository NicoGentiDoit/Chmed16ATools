/**
 * Resolver chain, `de-CH` delta merge and the compatibility surface.
 *
 * Chain under test: effective dictionary (de + de-CH delta, merged once and
 * cached) → English dictionary → key name. The merge is also tested directly
 * with a synthetic delta, because the seeded `de-CH` file is intentionally empty
 * until the translation sweep fills it.
 */

import { describe, expect, it } from 'vitest';

import {
  dictionaryFor,
  format,
  LOCALES,
  mergeMessages,
  resolveMessage,
  resolveText,
  setLocale,
  STRINGS,
  text,
} from '..';
import { format as formatDirect } from '../format';
import { de as deMessages } from '../messages/de';
import { deCH } from '../messages/de-CH';
import { en, type MessageKey } from '../messages/en';
import { fr as frMessages } from '../messages/fr';
import { it as itMessages } from '../messages/it';

describe('English source dictionary', () => {
  it('is exported under its historical name', () => {
    expect(STRINGS).toBe(en);
    expect(Object.keys(STRINGS)).toEqual(Object.keys(en));
  });

  it('seeds it/de/fr with the full en key set', () => {
    const englishKeys = Object.keys(en);
    for (const dictionary of [itMessages, deMessages, frMessages]) {
      expect(Object.keys(dictionary)).toEqual(englishKeys);
    }
  });

  it('keeps format as a single implementation', () => {
    // Phase 1 moved the implementation out of `strings.ts`; both the i18n index
    // and the compatibility module must expose that same function.
    expect(format).toBe(formatDirect);
    expect(format('{a} + {b}', { a: 1, b: 2 })).toBe('1 + 2');
    expect(format('level {level}', {})).toBe('level {level}');
  });
});

describe('de-CH merge', () => {
  it('merges the delta over de exactly once and caches the result', () => {
    const first = dictionaryFor('de-CH');
    expect(dictionaryFor('de-CH')).toBe(first);
  });

  it('inherits every de entry the delta does not override', () => {
    const swiss = dictionaryFor('de-CH');
    for (const key of Object.keys(deMessages)) {
      if (key in deCH) continue;
      expect(swiss[key], key).toBe(deMessages[key]);
    }
  });

  it('lets a delta entry win without losing the rest of the dictionary', () => {
    const swiss = mergeMessages(deMessages, { appTitle: 'CHMED16A-Werkzeuge' });

    expect(resolveMessage(swiss, en, 'appTitle')).toBe('CHMED16A-Werkzeuge');
    expect(resolveMessage(swiss, en, 'disclaimer')).toBe(deMessages.disclaimer);
  });

  it('never lets an undefined delta value shadow a real entry', () => {
    const merged = mergeMessages(en, { appTitle: undefined });

    expect(merged['appTitle']).toBe(en.appTitle);
  });
});

describe('resolution chain', () => {
  it('prefers the locale entry, then en, then the key name', () => {
    expect(resolveMessage({ appTitle: 'Titel' }, en, 'appTitle')).toBe('Titel');
    expect(resolveMessage({}, en, 'appTitle')).toBe(en.appTitle);
    expect(resolveMessage({}, {}, 'unbekannterSchluessel')).toBe('unbekannterSchluessel');
    expect(resolveMessage(undefined, {}, 'unbekannterSchluessel')).toBe('unbekannterSchluessel');
  });

  it('resolves de-CH through de', () => {
    expect(resolveText('de-CH', 'appTitle')).toBe(resolveText('de', 'appTitle'));
  });

  it('resolves every key in every locale to non-empty text', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(en) as MessageKey[]) {
        const value = resolveText(locale, key);
        expect(value.trim(), `${locale}/${key}`).not.toBe('');
        expect(value, `${locale}/${key}`).not.toBe(key);
      }
    }
  });

  it('resolves text() with the current locale', () => {
    setLocale('de', null);
    expect(text('appTitle')).toBe(deMessages.appTitle);

    setLocale('it', null);
    expect(text('appTitle')).toBe(itMessages.appTitle);

    setLocale('en', null);
    expect(text('appTitle')).toBe(en.appTitle);
  });
});
