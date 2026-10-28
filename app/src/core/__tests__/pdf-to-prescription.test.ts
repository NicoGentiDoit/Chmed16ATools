import { describe, expect, it, vi } from 'vitest';

import realGermanOneDoctorFixture from './fixtures/emediplan-paper-rx-real-de-one-doctor.txt?raw';
import realGermanFixture from './fixtures/emediplan-paper-rx-real-de.txt?raw';
import { jsonToChmed } from '../encode';
import type { PdfExtractError } from '../pdf-extract';
import { MAX_OCR_PAGES, pdfToPrescription } from '../pdf-to-prescription';
import type {
  PdfToPrescriptionDeps,
  PdfToPrescriptionFailure,
  PdfToPrescriptionResult,
  PdfToPrescriptionSuccess,
} from '../pdf-to-prescription';
import { parsePrescriptionText } from '../prescription-parse';
import type { MedicationRx } from '../types';
import type { ValidationWarning } from '../validate';
import { validateObject } from '../validate';

/** Text-layer document as `extractPdfText` would return it. */
const PAPER_TEXT = [
  'Patient',
  'Erika Muster',
  'Born on: 05.05.1980 (F)',
  '',
  'Issue date: 01.09.2026',
  'Medication | Morning (08:00) | Noon (12:00) | Evening (18:00) | Night (22:00)',
  'Ramipril 5 mg | 1 | 0 | 0 | 0',
].join('\n');

/**
 * What the OCR adapter returns for the same page: Tesseract with
 * `preserve_interword_spaces` still collapses some gaps, so the fallback must
 * work on single-spaced, realistic text.
 */
const OCR_PAPER_TEXT = [
  'Patient',
  'Erika Muster',
  'Born on: 05.05.1980 (F)',
  'Issue date: 01.09.2026',
  'Service provider',
  'Created by: Dr. med. Anna Muster',
  'Organisation: Praxis Muster',
  'Street: Bahnhofstrasse 12',
  'Zip: 8001',
  'City: Zürich',
  'GLN: 7601000123456',
  'Medication Morning (08:00) Noon (12:00) Evening (18:00) Night (22:00) Quantity From Up to and including Instructions Reason Prescribed by Reserve medication',
  'Ramipril 5 mg 1 0 0 0 Tablet 01.09.2026 30.09.2026 After a meal Hypertension Dr. med. Anna Muster',
].join('\n');

/**
 * Geometry-tabulated text of the real German HCI sample: exactly what
 * `tabulateLayout` produces for its item geometry (see `pdf-extract.test.ts`).
 */
const REAL_GERMAN_TEXT = realGermanFixture;

/** Revision-3 Rx that the real validator and encoder accept without findings. */
const PRESCRIPTION: MedicationRx = {
  rev: 3,
  MedType: 3,
  Id: '26d3dff7-ab05-4737-a49c-5eccd33595f6',
  Auth: '7601003178999',
  Dt: '2026-04-01T10:00:00+02:00',
  Patient: { FName: 'Maxima', LName: 'Matter', BDt: '1981-01-12' },
  Medicaments: [{ Id: '971867', IdType: 3, Pos: [{ D: [1, 0, 0, 0] }], IndC: '12345.67' }],
  HcPerson: { Gln: '7601003178999', FName: 'Anna', LName: 'Arzt' },
  HcOrg: { Name: 'Praxis', Street: 'Hauptstrasse 1', Zip: '3000', City: 'Bern' },
};

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\n% pipeline fixture');
}

/**
 * Complete fake dependency object: every stage is replaced, and the defaults
 * for render/OCR throw, so an unexpected fallback fails the test instead of
 * reaching a real adapter.
 */
function makeDeps(overrides: Partial<PdfToPrescriptionDeps> = {}): PdfToPrescriptionDeps {
  return {
    extractText: async () => ({
      ok: true,
      value: { text: PAPER_TEXT, pageCount: 1, hasTextLayer: true },
    }),
    renderPages: async () => {
      throw new Error('renderPages must not run on the text-layer path');
    },
    ocr: async () => {
      throw new Error('ocr must not run on the text-layer path');
    },
    parseText: () => ({ ok: true, value: PRESCRIPTION, warnings: [] }),
    validate: () => ({ ok: true, errors: [], warnings: [] }),
    encode: () => ({ ok: true, chmed: 'CHMED16A1FAKE', warnings: [] }),
    ...overrides,
  };
}

