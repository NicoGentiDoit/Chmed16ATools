import { describe, expect, it, vi } from 'vitest';

import expectedReferenceRaw from './fixtures/emediplan-paper-rx-expected-mp.json?raw';
import realGerman20261029Fixture from './fixtures/emediplan-paper-rx-real-de-20261029.txt?raw';
import realGermanOneDoctorFixture from './fixtures/emediplan-paper-rx-real-de-one-doctor.txt?raw';
import realGermanFixture from './fixtures/emediplan-paper-rx-real-de.txt?raw';
import { chmedToJson } from '../decode';
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
import type { PdfLinkAnnotation, PdfRowGeometry } from '../prescription-parse';
import type { MedicamentMp, MedicationMp } from '../types';
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

/** Medication Plan (`MedType: 1`) that the real validator and encoder accept. */
const PRESCRIPTION: MedicationMp = {
  MedType: 1,
  Id: '26d3dff7-ab05-4737-a49c-5eccd33595f6',
  Auth: '7601003178999',
  Dt: '2026-04-01T10:00:00+02:00',
  Patient: { FName: 'Maxima', LName: 'Matter', BDt: '1981-01-12', Lng: 'de' },
  Medicaments: [
    {
      Id: '971867',
      IdType: 3,
      Unit: 'Stück',
      Pos: [{ DtFrom: '2026-04-01', D: [1, 0, 0, 0] }],
    },
  ],
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

  it('validates against the derived Medication Plan context and passes the object to the encoder', async () => {
    const validate = vi.fn(() => ({ ok: true, errors: [], warnings: [] }));
    const encode = vi.fn(() => ({ ok: true as const, chmed: 'CHMED16A1FAKE', warnings: [] }));

    await pdfToPrescription(pdfBytes(), makeDeps({ validate, encode }));

    // No Rx `medType: 3`/`rev` override: the validator derives `MedType: 1`
    // (MP) from the parsed document.
    expect(validate).toHaveBeenCalledWith(PRESCRIPTION);
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
      Lng: 'en',
      Gender: 2,
    });
    expect(result.prescription.Medicaments).toEqual([
      {
        Id: 'Ramipril 5 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'After a meal',
        TkgRsn: 'Hypertension',
        PrscbBy: 'Dr. med. Anna Muster',
        Pos: [{ DtFrom: '2026-09-01', DtTo: '2026-09-30', D: [1, 0, 0, 0] }],
        Roa: 'PO',
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
        instancePath: '/Patient',
        keyword: 'required',
        message: "must have required property 'Lng'",
        params: { missingProperty: 'Lng' },
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

    expect(parseText).toHaveBeenCalledWith(
      REAL_GERMAN_TEXT,
      undefined,
      'flat text that must not be parsed',
    );
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

  /** Row bands of the five real medication rows, in document order. */
  const ANNOTATION_ROWS: readonly PdfRowGeometry[] = [
    { page: 1, top: 440, bottom: 420, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 400, bottom: 380, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 360, bottom: 340, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 320, bottom: 300, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 280, bottom: 260, medicationLeft: 40, medicationRight: 120 },
  ];

  function productAnnotation(
    rowIndex: number,
    productId: string,
  ): PdfLinkAnnotation {
    const row = ANNOTATION_ROWS[rowIndex];
    if (row === undefined) {
      throw new Error(`No synthetic row ${rowIndex}`);
    }
    return {
      page: row.page,
      rect: [row.medicationLeft + 1, row.bottom + 2, row.medicationLeft + 60, row.top - 2],
      productId,
    };
  }

  it('threads link annotations to the parser and emits Swissmedic ids', async () => {
    const annotations: readonly PdfLinkAnnotation[] = [
      productAnnotation(3, '1159424'),
    ];
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
              annotations,
              medicationRows: ANNOTATION_ROWS,
            },
          }),
          parseText,
        }),
      ),
    );

    expect(parseText).toHaveBeenCalledWith(
      REAL_GERMAN_TEXT,
      {
        annotations,
        rows: ANNOTATION_ROWS,
      },
      'flat text that must not be parsed',
    );
    expect(result.prescription.Medicaments?.[3]).toMatchObject({
      Id: '1159424',
      IdType: 4,
    });
    expect(result.prescription.Medicaments?.[4]).toMatchObject({
      Id: 'Essigwickel',
      IdType: 1,
    });
  });

  it('never threads annotations into the OCR path', async () => {
    const parseText = vi.fn(() => ({
      ok: true as const,
      value: PRESCRIPTION,
      warnings: [],
    }));

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
              annotations: [productAnnotation(3, '1159424')],
              medicationRows: ANNOTATION_ROWS,
            },
          }),
          parseText,
        }),
      ),
    );

    expect(result.confidence).toBe('low');
    // One argument: no geometry context reaches the parser without a text layer.
    expect(parseText).toHaveBeenCalledWith(OCR_PAPER_TEXT);
  });
});

