import { describe, expect, it, vi } from 'vitest';

import rawGermanFixture from './fixtures/emediplan-paper-raw-de.txt?raw';
import realGerman2023Fixture from './fixtures/emediplan-paper-rx-real-de-2023.txt?raw';
import realGermanOneDoctorFixture from './fixtures/emediplan-paper-rx-real-de-one-doctor.txt?raw';
import realGermanFixture from './fixtures/emediplan-paper-rx-real-de.txt?raw';
import minimalFixture from './fixtures/emediplan-paper-rx-minimal.txt?raw';
import singleMedicamentFixture from './fixtures/emediplan-paper-rx.txt?raw';
import twoMedicamentsFixture from './fixtures/emediplan-paper-rx-two-meds.txt?raw';
import {
  columnKeyFor,
  mapAnnotationsToRows,
  parsePrescriptionText,
} from '../prescription-parse';
import type {
  ColumnKey,
  PdfLinkAnnotation,
  PdfRowGeometry,
  PrescriptionParseResult,
} from '../prescription-parse';
import { validateObject } from '../validate';

type Success = Extract<PrescriptionParseResult, { ok: true }>;
type Failure = Extract<PrescriptionParseResult, { ok: false }>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Column titles of the printed table, in the order of `README.md:1735-1745`. */
const DEFAULT_HEADER =
  'Medication | Morning (08:00) | Noon (12:00) | Evening (18:00) | Night (22:00) | Quantity | From | Up to and including | Instructions | Reason | Prescribed by | Reserve medication';

function expectSuccess(result: PrescriptionParseResult): Success {
  if (!result.ok) {
    throw new Error(
      `Expected a parsed prescription, got: ${result.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join(' | ')}`,
    );
  }
  return result;
}

function expectFailure(result: PrescriptionParseResult): Failure {
  if (result.ok) {
    throw new Error('Expected a parse failure, got a prescription.');
  }
  return result;
}

/** Minimal paper text: patient block, issue date and a medication table. */
function paperText(
  rows: readonly string[],
  header: string = DEFAULT_HEADER,
  issueDate: string = '01.09.2026',
): string {
  return [
    'Patient',
    'Erika Muster',
    'Born on: 05.05.1980 (F)',
    '',
    `Issue date: ${issueDate}`,
    '',
    header,
    ...rows,
  ].join('\n');
}

/**
 * Realistic single-spaced OCR rendering of a table: the `|`/2+ space cell
 * separators Tesseract collapses are gone, so only the tolerant path can read
 * the text.
 */
function singleSpaced(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/\s*\|\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .join('\n');
}