function expectSuccess(result: PdfToPrescriptionResult): PdfToPrescriptionSuccess {
  if (!result.ok) {
    throw new Error(
      `Expected a prescription, got stage "${result.stage}": ${JSON.stringify(result.errors)}`,
    );
  }
  return result;
}

function expectFailure(result: PdfToPrescriptionResult): PdfToPrescriptionFailure {
  if (result.ok) {
    throw new Error('Expected a typed failure, got a prescription.');
  }
  return result;
}

/** Deps for a scanned document: no text layer, one rendered page. */
function scannedDeps(overrides: Partial<PdfToPrescriptionDeps> = {}): PdfToPrescriptionDeps {
  return makeDeps({
    extractText: async () => ({
      ok: true,
      value: { text: '  \n\f\t ', pageCount: 1, hasTextLayer: false },
    }),
    renderPages: async () => ({ ok: true, images: [new Blob(['page one'])] }),
    ocr: async () => ({ ok: true, text: OCR_PAPER_TEXT, confidence: 42, pageCount: 1 }),
    ...overrides,
  });
}

describe('text-layer path', () => {
  it('parses, validates, encodes and returns the pretty JSON', async () => {
    const renderPages = vi.fn(async () => {
      throw new Error('renderPages must not run');
    });
    const ocr = vi.fn(async () => {
      throw new Error('ocr must not run');
    });

    const result = expectSuccess(
      await pdfToPrescription(pdfBytes(), makeDeps({ renderPages, ocr })),
    );

    expect(result.text).toBe(PAPER_TEXT);
    expect(result.prescription).toBe(PRESCRIPTION);
    expect(result.json).toBe(JSON.stringify(PRESCRIPTION, null, 2));
    expect(result.chmed).toBe('CHMED16A1FAKE');
    expect(result.confidence).toBe('high');
    expect(result.pageCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(renderPages).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
  });

  it('validates against the Rx context and passes the parsed object to the encoder', async () => {
    const validate = vi.fn(() => ({ ok: true, errors: [], warnings: [] }));
    const encode = vi.fn(() => ({ ok: true as const, chmed: 'CHMED16A1FAKE', warnings: [] }));

    await pdfToPrescription(pdfBytes(), makeDeps({ validate, encode }));

    expect(validate).toHaveBeenCalledWith(PRESCRIPTION, { medType: 3, rev: 3 });
    expect(encode).toHaveBeenCalledWith(PRESCRIPTION);
  });

  it('produces a real CHMED16A1 string with the real validator and encoder', async () => {
    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({ validate: validateObject, encode: jsonToChmed }),
      ),
    );

    expect(result.warnings).toEqual([]);
    expect(result.chmed.startsWith('CHMED16A1')).toBe(true);
    expect(JSON.parse(result.json)).toEqual(PRESCRIPTION);
  });
});

describe('OCR fallback', () => {
  const blankTextLayers = [
    { label: 'an empty text layer', text: '', hasTextLayer: true },
    { label: 'a whitespace-only text layer', text: '  \n\f\t ', hasTextLayer: false },
  ];

  it.each(blankTextLayers)('falls back to OCR for $label', async ({ text, hasTextLayer }) => {
    const pageOne = new Blob(['page one']);
    const pageTwo = new Blob(['page two']);
    const bytes = pdfBytes();
    const renderPages = vi.fn(async () => ({ ok: true as const, images: [pageOne, pageTwo] }));
    const ocr = vi.fn(async () => ({
      ok: true as const,
      text: OCR_PAPER_TEXT,
      confidence: 42,
      pageCount: 2,
    }));

    const result = expectSuccess(
      await pdfToPrescription(
        bytes,
        makeDeps({
          extractText: async () => ({ ok: true, value: { text, pageCount: 2, hasTextLayer } }),
          renderPages,
          ocr,
        }),
      ),
    );

    expect(renderPages).toHaveBeenCalledWith(bytes, 2);
    expect(ocr).toHaveBeenCalledWith([pageOne, pageTwo]);
    expect(result.text).toBe(OCR_PAPER_TEXT);
    expect(result.confidence).toBe('low');
    expect(result.pageCount).toBe(2);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'ocr-low-confidence', path: '' }),
    );
  });

  it('marks a one-page scan low confidence and still parses it', async () => {
    const result = expectSuccess(await pdfToPrescription(pdfBytes(), scannedDeps()));

    expect(result.confidence).toBe('low');
    expect(result.text).toBe(OCR_PAPER_TEXT);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['ocr-low-confidence']);
  });

  it('parses realistic single-spaced OCR text with the real parser and validator', async () => {
    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        scannedDeps({
          ocr: async () => ({
            ok: true,
            text: OCR_PAPER_TEXT,
            confidence: 61,
            pageCount: 1,
          }),
          parseText: parsePrescriptionText,
          validate: validateObject,
        }),
      ),
    );

    expect(result.confidence).toBe('low');
    expect(result.text).toBe(OCR_PAPER_TEXT);
    expect(result.prescription.Patient).toEqual({
      FName: 'Erika',
      LName: 'Muster',
      BDt: '1980-05-05',
      Gender: 2,
    });
    expect(result.prescription.Medicaments).toEqual([
      {
        Id: 'Ramipril 5 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'After a meal',
        Pos: [{ DtTo: '2026-09-30', D: [1, 0, 0, 0] }],
      },
    ]);
    expect(result.warnings.map((warning) => warning.code)).toContain('ocr-low-confidence');
  });
});