describe('real German sample on the Medication Plan path', () => {
  /** The committed real sample with its per-row prescribers unified. */
  const ONE_DOCTOR_TEXT = realGermanOneDoctorFixture;

  it('validates the real sample and encodes a real CHMED16A1 string', async () => {
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

    // MP keeps only the printed GLN as `Auth`; there is no provider identity.
    expect(result.prescription.Auth).toBe('7600000000000');
    expect(result.prescription).not.toHaveProperty('HcPerson');
    expect(result.prescription).not.toHaveProperty('HcOrg');
    expect(result.prescription.Medicaments).toHaveLength(5);
    // Phase 2 per-row fidelity survives the whole pipeline.
    expect(result.prescription.Medicaments?.[1]).toMatchObject({
      Unit: 'mg',
      TkgRsn: 'Cholesterinsenker',
      PrscbBy: 'Dr. Example Karl, Wängi',
      Roa: 'PO',
      Pos: [{ DtFrom: '2016-03-01', D: [0, 0, 1, 0] }],
    });
    expect(result.prescription.Medicaments?.[3]).toMatchObject({
      Unit: 'Stk',
      AutoMed: 1,
      Pos: [{ DtFrom: '2016-09-09', InRes: 1, D: [0, 0, 0, 0] }],
    });
    expect(result.prescription.Medicaments?.[4]).toMatchObject({
      Unit: '-',
      TkgRsn: 'Fieber',
      AutoMed: 1,
    });
    expect(result.prescription.Medicaments?.[4]).not.toHaveProperty('Roa');
    expect(result.chmed.startsWith('CHMED16A1')).toBe(true);
    // The encoded string is the same document the UI shows as JSON.
    expect(JSON.parse(result.json)).toEqual(result.prescription);
  });

  it('validates the ambiguous real sample too, because MP has no author requirement', async () => {
    // Deliberate rewrite (plan 006 phase 1): the Rx revision-3 path needed a
    // document author and kept this sample on the draft path. A Medication Plan
    // has no `HcPerson`/`HcOrg`, so the same text now validates and encodes; the
    // MP-required gaps (Lng/DtFrom/unit) are non-blocking warnings.
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
          parseText: parsePrescriptionText,
          validate: validateObject,
          encode: jsonToChmed,
        }),
      ),
    );

    expect(result.prescription.MedType).toBe(1);
    expect(result.prescription).not.toHaveProperty('HcPerson');
    expect(result.prescription).not.toHaveProperty('HcOrg');
    expect(result.prescription.Medicaments).toHaveLength(5);
    // The SORTIS tabulation leak is normalized and the wrap has no invented
    // route; both survive parser → validator → encoder.
    expect(result.prescription.Medicaments?.[1]).toMatchObject({
      Unit: 'mg',
      Roa: 'PO',
      PrscbBy: 'Dr. Arzt Hans, Münchenhausen',
    });
    expect(result.prescription.Medicaments?.[4]).toMatchObject({
      Unit: '-',
      AutoMed: 1,
      Pos: [{ DtFrom: '2016-09-09', InRes: 1 }],
    });
    expect(result.prescription.Medicaments?.[4]).not.toHaveProperty('Roa');
    expect(result.chmed.startsWith('CHMED16A1')).toBe(true);
    expect(result.warnings.map((warning) => warning.path)).toEqual(
      expect.arrayContaining(['/Medicaments/4/Roa', '/Patient/Med/Rc']),
    );
  });
});

