/**
 * Header language selector.
 *
 * A native `<select>`: keyboard navigation (arrows, Home/End, first-letter
 * jumps), the platform picker on touch devices and screen-reader announcement
 * come for free, so there is no custom listbox to re-implement or to break.
 *
 * The component builds the options and keeps the value and the accessible name
 * in sync. The switch itself belongs to `ui/i18n`: `setLocale` persists the
 * choice and notifies `onLocaleChange`, which re-applies every label in place.
 * Nothing here reloads or re-renders the page, and nothing here takes focus.
 *
 * Options are labelled with endonyms (`LOCALE_LABELS`), so "Deutsch" is found by
 * a German speaker whatever the current UI language is.
 */

import { isLocale, LOCALE_LABELS, LOCALES, type Locale } from '../i18n';
import { el } from './dom';

/** One `<option>`: the locale tag as value, its endonym as visible label. */
export interface LanguageOption {
  readonly value: Locale;
  readonly label: string;
}

/**
 * Selector content in the required order (it, de, fr, en, de-CH).
 *
 * Pure and DOM-free, so the ordering and labelling rules are unit-tested in the
 * Node test environment.
 */
export function buildLanguageOptions(): readonly LanguageOption[] {
  return LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }));
}

export interface LanguageSelectorOptions {
  /** Locale the control starts on (already resolved by `initLocale`). */
  readonly locale: Locale;
  /** Accessible name, localized by the caller for the startup locale. */
  readonly label: string;
  /** Receives the chosen locale; persistence and re-render stay with the caller. */
  readonly onChange: (locale: Locale) => void;
}

export interface LanguageSelectorHandle {
  /** Points the control at `locale` and refreshes its accessible name. */
  sync(locale: Locale, label: string): void;
}

/**
 * Creates the selector inside `parent` (the header meta group) and returns the
 * only operation the shell needs on a locale change:
 * {@link LanguageSelectorHandle.sync}.
 */
export function createLanguageSelector(
  parent: HTMLElement,
  options: LanguageSelectorOptions,
): LanguageSelectorHandle {
  const select = el('select', 'language-selector');
  select.id = 'language-selector';

  for (const option of buildLanguageOptions()) {
    const node = el('option');
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  }

  select.addEventListener('change', () => {
    const value = select.value;
    // The options are built from `LOCALES`, so only a supported tag can be
    // chosen: this guard keeps the narrowing honest without a cast.
    if (isLocale(value)) {
      options.onChange(value);
    }
  });

  parent.append(select);

  function sync(locale: Locale, label: string): void {
    select.value = locale;
    select.setAttribute('aria-label', label);
  }

  sync(options.locale, options.label);

  return { sync };
}