describe('typed failures', () => {
  it('rejects non-PDF bytes without calling the extraction adapter', async () => {
    const extractText: PdfToPrescriptionDeps['extractText'] = async () => {
      throw new Error('extractText must not run for a non-PDF');
    };

    const failure = expectFailure(
      await pdfToPrescription(new TextEncoder().encode('GIF89a\nnot a pdf'), makeDeps({ extractText })),
    );

    expect(failure.stage).toBe('extract');
    expect(failure.errors).toEqual([{ code: 'not-pdf', message: expect.any(String) }]);
  });

  const extractionFailures: readonly PdfExtractError[] = [
    { code: 'pdf-corrupt', message: 'The PDF is damaged.' },
    { code: 'pdf-password', message: 'The PDF is password protected.' },
  ];

  it.each(extractionFailures)('maps extraction "$code" unchanged', async (error) => {
    const extractText: PdfToPrescriptionDeps['extractText'] = async () => ({
      ok: false,
      error,
    });

    const failure = expectFailure(await pdfToPrescription(pdfBytes(), makeDeps({ extractText })));

    expect(failure.stage).toBe('extract');
    expect(failure.errors).toEqual([error]);
  });

  it('surfaces the parser error list with stage "parse"', async () => {
    const parseErrors = [
      { code: 'missing-field' as const, path: '/Patient', message: 'No patient block.' },
    ];
    const encode = vi.fn(() => ({ ok: true as const, chmed: 'CHMED16A1FAKE', warnings: [] }));

    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({ parseText: () => ({ ok: false, errors: parseErrors }), encode }),
      ),
    );

    expect(failure.stage).toBe('parse');
    expect(failure.errors).toEqual(parseErrors);
    expect(encode).not.toHaveBeenCalled();
  });

  it('surfaces blocking validator errors with stage "validate"', async () => {
    const validationErrors = [
      {
        instancePath: '/Patient',
        keyword: 'required',
        message: "must have required property 'BDt'",
        params: { missingProperty: 'BDt' },
      },
    ];
    const encode = vi.fn(() => ({ ok: true as const, chmed: 'CHMED16A1FAKE', warnings: [] }));

    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          validate: () => ({ ok: false, errors: validationErrors, warnings: [] }),
          encode,
        }),
      ),
    );

    expect(failure.stage).toBe('validate');
    expect(failure.errors).toEqual(validationErrors);
    expect(encode).not.toHaveBeenCalled();
  });

  it('carries the rejected prescription as a draft on a validate failure', async () => {
    const validationErrors = [
      {
        instancePath: '',
        keyword: 'required',
        message: "must have required property 'HcPerson'",
        params: { missingProperty: 'HcPerson' },
      },
    ];

    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({ validate: () => ({ ok: false, errors: validationErrors, warnings: [] }) }),
      ),
    );
    if (failure.stage !== 'validate') {
      throw new Error(`Expected a validate failure, got "${failure.stage}".`);
    }

    expect(failure.draft).toEqual({
      prescription: PRESCRIPTION,
      json: JSON.stringify(PRESCRIPTION, null, 2),
    });
  });

  it('adds no draft to failures of stages without a prescription object', async () => {
    const parseFailure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          parseText: () => ({
            ok: false,
            errors: [{ code: 'missing-field', path: '/Patient', message: 'No patient block.' }],
          }),
        }),
      ),
    );
    const encodeFailure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          encode: () => ({
            ok: false,
            errors: [
              {
                instancePath: '',
                keyword: 'minLength',
                message: 'must NOT have fewer than 1 characters',
                params: { limit: 1 },
              },
            ],
            warnings: [],
          }),
        }),
      ),
    );

    expect(parseFailure.stage).toBe('parse');
    expect(encodeFailure.stage).toBe('encode');
    expect('draft' in parseFailure).toBe(false);
    expect('draft' in encodeFailure).toBe(false);
  });

  it('surfaces encoder errors with stage "encode"', async () => {
    const encodeErrors = [
      {
        instancePath: '/Auth',
        keyword: 'minLength',
        message: 'must NOT have fewer than 1 characters',
        params: { limit: 1 },
      },
    ];

    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({ encode: () => ({ ok: false, errors: encodeErrors, warnings: [] }) }),
      ),
    );

    expect(failure.stage).toBe('encode');
    expect(failure.errors).toEqual(encodeErrors);
  });

  it('returns render-failed with stage "ocr" when a page cannot be rasterized', async () => {
    const ocr = vi.fn(async () => {
      throw new Error('ocr must not run when rendering failed');
    });

    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        scannedDeps({
          renderPages: async () => ({
            ok: false,
            error: { code: 'render-failed', message: 'The page could not be rendered.' },
          }),
          ocr,
        }),
      ),
    );

    expect(failure.stage).toBe('ocr');
    expect(failure.errors).toEqual([
      { code: 'render-failed', message: 'The page could not be rendered.' },
    ]);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('returns ocr-failed with stage "ocr" when recognition fails', async () => {
    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        scannedDeps({
          ocr: async () => ({
            ok: false,
            error: { code: 'ocr-failed', message: 'Text recognition failed.' },
          }),
        }),
      ),
    );

    expect(failure.stage).toBe('ocr');
    expect(failure.errors).toEqual([{ code: 'ocr-failed', message: 'Text recognition failed.' }]);
  });

  it('fails closed before rendering more than MAX_OCR_PAGES pages', async () => {
    const renderPages = vi.fn(async () => ({ ok: true as const, images: [] }));

    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        scannedDeps({
          extractText: async () => ({
            ok: true,
            value: { text: '', pageCount: MAX_OCR_PAGES + 1, hasTextLayer: false },
          }),
          renderPages,
        }),
      ),
    );

    expect(failure.stage).toBe('ocr');
    expect(failure.errors).toEqual([{ code: 'ocr-failed', message: expect.any(String) }]);
    expect(renderPages).not.toHaveBeenCalled();
  });

  it('turns an unexpected adapter throw into a typed failure instead of rejecting', async () => {
    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          parseText: () => {
            throw new Error('parser exploded');
          },
        }),
      ),
    );

    expect(failure.stage).toBe('parse');
    expect(failure.errors).toEqual([
      { code: 'invalid-value', path: '', message: expect.any(String) },
    ]);
  });
});