/* ------------------------------------------------------------------------- *
 * Phase 7 — ground truth for the real 20261029 PDF
 *
 * Fixture layout: the first part of
 * `fixtures/emediplan-paper-rx-real-de-20261029.txt` is the verbatim
 * `value.tabulatedText` of the probe for
 * `20261029_eMediplan_Beispiel_de.pdf`; the line `===FLAT-TEXT===` separates it
 * from the verbatim `value.text`. `splitGroundTruthFixture` is the only reader,
 * so the two renderings stay distinct without a second fixture file.
 *
 * Reference object: `fixtures/emediplan-paper-rx-expected-mp.json` is the
 * decoded reference document the user's other application produced from the
 * same PDF. It is committed verbatim (pretty-printed) and is the expected
 * object below.
 *
 * Comparison contract (fail-closed):
 * - EXCLUDED by design: the root `Id` (the user's application generates its own
 *   UUID) and gzip/encode metadata (they live in the CHMED envelope, not in the
 *   object; the round-trip test covers the envelope).
 * - EXPLICIT deltas, each asserted below rather than skipped:
 *   (a) `Patient.Med.Rc`: the reference carries `{Id:4},{Id:5},{Id:2}` which have
 *       no printed source in the PDF (never-invented policy);
 *   (b) `Dt` seconds: the page prints minute precision, so the parser emits
 *       `:00` where the reference records `:52`;
 *   (c) the VALIUM unit (`ml` on both sides) and the other unit normalizations;
 *   (d) `Rmk`: the tabulated text stops at the `Bemerkung :` stop row by design,
 *       so the remark after the last table is read from the flat rendering the
 *       pipeline now forwards to the parser. Re-extracting the target PDF
 *       (2026-10-29 probe, pdfjs-dist 6.4.299 legacy text layer) shows the print
 *       reads `begeistert!`. The earlier fixture flat part mis-quoted it as
 *       `begefreit!` and was corrected to the print; the reference application
 *       carries the same string. The reference-vs-produced relationship stays an
 *       explicit assertion: the pipeline quotes the print verbatim and never
 *       re-spells it.
 * - Everything else (patient identity/measurements, every Medicament field
 *   including `PrscbBy`/`TkgRsn`/`DtFrom`/`InRes`/`AutoMed`/`Roa`/`Unit`,
 *   `MedType`, `Auth`) is compared with a deep equality; any unexpected
 *   difference fails the suite.
 *
 * Medicaments are matched by `Id`, not array position: the reference sorts the
 * rows differently from the PDF's printed order.
 * ------------------------------------------------------------------------- */

interface ExpectedRiskCategory {
  Id: number;
  R?: number[];
}

interface ExpectedReference {
  Patient: {
    FName: string;
    LName: string;
    BDt: string;
    Gender: number;
    Street: string;
    Zip: string;
    City: string;
    Lng: string;
    Med: {
      Rc: ExpectedRiskCategory[];
      Meas: Array<{ Type: number; Val: string; Unit: number }>;
    };
  };
  Medicaments: MedicamentMp[];
  MedType: number;
  Id: string;
  Auth: string;
  Dt: string;
  Rmk?: string;
}

const EXPECTED_REFERENCE = JSON.parse(expectedReferenceRaw) as ExpectedReference;

function splitGroundTruthFixture(raw: string): { tabulated: string; flat: string } {
  const parts = raw.split(/\r?\n===FLAT-TEXT===\r?\n/);
  const [tabulated, flat] = parts;
  if (tabulated === undefined || flat === undefined || parts.length !== 2) {
    throw new Error('The 20261029 fixture must contain exactly one ===FLAT-TEXT=== separator.');
  }
  return { tabulated, flat };
}

function sortMedicaments(medicaments: readonly MedicamentMp[]): MedicamentMp[] {
  return [...medicaments].sort((left, right) => left.Id.localeCompare(right.Id));
}

/** Everything compared after the explicit deltas above have been asserted. */
function canonicalProduced(produced: MedicationMp): unknown {
  const medical = produced.Patient.Med;
  return {
    Patient: {
      ...produced.Patient,
      Med: {
        ...(medical ?? {}),
        // (a) the three never-invented categories are asserted out above.
        Rc: (medical?.Rc ?? []).filter((entry) => entry.Id === 1 || entry.Id === 6),
      },
    },
    Medicaments: sortMedicaments(produced.Medicaments ?? []),
    MedType: produced.MedType,
    Auth: produced.Auth,
  };
}