describe('parsePrescriptionText', () => {
  it('parses the single-medicament paper fixture', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(singleMedicamentFixture),
    );

    expect(value).not.toHaveProperty('rev');
    expect(value.MedType).toBe(1);
    expect(value.Id).toMatch(UUID_V4);
    expect(value.Auth).toBe('7601000123456');
    expect(value.Dt).toBe('2026-10-27T09:15:00+01:00');
    expect(value.Patient).toEqual({
      FName: 'Hans',
      LName: 'Müller',
      BDt: '1962-03-14',
      Lng: 'en',
      Gender: 1,
      Street: 'Rosenweg 5',
      Zip: '3000',
      City: 'Bern',
      Phone: '+41 79 123 45 67',
    });
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(value.Medicaments).toEqual([
      {
        Id: 'Ramipril 5 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'After a meal',
        TkgRsn: 'Hypertension',
        PrscbBy: 'Dr. med. Anna Muster',
        Pos: [{ DtFrom: '2026-10-01', DtTo: '2026-10-31', D: [1, 0, 0.5, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'Metformin 500 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'With meals',
        TkgRsn: 'Diabetes',
        PrscbBy: 'Dr. med. Anna Muster',
        Pos: [{ DtFrom: '2026-09-15', D: [0, 1, 0, 1] }],
        Roa: 'PO',
      },
    ]);
    expect(warnings).toEqual([]);

    // The parsed object is a valid Medication Plan (integration check).
    expect(validateObject(value).errors).toEqual([]);
  });

  it('always emits MedType 1 and never an Rx revision', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(minimalFixture),
    );

    expect(value).not.toHaveProperty('rev');
    expect(value.MedType).toBe(1);
    expect(warnings.map((warning) => warning.code)).not.toContain('rev1-assumption');
  });

  it('parses two medicaments with GTIN, fractions and "See instructions"', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(twoMedicamentsFixture),
    );

    expect(value.Auth).toBe('7601000987654');
    expect(value.Dt).toBe('2026-10-28T14:05:00+01:00');
    expect(value.Patient).toEqual({
      FName: 'Lena',
      LName: 'Keller',
      BDt: '1990-07-02',
      Lng: 'en',
      Gender: 2,
      Street: 'Sonnenweg 8',
      Zip: '4059',
      City: 'Basel',
      Phone: '+41 61 222 33 44',
    });
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(value.Medicaments).toEqual([
      {
        Id: '7680654340123',
        IdType: 2,
        Unit: 'Tablet',
        AppInstr: 'Take with water',
        TkgRsn: 'Pain',
        AutoMed: 1,
        Pos: [{ DtFrom: '2026-10-20', DtTo: '2026-10-30', D: [0.25, 0.33, 0.67, 0.125] }],
        Roa: 'PO',
      },
      {
        Id: 'Amoxicillin 500 mg',
        IdType: 1,
        Unit: 'Capsule',
        AppInstr: 'Take every 8 hours',
        TkgRsn: 'Infection',
        PrscbBy: 'Dr. med. Peter Steiner',
        Pos: [{ DtFrom: '2026-10-26', DtTo: '2026-11-02' }],
        Roa: 'PO',
      },
    ]);
  });

  it('parses the minimal patient fixture and applies the Auth fallback', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(minimalFixture),
    );

    // Locked Auth policy: no printed provider GLN → the literal "patient".
    expect(value.Auth).toBe('patient');
    expect(value.Dt).toBe('2026-10-28');
    expect(value.Patient).toEqual({
      FName: 'Max',
      LName: 'Beispiel',
      BDt: '1970-01-01',
      Lng: 'en',
      Gender: 1,
    });
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(value.Medicaments).toEqual([
      {
        Id: 'Paracetamol 500 mg',
        IdType: 1,
        Unit: 'Tablet',
        Pos: [{ DtFrom: '2026-10-28', DtTo: '2026-10-31', D: [1, 1, 0, 0] }],
        Roa: 'PO',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('maps columns by their printed titles instead of their position', () => {
    const header =
      'Medication | Instructions | Up to and including | Quantity | Night (22:00) | Evening (18:00) | Noon (12:00) | Morning (08:00)';

    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(['Aspirin 100 mg | After food | 05.10.2026 | Tablet | 0 | 0 | 0 | 2'], header),
      ),
    );

    expect(value.Medicaments).toEqual([
      {
        Id: 'Aspirin 100 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'After food',
        Pos: [{ DtFrom: '', DtTo: '2026-10-05', D: [2, 0, 0, 0] }],
        Roa: 'PO',
      },
    ]);
  });

  it('maps ASCII fractions and mixed numbers to decimals', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(['Test 1 mg | 1 1/2 | ½ | ¼ | ¾ | Tablet | 01.09.2026 | 12.09.2026 | | | |']),
      ),
    );

    expect(value.Medicaments?.[0]?.Pos?.[0]?.D).toEqual([1.5, 0.5, 0.25, 0.75]);
  });

  it('normalizes birth and issue dates to ISO calendar dates', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          ['Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |'],
          DEFAULT_HEADER,
          '31.12.2026',
        ),
      ),
    );

    expect(value.Patient.BDt).toBe('1980-05-05');
    expect(value.Dt).toBe('2026-12-31');
  });

  it('keeps the raw issue date when it cannot be read', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          ['Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |'],
          DEFAULT_HEADER,
          '31.02.2026',
        ),
      ),
    );

    expect(value.Dt).toBe('31.02.2026');
  });

  it('rejects an unreadable end date', () => {
    const result = expectFailure(
      parsePrescriptionText(
        paperText(['Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 40.13.2026 | | | |']),
      ),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'invalid-value',
      path: '/Medicaments/0/Pos/0/DtTo',
    });
  });

  it('rejects an unreadable dose', () => {
    const result = expectFailure(
      parsePrescriptionText(
        paperText(['Ibu 400 mg | two | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |']),
      ),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'invalid-value',
      path: '/Medicaments/0/Pos/0/D',
    });
  });

  it('returns unsupported-layout for empty, whitespace and garbage input', () => {
    for (const input of ['', '   \n\t\n', 'not an eMediplan', '| | |', '\u0000\u0001']) {
      const result = expectFailure(parsePrescriptionText(input));
      expect(result.errors[0]?.code).toBe('unsupported-layout');
    }
  });

  it('never throws on hostile input', () => {
    const hostile = [
      '%PDF-1.4\n1 0 obj\n<<>>',
      'Medication | Morning | Noon | Evening | Night',
      'A | B | '.repeat(200),
      'x'.repeat(10_000),
      'Born on: 99.99.9999',
      '{{{{{{',
      'Ramipril | 999999999999999999999999999999999 | 0 | 0 | 0',
    ];

    for (const input of hostile) {
      expect(() => parsePrescriptionText(input)).not.toThrow();
      expect(parsePrescriptionText(input).ok).toBe(false);
    }
  });

  it('uses a UUID printed in the header as the prescription id', () => {
    const text = [
      'Id: 26d3dff7-ab05-4737-a49c-5eccd33595f6',
      paperText(['Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |']),
    ].join('\n');

    expect(expectSuccess(parsePrescriptionText(text)).value.Id).toBe(
      '26d3dff7-ab05-4737-a49c-5eccd33595f6',
    );
  });

  it('generates distinct UUIDs when the layout prints none', () => {
    const first = expectSuccess(parsePrescriptionText(minimalFixture)).value.Id;
    const second = expectSuccess(parsePrescriptionText(minimalFixture)).value.Id;

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });

  it('reports missing patient fields as missing-field errors', () => {
    const text = [
      'Issue date: 01.09.2026',
      DEFAULT_HEADER,
      'Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |',
    ].join('\n');

    const result = expectFailure(parsePrescriptionText(text));
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['/Patient/FName', '/Patient/LName', '/Patient/BDt']),
    );
    for (const error of result.errors) {
      expect(error.code).toBe('missing-field');
    }
  });

  it('emits the Medication Plan medicament fields and no Rx-only ones', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(singleMedicamentFixture),
    );
    const keys = Object.keys(value.Medicaments?.[0] ?? {});

    // Phase 2 maps the per-row printed fields.
    expect(keys).toEqual(
      expect.arrayContaining(['TkgRsn', 'PrscbBy', 'Roa', 'Pos']),
    );
    // Rx-only fields must never leak into the MP document.
    expect(keys).not.toContain('Rep');
    expect(keys).not.toContain('Subs');
    expect(keys).not.toContain('NbPack');
    expect(keys).not.toContain('IndC');
  });

  it('ignores Rx-only Rep/Subs/NbPack/IndC cells when a row carries them', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText([
          'Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | | Rep: 3 | NbPack: 2 | Subs: 1 | IndC: 12345.00',
        ]),
      ),
    );

    const medicament = value.Medicaments?.[0];
    expect(medicament).toMatchObject({ Id: 'Ibu 400 mg', IdType: 1, Unit: 'Tablet' });
    expect(medicament).not.toHaveProperty('Rep');
    expect(medicament).not.toHaveProperty('NbPack');
    expect(medicament).not.toHaveProperty('Subs');
    expect(medicament).not.toHaveProperty('IndC');
  });

  it('accepts ISO YYYY-MM-DD for the birth date and the issue date', () => {
    const text = [
      'Patient',
      'Erika Muster',
      'Born on: 1980-05-05 (F)',
      'Issue date: 2026-03-04',
      DEFAULT_HEADER,
      'Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |',
    ].join('\n');

    const { value } = expectSuccess(parsePrescriptionText(text));

    expect(value.Patient.BDt).toBe('1980-05-05');
    expect(value.Dt).toBe('2026-03-04');
  });

  it('fails closed instead of using Math.random when no CSPRNG exists', () => {
    vi.stubGlobal('crypto', {});
    try {
      const result = expectFailure(parsePrescriptionText(minimalFixture));

      expect(result.errors).toEqual([
        {
          code: 'invalid-value',
          path: '/Id',
          // i18n plan 007 phase 8: the finding carries its stable sub-code.
          detail: 'no-crypto',
          message: expect.stringContaining('crypto'),
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('tolerant single-spaced layout', () => {
  it('parses the single-medicament fixture with collapsed column gaps', () => {
    const strict = expectSuccess(parsePrescriptionText(singleMedicamentFixture));
    const tolerant = expectSuccess(
      parsePrescriptionText(singleSpaced(singleMedicamentFixture)),
    );

    expect(tolerant.value.Patient).toEqual(strict.value.Patient);
    expect(tolerant.value.Auth).toBe(strict.value.Auth);
    expect(tolerant.value.Dt).toBe(strict.value.Dt);
    expect(tolerant.value).not.toHaveProperty('HcPerson');
    expect(tolerant.value).not.toHaveProperty('HcOrg');
    expect(tolerant.value.Medicaments).toEqual(strict.value.Medicaments);
    expect(tolerant.value.Id).toMatch(UUID_V4);
    expect(validateObject(tolerant.value).errors).toEqual([]);
  });

  it('parses the GTIN / fraction / "See instructions" fixture with collapsed gaps', () => {
    const strict = expectSuccess(parsePrescriptionText(twoMedicamentsFixture));
    const tolerant = expectSuccess(
      parsePrescriptionText(singleSpaced(twoMedicamentsFixture)),
    );

    expect(tolerant.value.Medicaments).toEqual(strict.value.Medicaments);
    expect(tolerant.value.Patient).toEqual(strict.value.Patient);
    expect(tolerant.value).not.toHaveProperty('HcPerson');
    expect(tolerant.value).not.toHaveProperty('HcOrg');
  });

  it('parses the minimal fixture with collapsed gaps', () => {
    const strict = expectSuccess(parsePrescriptionText(minimalFixture));
    const tolerant = expectSuccess(parsePrescriptionText(singleSpaced(minimalFixture)));

    expect(tolerant.value.Medicaments).toEqual(strict.value.Medicaments);
    expect(tolerant.value.Patient).toEqual(strict.value.Patient);
  });

  it('reports an unreadable dose in the tolerant path', () => {
    const result = expectFailure(
      parsePrescriptionText(
        singleSpaced(
          paperText([
            'Ramipril 5 mg | 1 | 0 | 0 | 1/5 | Tablet | 01.09.2026 | 30.09.2026 | After a meal | Hypertension | Dr. med. Anna Muster |',
          ]),
        ),
      ),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'invalid-value', path: '/Medicaments/0/Pos/0/D' }),
    ]);
  });

  it('reports an unreadable end date in the tolerant path', () => {
    const result = expectFailure(
      parsePrescriptionText(
        singleSpaced(
          paperText([
            'Ramipril 5 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 40.13.2026 | After a meal | Hypertension | Dr. med. Anna Muster |',
          ]),
        ),
      ),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'invalid-value', path: '/Medicaments/0/Pos/0/DtTo' }),
    ]);
  });

  it('rejects a single-spaced header without the four dose columns', () => {
    const result = expectFailure(
      parsePrescriptionText(
        paperText(['Paracetamol 500 mg 1 1 0 0 Tablet'], 'Medication Morning Noon Evening'),
      ),
    );

    expect(result.errors[0]).toMatchObject({ code: 'unsupported-layout' });
  });

  it('still rejects text that has no medication header at all', () => {
    for (const input of [
      'Paracetamol 500 mg 1 1 0 0 Tablet',
      'Morning Noon Evening Night',
      'Medication 1 0 0 0 Tablet',
    ]) {
      const result = expectFailure(parsePrescriptionText(input));
      expect(result.errors[0]?.code).toBe('unsupported-layout');
    }
  });

  it('keeps the strict path for a layout that still has separators', () => {
    // Same data, separated cells: the strict detector must win and produce the
    // identical medicament list (the tolerant path is only a fallback).
    const spaced = paperText([
      'Ramipril 5 mg | 1 | 0 | ½ | 0 | Tablet | 01.10.2026 | 31.10.2026 | After a meal | Hypertension | Dr. med. Anna Muster |',
    ]);
    const collapsed = singleSpaced(spaced);

    const strict = expectSuccess(parsePrescriptionText(spaced));
    const tolerant = expectSuccess(parsePrescriptionText(collapsed));

    expect(tolerant.value.Medicaments).toEqual(strict.value.Medicaments);
  });

  it('maps the phase-2 medicament fields on the tolerant path too', () => {
    const header =
      'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anwendungsinstruktion | Anwendungsgrund | Verordnet durch';
    const spaced = paperText(
      [
        'Ibu 400 mg | 1 | - | - | - | Stück | 01.09.2026 | - | bei Bedarf | Fieber | Dr. med. A Muster',
      ],
      header,
    );

    const strict = expectSuccess(parsePrescriptionText(spaced));
    const tolerant = expectSuccess(parsePrescriptionText(singleSpaced(spaced)));

    expect(tolerant.value.Medicaments).toEqual(strict.value.Medicaments);
    expect(tolerant.value.Medicaments?.[0]).toMatchObject({
      Unit: 'Stk',
      TkgRsn: 'Fieber',
      PrscbBy: 'Dr. med. A Muster',
      Roa: 'PO',
      Pos: [{ DtFrom: '2026-09-01', D: [1, 0, 0, 0] }],
    });
  });
});

