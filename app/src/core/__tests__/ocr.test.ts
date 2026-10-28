import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OCR_LANGUAGES,
  OCR_PAGE_SEPARATOR,
  TESSERACT_ASSET_PATHS,
  combineOcrPages,
  normalizeOcrLanguages,
} from '../ocr';

describe('combineOcrPages', () => {
  it('concatenates pages verbatim when there is one page', () => {
    expect(combineOcrPages(['Patient\nErika Muster'])).toBe('Patient\nErika Muster');
    expect(combineOcrPages([])).toBe('');
  });

  it('inserts the page separator between pages, in order', () => {
    expect(combineOcrPages(['first', 'second'])).toBe(`first${OCR_PAGE_SEPARATOR}second`);

    const text = combineOcrPages(['page one', 'page two', 'page three']);
    expect(text.split(OCR_PAGE_SEPARATOR)).toEqual(['page one', 'page two', 'page three']);
    expect(text.indexOf('page one')).toBeLessThan(text.indexOf('page two'));
    expect(text.indexOf('page two')).toBeLessThan(text.indexOf('page three'));
  });

  it('uses a form feed as the page break', () => {
    // `prescription-parse.ts:329-337` splits pages on `\f`, so a combined OCR
    // document feeds the parser the same page boundaries as a text PDF.
    expect(OCR_PAGE_SEPARATOR).toContain('\f');
  });

  it('trims pages and drops whitespace-only ones', () => {
    expect(combineOcrPages(['  first  ', '   ', '\n\t', ' second\n'])).toBe(
      `first${OCR_PAGE_SEPARATOR}second`,
    );
  });

  it('keeps interior blank lines and line order inside a page', () => {
    expect(combineOcrPages(['a\n\nb', 'c'])).toBe(`a\n\nb${OCR_PAGE_SEPARATOR}c`);
  });
});

describe('TESSERACT_ASSET_PATHS', () => {
  it('points the worker, core and traineddata at same-origin public assets', () => {
    expect(TESSERACT_ASSET_PATHS.workerPath).toBe('/tesseract/worker.min.js');
    expect(TESSERACT_ASSET_PATHS.corePath).toBe('/tesseract/core');
    expect(TESSERACT_ASSET_PATHS.langPath).toBe('/tesseract');
  });

  it('never falls back to a CDN URL', () => {
    for (const path of Object.values(TESSERACT_ASSET_PATHS)) {
      expect(path).not.toMatch(/^[a-z]+:\/\//i);
      expect(path).not.toMatch(/cdn\.|unpkg|projectnaptha/i);
    }
  });
});

describe('normalizeOcrLanguages', () => {
  it('defaults to the bundled eng+deu pair', () => {
    expect(DEFAULT_OCR_LANGUAGES).toBe('eng+deu');
    expect(normalizeOcrLanguages(undefined)).toBe(DEFAULT_OCR_LANGUAGES);
  });

  it('lowercases, trims and de-duplicates the request', () => {
    expect(normalizeOcrLanguages(' ENG ')).toBe('eng');
    expect(normalizeOcrLanguages('eng+deu')).toBe('eng+deu');
    expect(normalizeOcrLanguages('DEU+ eng + deu')).toBe('deu+eng');
  });

  it('rejects languages that are not shipped for offline use', () => {
    for (const request of ['fra', 'eng+fra', '', '   ', '+', 'eng+']) {
      expect(normalizeOcrLanguages(request)).toBeNull();
    }
  });

  it('rejects values that would escape the bundled asset directory', () => {
    for (const request of ['../../etc/passwd', 'eng/../deu', 'eng%2F..', 'eng deu']) {
      expect(normalizeOcrLanguages(request)).toBeNull();
    }
  });
});
