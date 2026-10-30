/**
 * Selector content.
 *
 * Only the pure option building is covered: the `<select>` itself needs a DOM,
 * and the interactive behaviour (change → `setLocale` → re-apply) is wired in
 * `main.ts`. The properties asserted here are the ones a keyboard or
 * screen-reader user depends on: the documented order and a self-name per entry.
 */

import { describe, expect, it } from 'vitest';

import { buildLanguageOptions } from '../language-selector';
import { LOCALE_LABELS, LOCALES } from '../../i18n';

describe('language selector options', () => {
  it('offers every supported locale in the documented order', () => {
    expect(buildLanguageOptions().map((option) => option.value)).toEqual([
      'it',
      'de',
      'fr',
      'en',
      'de-CH',
    ]);
  });

  it('labels every option with its endonym', () => {
    const options = buildLanguageOptions();

    expect(options.map((option) => option.label)).toEqual([
      'Italiano',
      'Deutsch',
      'Français',
      'English',
      'Deutsch (Schweiz)',
    ]);
    for (const option of options) {
      expect(option.label).toBe(LOCALE_LABELS[option.value]);
      expect(option.label.trim()).not.toBe('');
    }
  });

  it('keeps the values distinguishable and every locale covered', () => {
    const values = buildLanguageOptions().map((option) => option.value);

    expect(new Set(values).size).toBe(values.length);
    expect([...values].sort()).toEqual([...LOCALES].sort());
  });
});