describe('real German eMediplan sample (geometry-tabulated text)', () => {
  it('parses all five printed medication rows in document order', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));

    expect(value.Medicaments).toEqual([
      {
        Id: 'VALIUM Inj Lös 10 mg/2ml i.m./i.v. Diazepam',
        IdType: 1,
        Unit: 'ml',
        AppInstr: 'nur i.m., nur durch instruierte Personen!',
        TkgRsn: 'Beruhigung',
        PrscbBy: 'Dr. Example Karl, Wängi',
        Pos: [{ DtFrom: '2015-11-03', D: [2, 0, 0, 0] }],
        Roa: 'IM',
      },
      {
        Id: 'SORTIS Filmtabl 20 mg Atorvastatin',
        IdType: 1,
        Unit: 'mg',
        TkgRsn: 'Cholesterinsenker',
        PrscbBy: 'Dr. Arzt Hans, Münchenhausen',
        Pos: [{ DtFrom: '2016-03-01', D: [0, 0, 1, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'CO-DIOVAN Filmtabl 160/12.5 mg Valsartan, Hydrochlorothiazid',
        IdType: 1,
        Unit: 'Stk',
        TkgRsn: 'Bluthochdruck',
        PrscbBy: 'Dr. Arzt Hans, Münchhausen',
        Pos: [{ DtFrom: '2016-03-01', D: [1, 0, 0, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'PANADOL S Filmtabl 500 mg (#) Paracetamol',
        IdType: 1,
        Unit: 'Stk',
        AppInstr: 'bis zu max. 4 mal täglich 1 Tablette einnehmen',
        TkgRsn: 'Schmerzen',
        AutoMed: 1,
        Pos: [{ DtFrom: '2016-09-09', InRes: 1, D: [0, 0, 0, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'Essigwickel',
        IdType: 1,
        // The printed dash unit stays literal (the reference keeps `"-"`).
        Unit: '-',
        AppInstr: 'bei Bedarf',
        TkgRsn: 'Fieber',
        AutoMed: 1,
        Pos: [{ DtFrom: '2016-09-09', InRes: 1, D: [0, 0, 0, 0] }],
        // No derivable route (topical wrap): `Roa` is omitted, never guessed.
      },
    ]);
  });

  it('reads the unlabelled patient block, the German issue date and the medical data', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));

    expect(value.Patient).toEqual({
      FName: 'Peter',
      LName: 'Muster',
      BDt: '1943-11-01',
      Lng: 'de',
      Gender: 1,
      Street: '2, Seidenhofstrasse, Altstadt',
      Zip: '6002',
      City: 'Luzern',
      Med: {
        // Reference order: weight (Type 1 / kg = Unit 2) then height.
        Meas: [
          { Type: 1, Val: '81', Unit: 2 },
          { Type: 2, Val: '180', Unit: 1 },
        ],
        // Renal light = RC 1 / 577; penicillin allergy = RC 6 / 571.
        Rc: [
          { Id: 1, R: [577] },
          { Id: 6, R: [571] },
        ],
      },
    });
    expect(value.Dt).toBe('2026-10-27T14:39:00+01:00');
    expect(value).not.toHaveProperty('rev');
    expect(value.MedType).toBe(1);
  });

  it('maps the printed "Von" column to DtFrom and never promotes it to DtTo', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));

    // The rows carry a printed from-date (03.11.2015, 01.03.2016, 09.09.2016)
    // but no end date. `Von` is the posology start date; `Bis u. mit` stays
    // empty, so no row claims an end date.
    expect(value.Medicaments?.map((medicament) => medicament.Pos?.[0]?.DtFrom)).toEqual([
      '2015-11-03',
      '2016-03-01',
      '2016-03-01',
      '2016-09-09',
      '2016-09-09',
    ]);
    expect(
      value.Medicaments?.every(
        (medicament) => medicament.Pos?.[0]?.DtTo === undefined,
      ),
    ).toBe(true);
  });

  it('normalizes the printed units and reports the unmappable route', () => {
    const { value, warnings } = expectSuccess(parsePrescriptionText(realGermanFixture));

    // SORTIS's tabulation leak (the substance line in the unit cell) is
    // stripped to its first token; `Stück` becomes `Stk`; the wrap keeps the
    // printed dash.
    expect(value.Medicaments?.map((medicament) => medicament.Unit)).toEqual([
      'ml',
      'mg',
      'Stk',
      'Stk',
      '-',
    ]);
    // Essigwickel has no derivable route; the warning is non-blocking.
    expect(warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'unknown-field',
          path: '/Medicaments/4/Roa',
          // i18n plan 007 phase 8: stable sub-code for the localized template.
          detail: 'route-undetermined',
          message: expect.stringContaining('"Roa" is omitted'),
        },
      ]),
    );
  });

  it('keeps a recognized identity unit and warns when the cell leaks a substance line', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(
        paperText([
          'Ramipril 5 mg | 1 | - | - | - | Tabletten Wirkstoff | 01.09.2026 | - | | | Dr. med. A Muster',
        ]),
      ),
    );

    // The identity unit is kept in its printed spelling; the leaked substance
    // line is discarded and reported instead of being smuggled into `Unit`.
    expect(value.Medicaments?.[0]?.Unit).toBe('Tabletten');
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown-field',
          path: '/Medicaments/0/Unit',
          message: expect.stringContaining('only "Tabletten" is kept'),
        }),
      ]),
    );
  });

  it('omits Roa for ambiguous solution/ampoule forms unless a route token decides', () => {
    const ambiguous = expectSuccess(
      parsePrescriptionText(
        paperText([
          'Testmedikament Suspension | 1 | - | - | - | Tablet | 01.09.2026 | - | | | Dr. med. A Muster',
          'Testmedikament Lösung | 1 | - | - | - | Tablet | 01.09.2026 | - | | | Dr. med. A Muster',
        ]),
      ),
    );

    expect(ambiguous.value.Medicaments?.map((medicament) => medicament.Roa)).toEqual([
      undefined,
      undefined,
    ]);
    expect(
      ambiguous.warnings.filter((warning) => warning.path.endsWith('/Roa')),
    ).toHaveLength(2);

    // The explicit `i.m./i.v.` token keeps precedence over the `Lös` form word.
    const valium = expectSuccess(parsePrescriptionText(realGermanFixture));
    expect(valium.value.Medicaments?.[0]).toMatchObject({ Roa: 'IM' });
  });

  it('applies the Auth fallback, reports the unmappable diabetes and omits nothing else', () => {
    const { value, warnings } = expectSuccess(parsePrescriptionText(realGermanFixture));

    // No provider GLN is printed: the locked fallback is the literal "patient".
    expect(value.Auth).toBe('patient');
    expect(warnings).toEqual([
      {
        code: 'unknown-field',
        path: '/Medicaments/4/Roa',
        // i18n plan 007 phase 8: stable sub-codes for the localized templates.
        detail: 'route-undetermined',
        message: expect.stringContaining('"Roa" is omitted'),
      },
      {
        code: 'unknown-field',
        path: '/Patient/Med/Rc',
        detail: 'diabetes-unknown',
        params: { value: 'Unbekannt' },
        message: expect.stringContaining('"Unbekannt"'),
      },
    ]);
    // Every warning is a genuinely unmappable printed item, never a validator
    // error.
    expect(warnings.every((warning) => warning.code === 'unknown-field')).toBe(true);
  });

  it('gives every parser warning a stable sub-code and only printed values as params', () => {
    // i18n plan 007 phase 8: the UI localizes by `detail`, so a parser warning
    // without one would silently stay English. `params` carries nothing but
    // values the document printed (the echoed raw text), never prose.
    const { warnings } = expectSuccess(parsePrescriptionText(realGermanFixture));

    expect(warnings.every((warning) => warning.detail !== undefined)).toBe(true);
    expect(warnings.map((warning) => warning.detail).sort()).toEqual([
      'diabetes-unknown',
      'route-undetermined',
    ]);
    expect(warnings.find((warning) => warning.detail === 'diabetes-unknown')?.params).toEqual({
      value: 'Unbekannt',
    });
    // The route advisory interpolates nothing: its wording names the JSON key.
    expect(warnings.find((warning) => warning.detail === 'route-undetermined')?.params).toBe(
      undefined,
    );
  });

  it('validates as a Medication Plan with no validator warnings and no provider identity', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));
    const validation = validateObject(value);

    // The sample prints `erstellt von :` without a value and no GLN anywhere;
    // the parser applies the literal "patient" Auth and detects German, so the
    // MP-required gaps are closed. The only findings left are the parser's
    // genuinely unmappable items (topical route, unknown diabetes type).
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
  });

  it('fails closed on the raw adapter text of the same page', () => {
    // The flat, unstabilized text (single spaces, split header) must not be
    // parsed by guesswork: that was exactly the silent-wrong-data failure mode
    // of the reproduction probe.
    const result = expectFailure(parsePrescriptionText(rawGermanFixture));

    expect(result.errors[0]?.code).toBe('unsupported-layout');
  });
});