describe('warnings', () => {
  it('merges parser, validator and OCR warnings, dropping duplicate (code, path) pairs', async () => {
    const parserAuth: ValidationWarning = {
      code: 'empty-string',
      path: '/Auth',
      message: 'parser: no provider GLN',
    };
    const validatorAuth: ValidationWarning = {
      code: 'empty-string',
      path: '/Auth',
      message: 'validator: empty string',
    };
    const parserOther: ValidationWarning = {
      code: 'unknown-field',
      path: '/Rmk',
      message: 'parser: unknown field',
    };
    const validatorOther: ValidationWarning = {
      code: 'doses-length',
      path: '/Medicaments/0/Pos/0',
      message: 'validator: odd doses length',
    };

    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        scannedDeps({
          parseText: () => ({
            ok: true,
            value: PRESCRIPTION,
            warnings: [parserAuth, parserOther],
          }),
          validate: () => ({
            ok: true,
            errors: [],
            warnings: [validatorAuth, validatorOther],
          }),
        }),
      ),
    );

    expect(result.warnings.map((warning) => [warning.code, warning.path])).toEqual([
      ['empty-string', '/Auth'],
      ['unknown-field', '/Rmk'],
      ['doses-length', '/Medicaments/0/Pos/0'],
      ['ocr-low-confidence', ''],
    ]);
    // The first occurrence wins, so the parser's message is the one kept.
    expect(result.warnings[0]?.message).toBe('parser: no provider GLN');
  });

  it('does not add the low-confidence warning on the text-layer path', async () => {
    const result = expectSuccess(await pdfToPrescription(pdfBytes(), makeDeps()));

    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe('high');
  });

  it('merges the encoder warnings into the success findings', async () => {
    const encoderWarning: ValidationWarning = {
      code: 'unknown-field',
      path: '/Extra',
      message: 'encoder: unknown field',
    };

    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          encode: () => ({ ok: true, chmed: 'CHMED16A1FAKE', warnings: [encoderWarning] }),
        }),
      ),
    );

    expect(result.warnings.map((warning) => [warning.code, warning.path])).toEqual([
      ['unknown-field', '/Extra'],
    ]);
  });
});

