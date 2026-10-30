/**
 * Core finding → locale text mapping (i18n plan 007, phases 7 and 8).
 *
 * The core returns codes (+ a `detail` and `params`); this is the only place
 * that turns them into UI wording. The chain under test is: detail → key, code →
 * key, then the core's English `message`, then the code — never a blank string.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { setLocale } from '..';
import { coreMessageKey, coreMessageText } from '../core-message';
import { de as deMessages } from '../messages/de';
import { en } from '../messages/en';
import { fr as frMessages } from '../messages/fr';
import { it as itMessages } from '../messages/it';

afterEach(() => {
  setLocale('en', null);
});

describe('core message mapping', () => {
  it('maps a stable code to the localized template and interpolates its params', () => {
    const finding = { code: 'unknown-year', message: 'ReleaseYear 23 is not defined.', params: { year: '23' } };

    expect(coreMessageKey(finding.code)).toBe('coreDecodeUnknownYear');
    expect(coreMessageText(finding)).toBe(
      'ReleaseYear 23 is not defined by ChTransmissionFormat; only 16 is supported.',
    );
    expect(coreMessageText(finding)).not.toBe(finding.message);
  });

  it('lets a detail win over the shared code', () => {
    // `pdf-corrupt` covers four different reader bounds: the detail, not the
    // code, picks the advice.
    expect(coreMessageText({ code: 'pdf-corrupt', detail: 'page-limit', message: 'x' })).toBe(
      en.corePdfTooManyPages,
    );
    expect(coreMessageText({ code: 'pdf-corrupt', detail: 'text-limit', message: 'x' })).toBe(
      en.corePdfTooMuchText,
    );
    expect(coreMessageText({ code: 'pdf-corrupt', detail: 'unexpected', message: 'x' })).toBe(
      en.corePdfUnexpected,
    );
    // A `bad-json` from the validator keeps its own English text: only the UTF-8
    // rejection of the decoder carries the detail.
    expect(
      coreMessageText({ code: 'bad-json', message: 'Invalid JSON at line 1, column 2: oops' }),
    ).toBe('Invalid JSON at line 1, column 2: oops');
    expect(coreMessageText({ code: 'bad-json', detail: 'not-utf8', message: 'x' })).toBe(
      en.coreDecodeBadJsonUtf8,
    );
  });

  it('falls back to the English message, then to the code, but never to blank', () => {
    // No key (schema-engine text and validator advisories): English is kept.
    expect(coreMessageText({ code: 'missing-field', message: 'No patient block.' })).toBe(
      'No patient block.',
    );
    // No key and no usable message: the code is the last resort.
    expect(coreMessageText({ code: 'invalid-value', message: '   ' })).toBe('invalid-value');
    expect(coreMessageText({ code: 'invalid-value' })).toBe('invalid-value');
  });

  it('renders the current locale', () => {
    const finding = { code: 'not-pdf', message: 'The selected file is not a PDF document.' };

    setLocale('de', null);
    expect(coreMessageText(finding)).toBe(deMessages.corePdfNotPdf);

    setLocale('fr', null);
    expect(coreMessageText(finding)).toBe(frMessages.corePdfNotPdf);

    setLocale('it', null);
    expect(coreMessageText(finding)).toBe(itMessages.corePdfNotPdf);

    setLocale('en', null);
    expect(coreMessageText(finding)).toBe(en.corePdfNotPdf);
  });

  it('leaves an unknown detail to the code mapping', () => {
    expect(coreMessageText({ code: 'not-pdf', detail: 'something-new', message: 'x' })).toBe(
      en.corePdfNotPdf,
    );
  });
});

describe('parser finding mapping (phase 8)', () => {
  /**
   * A `prescription-parse.ts` finding as the core emits it: coarse shared code,
   * stable detail, the printed value in `params`, and the English message the
   * parser has always carried.
   */
  const badStartDate = {
    code: 'invalid-value',
    path: '/Medicaments/1/Pos/0/DtFrom',
    detail: 'bad-start-date',
    params: { value: '32.13.2026' },
    message: 'Cannot read the start date "32.13.2026"; expected DD.MM.YYYY.',
  };

  it('maps a parser detail to its template and interpolates the printed value', () => {
    expect(coreMessageKey(badStartDate.code, badStartDate.detail)).toBe('coreParseBadStartDate');
    expect(coreMessageText(badStartDate)).toBe(
      en.coreParseBadStartDate.replace('{value}', '32.13.2026'),
    );
    expect(coreMessageText(badStartDate)).toContain('32.13.2026');
    // The English template is not the core's English message re-read: the
    // wording exists in the dictionary even though both happen to agree.
    expect(en.coreParseBadStartDate).not.toBe(badStartDate.message);
  });

  it('interpolates both values of the unit-identity leak', () => {
    const leak = {
      code: 'unknown-field',
      path: '/Medicaments/0/Unit',
      detail: 'unit-identity-leak',
      params: { value: 'Tabletten Wirkstoff', unit: 'Tabletten' },
      message: 'x',
    };

    expect(coreMessageText(leak)).toBe(
      'The printed unit "Tabletten Wirkstoff" carries extra text after the recognized unit; only "Tabletten" is kept.',
    );
  });

  it('keeps a validator warning with the same code in English', () => {
    // `unknown-field` is shared: the parser narrows it with a detail, the
    // validator (unknown JSON key) never does. Without a detail the code alone
    // must not pick up a parser template.
    expect(
      coreMessageText({ code: 'unknown-field', message: 'Unknown property.' }),
    ).toBe('Unknown property.');
    expect(coreMessageKey('unknown-field')).toBeUndefined();

    // The parser placeholder advisory narrows the same shared code too.
    expect(
      coreMessageText({
        code: 'empty-string',
        detail: 'missing-dtfrom',
        message: 'x',
      }),
    ).toBe(en.coreParseMissingStartDate);
    expect(
      coreMessageText({ code: 'empty-string', message: 'Empty "Lng".' }),
    ).toBe('Empty "Lng".');
  });

  it('falls back to the English message for a parser detail a locale has no key for', () => {
    // Forward compatibility: a new parser detail before the dictionary catches
    // up must show the parser's own English text, never blank.
    const future = {
      code: 'invalid-value',
      path: '/Patient/BDt',
      detail: 'a-detail-that-does-not-exist-yet',
      message: 'The printed value is not a date.',
    };

    expect(coreMessageKey(future.code, future.detail)).toBeUndefined();
    expect(coreMessageText(future)).toBe(future.message);
  });

  it('renders parser findings in every locale', () => {
    for (const locale of ['de', 'fr', 'it'] as const) {
      setLocale(locale, null);
      const rendered = coreMessageText(badStartDate);
      expect(rendered).toContain('32.13.2026');
      expect(rendered).not.toBe(badStartDate.message);
    }

    setLocale('de', null);
    expect(coreMessageText(badStartDate)).toBe(
      (deMessages.coreParseBadStartDate ?? '').replace('{value}', '32.13.2026'),
    );
    setLocale('fr', null);
    expect(coreMessageText(badStartDate)).toBe(
      (frMessages.coreParseBadStartDate ?? '').replace('{value}', '32.13.2026'),
    );
    setLocale('it', null);
    expect(coreMessageText(badStartDate)).toBe(
      (itMessages.coreParseBadStartDate ?? '').replace('{value}', '32.13.2026'),
    );
  });

  it('keeps every parser detail mapped to a key that exists', () => {
    // The core's `ParseErrorDetail`/`ParserWarningDetail` unions are the
    // source of these names; a renamed detail would silently fall back to
    // English, so the mapping is pinned here.
    const details = [
      'empty-text',
      'no-layout',
      'bad-start-date',
      'bad-end-date',
      'bad-dose',
      'bad-birth-date',
      'missing-first-name',
      'missing-last-name',
      'missing-birth-date',
      'no-rows',
      'missing-issue-date',
      'incomplete',
      'no-crypto',
      'unreadable-text',
      'missing-weight',
      'missing-height',
      'renal-unknown',
      'diabetes-unknown',
      'diabetes-unmatched',
      'allergy-unknown',
      'unit-unknown',
      'unit-identity-leak',
      'missing-dtfrom',
      'route-undetermined',
      'annotation-desync',
      'language-undetected',
    ] as const;

    for (const detail of details) {
      expect(coreMessageKey('unknown-field', detail), detail).toBeDefined();
    }
  });
});