describe('2023 German eMediplan sample (fix round 4)', () => {
  // The fixture is the verbatim output of the real geometry tabulator for
  // `20230209_eMediplan_Beispiel_de.pdf`: it prints `Anwendungsinstruktion` /
  // `Anwendungsgrund` instead of `Anleitung` / `Grund`, and every row's cells
  // are separated because those two titles now own their bands.
  it('parses all six printed rows, doses, end date and instructions', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(realGerman2023Fixture),
    );

    expect(value.Dt).toBe('2023-02-09T09:42:00+01:00');
    expect(value.Medicaments).toEqual([
      {
        Id: 'ANTIBIOTIKUM Tabl 800/160mg Disulfontetraprim, Monoketozam',
        IdType: 1,
        Unit: 'Stk',
        AppInstr: 'nach dem Essen',
        TkgRsn: 'Infektion',
        PrscbBy: 'Dr. Not Franz, Frauenfeld',
        Pos: [{ DtFrom: '2023-02-09', DtTo: '2023-02-19', D: [1, 0, 1, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'CO-ANTIHYP Filmtabl 160/12.5 mg Balsorten, Hydronatriazid',
        IdType: 1,
        Unit: 'Stk',
        TkgRsn: 'Bluthochdruck',
        PrscbBy: 'Dr. Sarah Docteur, Porrentruy',
        Pos: [{ DtFrom: '', D: [1, 0, 0, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'CHOLES Filmtabl 20 mg Otamustitan',
        IdType: 1,
        Unit: 'Stk',
        TkgRsn: 'Cholesterinsenker',
        PrscbBy: 'Dr. Sévérine Example, Martigny',
        Pos: [{ DtFrom: '', D: [0.5, 0, 1, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'ANTIKRAMPF Inj Lös 10 mg/2ml i.m./i.v. Trifluopam',
        IdType: 1,
        Unit: 'ml',
        AppInstr: 'nur i.m., nur durch instruierte Personen!',
        TkgRsn: 'Beruhigung',
        PrscbBy: 'Dr. Karl Rezept, Langenthal',
        Pos: [{ DtFrom: '', D: [2, 0, 0, 0] }],
        Roa: 'IM',
      },
      {
        Id: 'Essigwickel',
        IdType: 1,
        Unit: '-',
        AppInstr: 'bei Bedarf',
        TkgRsn: 'Fieber',
        AutoMed: 1,
        Pos: [{ DtFrom: '', D: [0, 0, 0, 0] }],
      },
      {
        Id: 'ANTIPYRETIC Filmtabl 500 mg Antipyretic',
        IdType: 1,
        Unit: '',
        AppInstr: 'bis zu max. 4 mal täglich 1 Tablette einnehmen',
        TkgRsn: 'Schmerzen',
        AutoMed: 1,
        Roa: 'PO',
      },
    ]);
    // Blank `Von` rows keep the required `DtFrom` placeholder with a warning;
    // the topical wrap has no derivable route.
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'empty-string',
          path: '/Medicaments/1/Pos/0/DtFrom',
        }),
        expect.objectContaining({
          code: 'unknown-field',
          path: '/Medicaments/4/Roa',
        }),
      ]),
    );
    expect(warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/Auth' })]),
    );
  });

  it('maps "Von" to DtFrom and only the printed "Bis u. mit" to DtTo', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGerman2023Fixture));

    // `ANTIBIOTIKUM` is the only row with a printed end date; `ANTIKRAMPF`
    // prints a `Von` value but no `Bis u. mit`, so it keeps no `DtTo`.
    expect(value.Medicaments?.map((medicament) => medicament.Pos?.[0]?.DtTo ?? null)).toEqual([
      '2023-02-19',
      null,
      null,
      null,
      null,
      null,
    ]);
    // `Von` is the posology start date; a blank cell keeps the `''` placeholder.
    expect(value.Medicaments?.map((medicament) => medicament.Pos?.[0]?.DtFrom ?? null)).toEqual([
      '2023-02-09',
      '',
      '',
      '',
      '',
      null,
    ]);
  });

  it('validates as a Medication Plan and invents no provider identity', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGerman2023Fixture));

    // No GLN / organisation is printed and four different doctors are named per
    // row. MP has no provider-identity block, so nothing is invented and nothing
    // is required.
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(validateObject(value).errors).toEqual([]);
  });
});

describe('provider block on the Medication Plan path', () => {
  const GLN = '7601000123456';

  /** Patient + issue date + an optional provider block + the printed table. */
  function authorText(providerLines: readonly string[], rows: readonly string[]): string {
    return [
      'Patient',
      'Erika Muster',
      'Born on: 05.05.1980 (F)',
      'Issue date: 01.09.2026',
      ...providerLines,
      DEFAULT_HEADER,
      ...rows,
    ].join('\n');
  }

  /** One printed row; `prescriber` lands in the `Prescribed by` cell. */
  function row(prescriber: string): string {
    return `Ramipril 5 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 30.09.2026 | After a meal | Hypertension | ${prescriber} |`;
  }

  // Deliberate rewrite (plan 006 phase 1): the PDF path is a Medication Plan,
  // which has no `HcPerson`/`HcOrg` and no document author. The Rx author
  // inference is retired; the printed `Prescribed by` column becomes
  // `MedicamentMp.PrscbBy` in phase 2, so this suite now pins what MP actually
  // keeps from the provider block: `Auth` only.

  it('keeps the printed GLN as Auth and emits no provider identity', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        authorText(
          ['Created by: Dr. med. Anna Muster', 'Organisation: Praxis Muster', `GLN: ${GLN}`],
          [row('Dr. med. Anna Muster'), row('Dr. med. Bruno Arzt')],
        ),
      ),
    );

    expect(value.Auth).toBe(GLN);
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(value).not.toHaveProperty('rev');
    expect(value.Medicaments?.[0]).toMatchObject({
      TkgRsn: 'Hypertension',
      PrscbBy: 'Dr. med. Anna Muster',
      Roa: 'PO',
    });
    expect(validateObject(value).errors).toEqual([]);
  });

  it('falls back to the literal "patient" Auth when no GLN is printed', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(authorText([], [row('Dr. med. Anna Muster')])),
    );

    expect(value.Auth).toBe('patient');
    expect(warnings).toEqual([]);
    expect(validateObject(value).errors).toEqual([]);
  });

  it('keeps the same Auth on the tolerant single-spaced path', () => {
    const spaced = authorText(
      [`GLN: ${GLN}`],
      [row('Dr. med. Anna Muster'), row('Dr. med. Anna Muster')],
    );
    const strict = expectSuccess(parsePrescriptionText(spaced));
    const tolerant = expectSuccess(parsePrescriptionText(singleSpaced(spaced)));

    expect(tolerant.value.Auth).toBe(strict.value.Auth);
    expect(tolerant.value.Auth).toBe(GLN);
    expect(tolerant.value.Medicaments).toEqual(strict.value.Medicaments);
  });

  it('validates the real one-doctor sample variant as a Medication Plan', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanOneDoctorFixture));

    // Derived from the committed real HCI sample: it prints a provider block
    // with a (synthetic placeholder) GLN. MP keeps only that GLN as `Auth`.
    expect(value.Auth).toBe('7600000000000');
    expect(value).not.toHaveProperty('HcPerson');
    expect(value).not.toHaveProperty('HcOrg');
    expect(value.Medicaments).toHaveLength(5);
    expect(validateObject(value).errors).toEqual([]);
  });
});