describe('tabulated text selection', () => {
  it('parses the geometry-tabulated text when the extraction provides it', async () => {
    const parseText = vi.fn(parsePrescriptionText);

    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          extractText: async () => ({
            ok: true,
            value: {
              text: 'flat text that must not be parsed',
              tabulatedText: REAL_GERMAN_TEXT,
              pageCount: 1,
              hasTextLayer: true,
            },
          }),
          parseText,
          validate: () => ({ ok: true, errors: [], warnings: [] }),
        }),
      ),
    );

    expect(parseText).toHaveBeenCalledWith(REAL_GERMAN_TEXT);
    expect(result.text).toBe(REAL_GERMAN_TEXT);
    expect(result.prescription.Patient.FName).toBe('Peter');
    expect(result.prescription.Medicaments).toHaveLength(5);
  });

  it('falls back to the flat text when no tabulation was produced', async () => {
    const parseText = vi.fn(parsePrescriptionText);

    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          extractText: async () => ({
            ok: true,
            value: { text: PAPER_TEXT, tabulatedText: '', pageCount: 1, hasTextLayer: true },
          }),
          parseText,
          validate: () => ({ ok: true, errors: [], warnings: [] }),
        }),
      ),
    );

    expect(parseText).toHaveBeenCalledWith(PAPER_TEXT);
    expect(result.text).toBe(PAPER_TEXT);
  });

  it('keeps the OCR path flat even when a tabulated text is reported', async () => {
    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        scannedDeps({
          extractText: async () => ({
            ok: true,
            value: {
              text: '  \n\f\t ',
              tabulatedText: REAL_GERMAN_TEXT,
              pageCount: 1,
              hasTextLayer: false,
            },
          }),
        }),
      ),
    );

    expect(result.text).toBe(OCR_PAPER_TEXT);
    expect(result.confidence).toBe('low');
  });
});

describe('real German sample with one consistent prescriber (fix round 3)', () => {
  /** The committed real sample with its per-row prescribers unified. */
  const ONE_DOCTOR_TEXT = realGermanOneDoctorFixture;

  it('validates the inferred author and encodes a real CHMED16A1 string', async () => {
    const result = expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          extractText: async () => ({
            ok: true,
            value: {
              text: 'flat text that must not be parsed',
              tabulatedText: ONE_DOCTOR_TEXT,
              pageCount: 1,
              hasTextLayer: true,
            },
          }),
          // Real parser, real validator and real encoder (pako is node-safe).
          parseText: parsePrescriptionText,
          validate: validateObject,
          encode: jsonToChmed,
        }),
      ),
    );

    expect(result.prescription.HcPerson).toEqual({
      Gln: '7600000000000',
      FName: 'Example',
      LName: 'Karl',
    });
    expect(result.prescription.Medicaments).toHaveLength(5);
    expect(result.chmed.startsWith('CHMED16A1')).toBe(true);
    // The encoded string is the same document the UI shows as JSON.
    expect(JSON.parse(result.json)).toEqual(result.prescription);
  });

  it('keeps the ambiguous real sample on the draft path instead of encoding', async () => {
    const failure = expectFailure(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          extractText: async () => ({
            ok: true,
            value: {
              text: 'flat text that must not be parsed',
              tabulatedText: REAL_GERMAN_TEXT,
              pageCount: 1,
              hasTextLayer: true,
            },
          }),
          parseText: parsePrescriptionText,
          validate: validateObject,
          encode: jsonToChmed,
        }),
      ),
    );
    if (failure.stage !== 'validate') {
      throw new Error(`Expected a validate failure, got "${failure.stage}".`);
    }

    expect(failure.errors.map((error) => error.params)).toEqual([
      { missingProperty: 'HcPerson' },
      { missingProperty: 'HcOrg' },
    ]);
    // The draft is review material only; no CHMED string exists to leak.
    expect(failure.draft?.prescription.HcPerson).toBeUndefined();
    expect(JSON.parse(failure.draft?.json ?? '{}')).toEqual(failure.draft?.prescription);
  });
});