function canonicalExpected(expected: ExpectedReference): unknown {
  return {
    Patient: {
      ...expected.Patient,
      Med: {
        ...expected.Patient.Med,
        Rc: expected.Patient.Med.Rc.filter((entry) => entry.Id === 1 || entry.Id === 6),
      },
    },
    Medicaments: sortMedicaments(expected.Medicaments),
    MedType: expected.MedType,
    Auth: expected.Auth,
  };
}

describe('ground truth: 20261029 real Medication Plan PDF (phase 7)', () => {
  /**
   * Synthetic row bands, one per medicament row of the tabulated fixture, in
   * document order (SORTIS, CO-DIOVAN, VALIUM, Essigwickel, PANADOL). They are
   * internally consistent placeholders: the mapper only compares annotation
   * rects with these bands, exactly as `pdf-extract.ts` would report the real
   * geometry.
   */
  const TARGET_ROWS: readonly PdfRowGeometry[] = [
    { page: 1, top: 440, bottom: 420, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 400, bottom: 380, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 360, bottom: 340, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 320, bottom: 300, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 280, bottom: 260, medicationLeft: 40, medicationRight: 120 },
  ];

  function targetAnnotation(rowIndex: number, productId: string): PdfLinkAnnotation {
    const row = TARGET_ROWS[rowIndex];
    if (row === undefined) {
      throw new Error(`No synthetic row ${rowIndex}`);
    }
    return {
      page: row.page,
      rect: [row.medicationLeft + 1, row.bottom + 2, row.medicationLeft + 60, row.top - 2],
      productId,
    };
  }

  const TARGET_ANNOTATIONS: readonly PdfLinkAnnotation[] = [
    targetAnnotation(0, '58356'), // SORTIS
    targetAnnotation(1, '93139'), // CO-DIOVAN
    targetAnnotation(2, '23846'), // VALIUM
    targetAnnotation(4, '1159424'), // PANADOL; Essigwickel has no product link
  ];

  /** The printed `Bemerkung` paragraph of the flat probe text. */
  function printedRemark(flat: string): string | undefined {
    const lines = flat.split(/\r?\n/);
    const index = lines.findIndex((line) => /^Bemerkung\s*:/i.test(line.trim()));
    if (index < 0) {
      return undefined;
    }
    const parts: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]?.trim() ?? '';
      if (line === '') {
        continue;
      }
      if (/^Peter Muster \(/.test(line)) {
        break;
      }
      parts.push(line);
    }
    return parts.join('\n');
  }

  async function runTargetPipeline(): Promise<PdfToPrescriptionSuccess> {
    const { tabulated, flat } = splitGroundTruthFixture(realGerman20261029Fixture);
    return expectSuccess(
      await pdfToPrescription(
        pdfBytes(),
        makeDeps({
          extractText: async () => ({
            ok: true,
            value: {
              text: flat,
              tabulatedText: tabulated,
              pageCount: 1,
              hasTextLayer: true,
              annotations: TARGET_ANNOTATIONS,
              medicationRows: TARGET_ROWS,
            },
          }),
          // Real parser, real validator and real encoder.
          parseText: parsePrescriptionText,
          validate: validateObject,
          encode: jsonToChmed,
        }),
      ),
    );
  }

  it('matches the decoded reference document field-by-field', async () => {
    const { tabulated, flat } = splitGroundTruthFixture(realGerman20261029Fixture);
    const result = await runTargetPipeline();
    const produced = result.prescription;

    // The pipeline really parsed the tabulated rendering, not the flat one.
    expect(result.text).toBe(tabulated);

    // Advisory parser findings are not failures; the validator stays clean.
    expect(result.warnings.map((warning) => warning.path)).toEqual(
      expect.arrayContaining(['/Medicaments/3/Roa', '/Patient/Med/Rc']),
    );
    expect(result.warnings.every((warning) => warning.code === 'unknown-field')).toBe(true);
    const validation = validateObject(produced);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);

    // Root Id is excluded: the app generates a fresh v4 UUID.
    expect(produced.Id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(EXPECTED_REFERENCE.Id).toBe('807a63a8-25e6-45a3-8888-759388507c3c');

    // (b) Dt: printed minute precision vs the reference's recorded seconds.
    expect(produced.Dt).toBe('2026-10-29T09:42:00+01:00');
    expect(EXPECTED_REFERENCE.Dt).toBe('2026-10-29T09:42:52+01:00');
    expect(produced.Dt.slice(0, 16)).toBe(EXPECTED_REFERENCE.Dt.slice(0, 16));

    // (a) Rc: the parser maps only the printed, unambiguous categories.
    expect(produced.Patient.Med?.Rc).toEqual([
      { Id: 1, R: [577] },
      { Id: 6, R: [571] },
    ]);
    expect(EXPECTED_REFERENCE.Patient.Med.Rc).toHaveLength(5);
    // The three extras have no printed source; they are the documented delta.
    expect(EXPECTED_REFERENCE.Patient.Med.Rc).toEqual(
      expect.arrayContaining([{ Id: 4 }, { Id: 5 }, { Id: 2 }]),
    );
    expect(
      EXPECTED_REFERENCE.Patient.Med.Rc.filter((entry) => entry.Id !== 1 && entry.Id !== 6),
    ).toEqual([{ Id: 4 }, { Id: 5 }, { Id: 2 }]);

    // (c) Unit normalization: VALIUM keeps the printed `ml` on both sides.
    const valiumProduced = produced.Medicaments?.find((medicament) => medicament.Id === '23846');
    const valiumExpected = EXPECTED_REFERENCE.Medicaments.find(
      (medicament) => medicament.Id === '23846',
    );
    expect(valiumProduced?.Unit).toBe('ml');
    expect(valiumProduced?.Unit).toBe(valiumExpected?.Unit);

    // (d) Rmk: the re-extraction (2026-10-29 probe, pdfjs-dist 6.4.299 legacy
    // text layer) shows the print reads `begeistert!`. The earlier fixture flat
    // part mis-quoted it; the fixture now quotes the print, and the pipeline
    // forwards the flat rendering so the remark reaches `captureRemark`.
    const printed = printedRemark(flat);
    expect(printed).toBe('Der Patient ist vom Medikationsplan begeistert!');
    // The produced remark is the printed remark, verbatim.
    expect(produced.Rmk).toBe(printed);
    // The reference-vs-produced delta is resolved, not skipped: the reference
    // application carries the same string as the paper. This explicit equality
    // fails if either side ever diverges; the pipeline never re-spells.
    expect(produced.Rmk).toBe(EXPECTED_REFERENCE.Rmk);

    // Every medicament is matched by id (the reference order differs) and every
    // remaining field is compared fail-closed.
    expect((produced.Medicaments ?? []).map((medicament) => medicament.Id).sort()).toEqual(
      EXPECTED_REFERENCE.Medicaments.map((medicament) => medicament.Id).sort(),
    );
    expect(canonicalProduced(produced)).toEqual(canonicalExpected(EXPECTED_REFERENCE));
  });

  it('round-trips the committed reference through the CHMED encoder and decoder', () => {
    // The reference itself must be a valid Medication Plan with no findings.
    const validation = validateObject(EXPECTED_REFERENCE);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);

    const encoded = jsonToChmed(EXPECTED_REFERENCE);
    if (!encoded.ok) {
      throw new Error(`The reference document failed to encode: ${JSON.stringify(encoded.errors)}`);
    }
    expect(encoded.chmed.startsWith('CHMED16A1')).toBe(true);
    expect(encoded.warnings).toEqual([]);

    const decoded = chmedToJson(encoded.chmed);
    if (!decoded.ok) {
      throw new Error(`The encoded reference failed to decode: ${JSON.stringify(decoded.errors)}`);
    }

    // Modulo gzip metadata: only the payload JSON is compared, and it must be
    // byte-identical to the compact serialization of the committed reference.
    expect(decoded.jsonText).toBe(JSON.stringify(EXPECTED_REFERENCE));
    expect(JSON.parse(decoded.jsonText)).toEqual(EXPECTED_REFERENCE);
  });
});