describe('real-world paper variations', () => {
  const germanHeader =
    'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anleitung | Grund | Verordnet durch';

  /** The 2023 sample titles (`Anwendungsinstruktion` / `Anwendungsgrund`). */
  const german2023Header =
    'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anwendungsinstruktion | Anwendungsgrund | Verordnet durch';

  it('reads the 2023 titles "Anwendungsinstruktion" and "Anwendungsgrund"', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          ['Ibu 400 mg | 1 | - | - | - | Stück | - | - | bei Bedarf | Fieber | Selbstmedikation'],
          german2023Header,
        ),
      ),
    );

    expect(value.Medicaments?.[0]).toEqual({
      Id: 'Ibu 400 mg',
      IdType: 1,
      Unit: 'Stk',
      AppInstr: 'bei Bedarf',
      TkgRsn: 'Fieber',
      AutoMed: 1,
      Pos: [{ DtFrom: '', D: [1, 0, 0, 0] }],
      Roa: 'PO',
    });
  });

  it('treats "siehe Anwendungsinstruktion" as a cross-reference, not a dose', () => {
    const result = expectSuccess(
      parsePrescriptionText(
        paperText(
          [
            'Ibu 400 mg | siehe Anwendungsinstruktion |  |  |  | - |  |  | bei Bedarf | Fieber | Selbstmedikation',
          ],
          german2023Header,
        ),
      ),
    );

    expect(result.warnings.map((warning) => warning.path)).toEqual([]);
    expect(result.value.Medicaments?.[0]).toEqual({
      Id: 'Ibu 400 mg',
      IdType: 1,
      // The printed dash unit stays literal; the unit column is not blank.
      Unit: '-',
      AppInstr: 'bei Bedarf',
      TkgRsn: 'Fieber',
      AutoMed: 1,
      Roa: 'PO',
    });
  });

  it('keeps the documented date-prefix tolerance for a glued instruction cell', () => {
    // Tolerance pinned on purpose (fix round 4): the date is read and the
    // trailing prose of the same cell is dropped. Once the instruction owns its
    // own band this only happens for a genuinely glued input.
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          [
            'Ibu 400 mg | 1 | - | - | - | Stk |  | 19.02.2023 nach dem Essen |  |  | Selbstmedikation',
          ],
          german2023Header,
        ),
      ),
    );

    const medicament = value.Medicaments?.[0];
    expect(medicament?.Pos?.[0]?.DtTo).toBe('2023-02-19');
    expect(medicament?.Pos?.[0]?.DtFrom).toBe('');
    expect(medicament?.AppInstr).toBeUndefined();
    // The glued `Selbstmedikation` cell sets AutoMed and never fabricates an
    // author from the marker.
    expect(medicament?.AutoMed).toBe(1);
    expect(medicament).not.toHaveProperty('PrscbBy');
  });

  it('reads a glued "Selbstmedikation Fieber" prescriber cell as self-medication', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          [
            'Ibu 400 mg | 1 | - | - | - | Stk | 01.09.2026 | - | bei Bedarf |  | Selbstmedikation Fieber',
          ],
          german2023Header,
        ),
      ),
    );

    const medicament = value.Medicaments?.[0];
    // The start-anchored prefix keeps a glued cell from becoming an author;
    // the trailing printed reason is recovered when the Reason cell is empty.
    expect(medicament?.AutoMed).toBe(1);
    expect(medicament).not.toHaveProperty('PrscbBy');
    expect(medicament?.TkgRsn).toBe('Fieber');
  });

  it('reads the German titles "Einheit" and "Anleitung"', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          ['Ibu 400 mg | 1 | - | - | - | Stück | 01.09.2026 | - | bei Bedarf | Fieber | Dr. med. A Muster'],
          germanHeader,
        ),
      ),
    );

    expect(value.Medicaments?.[0]).toEqual({
      Id: 'Ibu 400 mg',
      IdType: 1,
      Unit: 'Stk',
      AppInstr: 'bei Bedarf',
      TkgRsn: 'Fieber',
      PrscbBy: 'Dr. med. A Muster',
      Pos: [{ DtFrom: '2026-09-01', D: [1, 0, 0, 0] }],
      Roa: 'PO',
    });
  });

  it('keeps a printed "-" unit literal and maps the start date', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText(
          ['Ibu 400 mg | 2 | - | - | – | - | 01.09.2026 | - | | | |'],
          germanHeader,
        ),
      ),
    );

    expect(value.Medicaments?.[0]).toEqual({
      Id: 'Ibu 400 mg',
      IdType: 1,
      Unit: '-',
      Pos: [{ DtFrom: '2026-09-01', D: [2, 0, 0, 0] }],
      Roa: 'PO',
    });
  });

  it('keeps four printed dashes as an all-zero dose vector', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(
        paperText(
          ['Essigwickel | - | - | - | - | - | 09.09.2016 | - | bei Bedarf | Fieber | Selbstmedikation'],
          germanHeader,
        ),
      ),
    );

    expect(value.Medicaments?.[0]).toEqual({
      Id: 'Essigwickel',
      IdType: 1,
      Unit: '-',
      AppInstr: 'bei Bedarf',
      TkgRsn: 'Fieber',
      AutoMed: 1,
      Pos: [{ DtFrom: '2016-09-09', D: [0, 0, 0, 0] }],
      // No derivable route for a topical wrap.
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown-field',
          path: '/Medicaments/0/Roa',
        }),
      ]),
    );
  });

  it('appends the reserve table rows and re-derives its column layout', () => {
    const text = [
      'Peter Muster',
      '01.11.1943 (M)',
      '2, Seidenhofstrasse, Altstadt, 6002 Luzern',
      'Ausstellungsdatum: 27.10.2026 14:39',
      'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anleitung',
      'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 | - | morgens',
      'Reservemedikation',
      'Medikament | Nacht | Abend | Mittag | Morgen | Einheit | Bis u. mit',
      'Ibuprofen 400 mg | 2 | - | - | - | Stück | 05.10.2026',
      'Bemerkung :',
      'Freitext, der keine Medikamentenzeile ist.',
      'Peter Muster (01.11.1943)  eMediplan by HCI Solutions AG(V1.0)  Seite 1 von 1',
    ].join('\n');

    const { value } = expectSuccess(parsePrescriptionText(text));

    expect(value.Medicaments).toEqual([
      {
        Id: 'Ramipril 5 mg',
        IdType: 1,
        Unit: 'Stk',
        AppInstr: 'morgens',
        Pos: [{ DtFrom: '2026-09-01', D: [1, 0, 0, 0] }],
        Roa: 'PO',
      },
      {
        Id: 'Ibuprofen 400 mg',
        IdType: 1,
        Unit: 'Stk',
        Pos: [{ DtFrom: '', DtTo: '2026-10-05', InRes: 1, D: [0, 0, 0, 2] }],
        Roa: 'PO',
      },
    ]);
  });

  it('uses an unlabelled birth line as the compact patient anchor', () => {
    const text = [
      'Erika Muster',
      '05.05.1980 (W)',
      'Sonnenweg 8, 4059 Basel',
      'Ausstellungsdatum: 01.09.2026',
      DEFAULT_HEADER,
      'Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | |',
    ].join('\n');

    const { value } = expectSuccess(parsePrescriptionText(text));

    expect(value.Patient).toMatchObject({
      FName: 'Erika',
      LName: 'Muster',
      BDt: '1980-05-05',
      Gender: 2,
      Zip: '4059',
      City: 'Basel',
    });
  });

  it('stops at the footer and the comment section', () => {
    const text = [
      'Peter Muster',
      '01.11.1943 (M)',
      '2, Seidenhofstrasse, Altstadt, 6002 Luzern',
      'Ausstellungsdatum: 27.10.2026 14:39',
      germanHeader,
      'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 | - | morgens',
      'Seite 1 von 1',
      'Ibuprofen 400 mg | 2 | - | - | - | Stück | 01.09.2026 | - | abends',
    ].join('\n');

    const { value } = expectSuccess(parsePrescriptionText(text));

    expect(value.Medicaments?.map((medicament) => medicament.Id)).toEqual(['Ramipril 5 mg']);
  });
});

describe('patient medical data, language, remark and issue time (phase 3)', () => {
  const germanHeader =
    'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anleitung | Grund | Verordnet durch';

  /** Patient block with an optional medical line + a single printed row. */
  function medicalText(extraLines: readonly string[]): string {
    return [
      'Peter Muster',
      '01.11.1943 (M)',
      '2, Seidenhofstrasse, Altstadt, 6002 Luzern',
      ...extraLines,
      'Ausstellungsdatum: 29.10.2026 09:42',
      germanHeader,
      'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 | - | morgens | Bluthochdruck | Dr. med. A Muster',
    ].join('\n');
  }

  it('parses the combined height/weight line in reference order and tolerates reordering', () => {
    const printed = expectSuccess(
      parsePrescriptionText(medicalText(['Körpergrösse / Gewicht: 180 cm / 81 kg'])),
    );
    const reordered = expectSuccess(
      parsePrescriptionText(medicalText(['Körpergrösse / Gewicht: 81 kg / 180 cm'])),
    );

    const expected = [
      { Type: 1, Val: '81', Unit: 2 },
      { Type: 2, Val: '180', Unit: 1 },
    ];
    expect(printed.value.Patient.Med?.Meas).toEqual(expected);
    expect(reordered.value.Patient.Med?.Meas).toEqual(expected);
    expect(printed.warnings).toEqual([]);
  });

  it('omits an absent measurement member with a warning instead of inventing it', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(medicalText(['Körpergrösse / Gewicht: 180 cm'])),
    );

    expect(value.Patient.Med?.Meas).toEqual([{ Type: 2, Val: '180', Unit: 1 }]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'unknown-field',
          path: '/Patient/Med/Meas',
          // i18n plan 007 phase 8: one sub-code per missing member.
          detail: 'missing-weight',
          message: expect.stringContaining('weight'),
        },
      ]),
    );
  });

  it('maps renal light and penicillin allergy, and warns instead of inventing unknown diabetes', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(
        medicalText([
          'Niereninsuffizienz: leicht',
          'Diabetes: Unbekannt',
          'Allergie(n): Penicillin-Allergie, z.B. Amoxicillin, Flucloxacillin, Piperacillin',
        ]),
      ),
    );

    expect(value.Patient.Med?.Rc).toEqual([
      { Id: 1, R: [577] },
      { Id: 6, R: [571] },
    ]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'unknown-field',
          path: '/Patient/Med/Rc',
          // i18n plan 007 phase 8: stable sub-code plus the printed value.
          detail: 'diabetes-unknown',
          params: { value: 'Unbekannt' },
          message: expect.stringContaining('"Unbekannt"'),
        },
      ]),
    );
  });

  it('omits an unmappable allergy line with a warning', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(medicalText(['Allergie(n): Erdbeeren'])),
    );

    expect(value.Patient.Med?.Rc).toBeUndefined();
    expect(warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'unknown-field',
          path: '/Patient/Med/Rc',
          // i18n plan 007 phase 8: stable sub-code plus the printed value.
          detail: 'allergy-unknown',
          params: { value: 'Erdbeeren' },
          message: expect.stringContaining('Erdbeeren'),
        },
      ]),
    );
  });

  it('captures the printed Bemerkung verbatim into Rmk (never re-spelled)', () => {
    // The probe reference says `begeistert!`; the parser must keep whatever the
    // page prints. This test pins the capture, not the spelling.
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Peter Muster',
          '01.11.1943 (M)',
          '2, Seidenhofstrasse, Altstadt, 6002 Luzern',
          'Ausstellungsdatum: 29.10.2026 09:42',
          germanHeader,
          'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 | - | morgens',
          'Bemerkung :',
          'begeistert!',
          'Zweite Zeile',
          'Peter Muster (01.11.1943)  eMediplan by HCI Solutions AG(V1.0)  Seite 1 von 1',
        ].join('\n'),
      ),
    );

    expect(value.Rmk).toBe('begeistert!\nZweite Zeile');
    expect(value.Dt).toBe('2026-10-29T09:42:00+01:00');
  });

  it('bounds the captured remark and strips control characters per line', () => {
    const noisy = `${'x'.repeat(2000)}\u0000\u0007`;
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Peter Muster',
          '01.11.1943 (M)',
          '2, Seidenhofstrasse, Altstadt, 6002 Luzern',
          'Ausstellungsdatum: 29.10.2026 09:42',
          germanHeader,
          'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 | - | morgens',
          'Bemerkung :',
          noisy,
          'tail beyond the clip bound',
        ].join('\n'),
      ),
    );

    expect(value.Rmk).toHaveLength(1000);
    expect(value.Rmk).not.toContain('\u0000');
    expect(value.Rmk).not.toContain('\u0007');
    expect(value.Rmk?.endsWith('tail beyond the clip bound')).toBe(false);
  });

  it('keeps a date-only issue date as a date and computes CEST for a summer time', () => {
    const dateOnly = expectSuccess(
      parsePrescriptionText(
        medicalText([]).replace('Ausstellungsdatum: 29.10.2026 09:42', 'Ausstellungsdatum: 29.10.2026'),
      ),
    );
    const summer = expectSuccess(
      parsePrescriptionText(
        medicalText([]).replace('29.10.2026 09:42', '15.07.2026 09:42'),
      ),
    );

    expect(dateOnly.value.Dt).toBe('2026-10-29');
    expect(summer.value.Dt).toBe('2026-07-15T09:42:00+02:00');
  });

  it('resolves the Swiss DST boundaries with the two-candidate rule', () => {
    // Offline oracle: Node's Intl.DateTimeFormat with `Europe/Zurich` reports
    // the real Swiss offset for a UTC instant. The expected values below are
    // derived from that oracle, not from the parser's own formula.
    const zurichOffset = (instant: string): string => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Zurich',
        timeZoneName: 'longOffset',
      }).formatToParts(new Date(instant));
      return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    };
    const parseAt = (issueDate: string): string => {
      const { value } = expectSuccess(
        parsePrescriptionText(
          paperText(
            ['Ramipril 5 mg | 1 | - | - | - | Tablet | 01.09.2026 | - | | | Dr. med. A Muster'],
            DEFAULT_HEADER,
            issueDate,
          ),
        ),
      );
      return value.Dt;
    };

    // Last Sunday of March 2026 (29.03.), 01:30 local is still the CET window
    // before the 02:00 → 03:00 jump. Oracle: 00:30Z is GMT+01:00.
    expect(zurichOffset('2026-03-29T00:30:00Z')).toBe('GMT+01:00');
    expect(parseAt('29.03.2026 01:30')).toBe('2026-03-29T01:30:00+01:00');

    // Spring gap: 02:30 local does not exist; the historical convention keeps
    // the wall-time-as-UTC classification (+02:00).
    expect(parseAt('29.03.2026 02:30')).toBe('2026-03-29T02:30:00+02:00');

    // Autumn overlap: last Sunday of October 2026 (25.10.), 02:30 local exists
    // twice and resolves deterministically to CET. Oracle: 01:30Z is GMT+01:00.
    expect(zurichOffset('2026-10-25T01:30:00Z')).toBe('GMT+01:00');
    expect(parseAt('25.10.2026 02:30')).toBe('2026-10-25T02:30:00+01:00');

    // 01:30 local on the same day is still CEST. Oracle: 23:30Z (24.10.) is
    // GMT+02:00.
    expect(zurichOffset('2026-10-24T23:30:00Z')).toBe('GMT+02:00');
    expect(parseAt('25.10.2026 01:30')).toBe('2026-10-25T01:30:00+02:00');
  });

  it('detects German from the printed vocabulary and leaves unsupported languages warned', () => {
    const german = expectSuccess(
      parsePrescriptionText(medicalText(['Körpergrösse / Gewicht: 180 cm / 81 kg'])),
    );
    // A French layout parses through the shared title vocabulary but has no
    // language mapping yet: the placeholder is kept and a warning explains it.
    const french = expectSuccess(
      parsePrescriptionText(
        [
          'Prénom: Erika',
          'Nom: Muster',
          'Date de naissance: 05.05.1980 (F)',
          "Date d'émission: 01.09.2026",
          'Médicament | Matin | Midi | Soir | Nuit | Quantité | Du | Au | Instructions | Raison | Prescrit par',
          'Ramipril 5 mg | 1 | - | - | - | Comprimé | 01.09.2026 | - | | | Dr. med. A Muster',
        ].join('\n'),
      ),
    );

    expect(german.value.Patient.Lng).toBe('de');
    expect(french.value.Patient.Lng).toBe('');
    expect(french.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'unknown-field',
          path: '/Patient/Lng',
          // i18n plan 007 phase 8: stable sub-code for the localized template.
          detail: 'language-undetected',
          message: expect.stringContaining('i18n'),
        },
      ]),
    );
  });
});

describe('link-annotation identity (phase 4)', () => {
  /**
   * Synthetic geometry of the five medication rows of the real German fixture,
   * in document order: VALIUM, SORTIS, CO-DIOVAN, PANADOL, Essigwickel. The
   * values are arbitrary but internally consistent: the mapping only compares
   * rects with these bands.
   */
  const ROWS: readonly PdfRowGeometry[] = [
    { page: 1, top: 440, bottom: 420, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 400, bottom: 380, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 360, bottom: 340, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 320, bottom: 300, medicationLeft: 40, medicationRight: 120 },
    { page: 1, top: 280, bottom: 260, medicationLeft: 40, medicationRight: 120 },
  ];

  /** A link annotation centered on the medication cell of one row. */
  function annotation(rowIndex: number, productId: string): PdfLinkAnnotation {
    const row = ROWS[rowIndex];
    if (row === undefined) {
      throw new Error(`No synthetic row ${rowIndex}`);
    }
    return {
      page: row.page,
      rect: [row.medicationLeft + 1, row.bottom + 2, row.medicationLeft + 60, row.top - 2],
      productId,
    };
  }

  it('maps an annotation to the row its rect overlaps', () => {
    const ids = mapAnnotationsToRows(ROWS, [annotation(3, '1159424')]);

    expect(ids).toEqual([undefined, undefined, undefined, '1159424', undefined]);
  });

  it('maps several annotations to their own rows without cross-mapping', () => {
    const ids = mapAnnotationsToRows(ROWS, [
      annotation(0, '23846'),
      annotation(1, '58356'),
      annotation(2, '93139'),
    ]);

    expect(ids).toEqual(['23846', '58356', '93139', undefined, undefined]);
  });

  it('rejects an ambiguous annotation that overlaps two row bands', () => {
    const overlapping: readonly PdfRowGeometry[] = [
      { page: 1, top: 440, bottom: 420, medicationLeft: 40, medicationRight: 120 },
      { page: 1, top: 430, bottom: 410, medicationLeft: 40, medicationRight: 120 },
    ];

    const ids = mapAnnotationsToRows(overlapping, [
      { page: 1, rect: [50, 415, 100, 425], productId: '58356' },
    ]);

    // Ambiguous: never assigned to the nearest row.
    expect(ids).toEqual([undefined, undefined]);
  });

  it('deduplicates the same id and rejects two different ids on one row', () => {
    const duplicated = mapAnnotationsToRows(ROWS, [
      annotation(3, '1159424'),
      annotation(3, '1159424'),
    ]);
    const conflicting = mapAnnotationsToRows(ROWS, [
      annotation(3, '111111'),
      annotation(3, '222222'),
    ]);

    expect(duplicated[3]).toBe('1159424');
    expect(conflicting[3]).toBeUndefined();
  });

  it('ignores annotations on another page or in another column', () => {
    const otherPage = mapAnnotationsToRows(ROWS, [
      { page: 2, rect: annotation(3, 'x').rect, productId: '1159424' },
    ]);
    const otherColumn = mapAnnotationsToRows(ROWS, [
      { page: 1, rect: [200, 302, 240, 318], productId: '1159424' },
    ]);

    expect(otherPage.every((id) => id === undefined)).toBe(true);
    expect(otherColumn[3]).toBeUndefined();
  });

  it('applies IdType 4 only to the matching row and keeps the text fallback elsewhere', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(realGermanFixture, {
        annotations: [annotation(3, '1159424')],
        rows: ROWS,
      }),
    );

    expect(value.Medicaments?.[3]).toMatchObject({ Id: '1159424', IdType: 4 });
    expect(value.Medicaments?.[4]).toMatchObject({ Id: 'Essigwickel', IdType: 1 });
    expect(value.Medicaments?.map((medicament) => medicament.IdType)).toEqual([
      1, 1, 1, 4, 1,
    ]);
  });

  it('drops every IdType-4 binding when geometry rows and medicaments disagree', () => {
    // Six geometry rows for five parsed medicaments: a band that produced no
    // medicament would shift every later binding, so the parser must fail
    // closed instead of attaching an id to the wrong row.
    const shiftedRows: readonly PdfRowGeometry[] = [
      ...ROWS,
      { page: 1, top: 240, bottom: 220, medicationLeft: 40, medicationRight: 120 },
    ];
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(realGermanFixture, {
        annotations: [annotation(3, '1159424')],
        rows: shiftedRows,
      }),
    );

    expect(value.Medicaments?.every((medicament) => medicament.IdType !== 4)).toBe(true);
    expect(value.Medicaments?.[3]).toMatchObject({ IdType: 1 });
    expect(value.Medicaments?.[3]?.Id).toContain('PANADOL');
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown-field',
          path: '/Medicaments',
          message: expect.stringContaining('IdType 4'),
        }),
      ]),
    );
  });

  it('maps every annotated real row in the synthetic variant, without leaking', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(realGermanFixture, {
        annotations: [
          annotation(0, '23846'),
          annotation(1, '58356'),
          annotation(2, '93139'),
          annotation(3, '1159424'),
        ],
        rows: ROWS,
      }),
    );

    expect(value.Medicaments?.map((medicament) => [medicament.Id, medicament.IdType])).toEqual([
      ['23846', 4],
      ['58356', 4],
      ['93139', 4],
      ['1159424', 4],
      ['Essigwickel', 1],
    ]);
  });

  it('keeps the printed-text id when no annotation context is supplied', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));

    expect(value.Medicaments?.[3]?.IdType).toBe(1);
    expect(value.Medicaments?.[3]?.Id).toContain('PANADOL');
    expect(value.Medicaments?.[4]).toMatchObject({ Id: 'Essigwickel', IdType: 1 });
  });
});

/**
 * Plan 007 phase 9 — FR/IT printed vocabulary, vocabulary level only.
 *
 * Source of truth: the paper-layout section of `chmed16a/README.md:1691-1769`
 * prints the column, patient and provider titles in English only, and
 * `README.md:1771-1786` says the printed translations are published on the
 * external IG eMediplan site — not in this repository, and never fetched here.
 * No FR/IT title can therefore be *added* from the spec: the French/Italian
 * tokens below are the seed vocabulary that already existed in the matcher
 * tables. These tests pin their behaviour so an FR/IT document has defined
 * semantics and a regression is caught, and they pin the gaps that stay open.
 * No real FR/IT paper has been parsed (follow-up: ground-truth samples).
 */
describe('FR/IT printed vocabulary (phase 9, vocabulary only)', () => {
  const frHeader =
    'Médicament | Matin | Midi | Soir | Nuit | Quantité | Du | Au | Instructions | Raison | Prescrit par';
  const itHeader =
    'Farmaco | Mattina | Mezzogiorno | Sera | Notte | Quantità | Dal | Al | Indicazioni | Motivo | Prescritto';

  const frRow =
    'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 | - | après le repas | Hypertension | Dr. med. A Muster';
  const itRow =
    'Ramipril 5 mg | 1 | - | - | - | Stk | 01.09.2026 | - | dopo i pasti | Ipertensione | Dr. med. A Muster';

  it('maps the seed French and Italian column titles', () => {
    const cases: ReadonlyArray<readonly [string, ColumnKey]> = [
      ['Médicament', 'medication'],
      ['Matin', 'morning'],
      ['Midi', 'noon'],
      ['Soir', 'evening'],
      ['Nuit', 'night'],
      ['Quantité', 'quantity'],
      ['Du', 'from'],
      ['Au', 'upTo'],
      // `Instructions` is the same word in French, so the English matcher covers it.
      ['Instructions', 'instructions'],
      ['Raison', 'reason'],
      ['Prescrit par', 'prescribedBy'],
      ['Farmaco', 'medication'],
      ['Mattina', 'morning'],
      ['Mezzogiorno', 'noon'],
      ['Sera', 'evening'],
      ['Notte', 'night'],
      ['Quantità', 'quantity'],
      ['Dal', 'from'],
      ['Indicazioni', 'instructions'],
      ['Motivo', 'reason'],
      ['Prescritto', 'prescribedBy'],
    ];

    for (const [title, key] of cases) {
      expect(columnKeyFor(title), `printed title "${title}"`).toBe(key);
    }
  });

  it('casefolds and trims accented titles like the German ones', () => {
    // The shared pipeline is `trim` + the `u`/`i` regexp flags, so an upper-case
    // precomposed accent folds onto the lower-case token.
    expect(columnKeyFor('  MÉDICAMENT  ')).toBe('medication');
    expect(columnKeyFor('QUANTITÉ')).toBe('quantity');
    expect(columnKeyFor('Médicament 100 mg')).toBe('medication');
  });

  it('reads the seed French patient block labels and the issue-date label', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Prénom: Jean',
          'Nom: Dupont',
          'Date de naissance: 05.05.1980 (M)',
          'Rue: Grand-Rue',
          'Code postal: 1201',
          'Ville: Genève',
          "Date d'émission: 29.10.2026 09:42",
          frHeader,
          frRow,
        ].join('\n'),
      ),
    );

    expect(value.Patient).toMatchObject({
      FName: 'Jean',
      LName: 'Dupont',
      BDt: '1980-05-05',
      Gender: 1,
      Street: 'Grand-Rue',
      Zip: '1201',
      City: 'Genève',
    });
    expect(value.Dt).toBe('2026-10-29T09:42:00+01:00');
  });

  it('reads the seed Italian patient block labels and the issue-date label', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Nome: Mario',
          'Cognome: Rossi',
          'Data di nascita: 05.05.1980 (M)',
          'Sesso: M',
          'Via: Via Roma',
          'CAP: 6900',
          'Località: Lugano',
          'Data di emissione: 29.10.2026 09:42',
          itHeader,
          itRow,
        ].join('\n'),
      ),
    );

    expect(value.Patient).toMatchObject({
      FName: 'Mario',
      LName: 'Rossi',
      BDt: '1980-05-05',
      Gender: 1,
      Street: 'Via Roma',
      Zip: '6900',
      City: 'Lugano',
    });
    expect(value.Dt).toBe('2026-10-29T09:42:00+01:00');
  });

  it('keeps the empty Lng placeholder for FR/IT instead of guessing a language', () => {
    // Documented limitation (the code comment says detection is deferred): only
    // German and English evidence is scored, so a French page warns and keeps
    // the required `''` placeholder rather than being invented as `de`.
    const result = expectSuccess(
      parsePrescriptionText(
        [
          'Prénom: Jean',
          'Nom: Dupont',
          'Date de naissance: 05.05.1980 (M)',
          "Date d'émission: 29.10.2026 09:42",
          frHeader,
          frRow,
        ].join('\n'),
      ),
    );

    expect(result.value.Patient.Lng).toBe('');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown-field',
          path: '/Patient/Lng',
          detail: 'language-undetected',
        }),
      ]),
    );
  });

  it('consumes the seed French provider labels without fabricating a provider', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Prescrit par: Dr. med. A Muster',
          'Pharmacie: Pharmacie Centrale',
          'Prénom: Jean',
          'Nom: Dupont',
          'Date de naissance: 05.05.1980 (M)',
          "Date d'émission: 29.10.2026 09:42",
          frHeader,
          frRow,
        ].join('\n'),
      ),
    );

    // MP has no provider identity: no printed GLN keeps the explicit marker.
    expect(value.Auth).toBe('patient');
  });

  it('treats the French and Italian self-medication tokens like the German one', () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ['Automédication', 'Fièvre', frHeader],
      ['Automedicazione', 'Febbre', itHeader],
    ];

    for (const [marker, reason, header] of cases) {
      // Glued cell: the marker names the prescriber cell, the trailing printed
      // reason is recovered because the Reason cell is empty.
      const { value } = expectSuccess(
        parsePrescriptionText(
          [
            'Jean Dupont',
            'Date de naissance: 05.05.1980 (M)',
            "Date d'émission: 29.10.2026 09:42",
            header,
            `Ibu 400 mg | 1 | - | - | - | Stk | 01.09.2026 | - | après le repas |  | ${marker} ${reason}`,
          ].join('\n'),
        ),
      );

      const medicament = value.Medicaments?.[0];
      expect(medicament?.AutoMed, `self-medication marker "${marker}"`).toBe(1);
      expect(medicament).not.toHaveProperty('PrscbBy');
      expect(medicament?.TkgRsn).toBe(reason);
    }
  });

  it('keeps the start anchor: a French value that merely contains the token is an author', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Jean Dupont',
          'Date de naissance: 05.05.1980 (M)',
          "Date d'émission: 29.10.2026 09:42",
          frHeader,
          'Ibu 400 mg | 1 | - | - | - | Stk | 01.09.2026 | - | après le repas | Fièvre | Dr. Automédication',
        ].join('\n'),
      ),
    );

    const medicament = value.Medicaments?.[0];
    expect(medicament).not.toHaveProperty('AutoMed');
    expect(medicament?.PrscbBy).toBe('Dr. Automédication');
  });

  it('reads the French "voir les instructions" dose cell as a cross-reference', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        [
          'Jean Dupont',
          'Date de naissance: 05.05.1980 (M)',
          "Date d'émission: 29.10.2026 09:42",
          frHeader,
          'Ibu 400 mg | voir les instructions |  |  |  | - |  |  | après le repas | Fièvre | Automédication',
        ].join('\n'),
      ),
    );

    expect(value.Medicaments?.[0]).toMatchObject({
      AppInstr: 'après le repas',
      TkgRsn: 'Fièvre',
      AutoMed: 1,
    });
    expect(value.Medicaments?.[0]?.Pos).toBeUndefined();
  });

  it('maps the French risk names quoted by the spec to their risk ids', () => {
    // `chmed16a/README.md:823-849` prints the French names
    // (`Insuffisance rénale, légère|modérée|sévère|terminale`); the stage word
    // decides the risk id inside risk category 1.
    const cases: ReadonlyArray<readonly [string, number]> = [
      ['légère', 577],
      ['modérée', 576],
      ['sévère', 575],
      ['terminale', 597],
    ];

    for (const [stage, id] of cases) {
      const { value } = expectSuccess(
        parsePrescriptionText(
          [
            'Jean Dupont',
            'Date de naissance: 05.05.1980 (M)',
            `Insuffisance rénale: ${stage}`,
            "Date d'émission: 29.10.2026 09:42",
            frHeader,
            frRow,
          ].join('\n'),
        ),
      );
      expect(value.Patient.Med?.Rc, `French renal stage "${stage}"`).toEqual([{ Id: 1, R: [id] }]);
    }
  });
});
