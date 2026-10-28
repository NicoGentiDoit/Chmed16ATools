import { describe, expect, it, vi } from 'vitest';

import rawGermanFixture from './fixtures/emediplan-paper-raw-de.txt?raw';
import realGerman2023Fixture from './fixtures/emediplan-paper-rx-real-de-2023.txt?raw';
import realGermanOneDoctorFixture from './fixtures/emediplan-paper-rx-real-de-one-doctor.txt?raw';
import realGermanFixture from './fixtures/emediplan-paper-rx-real-de.txt?raw';
import minimalFixture from './fixtures/emediplan-paper-rx-minimal.txt?raw';
import singleMedicamentFixture from './fixtures/emediplan-paper-rx.txt?raw';
import twoMedicamentsFixture from './fixtures/emediplan-paper-rx-two-meds.txt?raw';
import { parsePrescriptionText } from '../prescription-parse';
import type { PrescriptionParseResult } from '../prescription-parse';
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

    expect(value.rev).toBe(3);
    expect(value.MedType).toBe(3);
    expect(value.Id).toMatch(UUID_V4);
    expect(value.Auth).toBe('7601000123456');
    expect(value.Dt).toBe('2026-10-27');
    expect(value.Patient).toEqual({
      FName: 'Hans',
      LName: 'Müller',
      BDt: '1962-03-14',
      Gender: 1,
      Street: 'Rosenweg 5',
      Zip: '3000',
      City: 'Bern',
      Phone: '+41 79 123 45 67',
    });
    expect(value.HcPerson).toEqual({ Gln: '7601000123456', FName: 'Anna', LName: 'Muster' });
    expect(value.HcOrg).toEqual({
      Name: 'Praxis Muster',
      Street: 'Bahnhofstrasse 12',
      Zip: '8001',
      City: 'Zürich',
    });
    expect(value.Medicaments).toEqual([
      {
        Id: 'Ramipril 5 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'After a meal',
        Pos: [{ DtTo: '2026-10-31', D: [1, 0, 0.5, 0] }],
      },
      {
        Id: 'Metformin 500 mg',
        IdType: 1,
        Unit: 'Tablet',
        AppInstr: 'With meals',
        Pos: [{ D: [0, 1, 0, 1] }],
      },
    ]);
    expect(warnings).toEqual([]);

    // The parsed object is a valid revision-3 ePrescription (integration check).
    expect(validateObject(value).errors).toEqual([]);
  });

  it('always emits rev 3 and never the rev-1 assumption warning', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(minimalFixture),
    );

    expect(value.rev).toBe(3);
    expect(value.MedType).toBe(3);
    expect(warnings.map((warning) => warning.code)).not.toContain('rev1-assumption');
  });

  it('parses two medicaments with GTIN, fractions and "See instructions"', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(twoMedicamentsFixture),
    );

    expect(value.Auth).toBe('7601000987654');
    expect(value.Dt).toBe('2026-10-28');
    expect(value.Patient).toEqual({
      FName: 'Lena',
      LName: 'Keller',
      BDt: '1990-07-02',
      Gender: 2,
      Street: 'Sonnenweg 8',
      Zip: '4059',
      City: 'Basel',
      Phone: '+41 61 222 33 44',
    });
    expect(value.HcPerson).toEqual({ Gln: '7601000987654', FName: 'Peter', LName: 'Steiner' });
    expect(value.HcOrg).toEqual({
      Name: 'Apotheke am Markt',
      Street: 'Marktgasse 4',
      Zip: '4051',
      City: 'Basel',
    });
    expect(value.Medicaments).toEqual([
      {
        Id: '7680654340123',
        IdType: 2,
        Unit: 'Tablet',
        AppInstr: 'Take with water',
        Pos: [{ DtTo: '2026-10-30', D: [0.25, 0.33, 0.67, 0.125] }],
      },
      {
        Id: 'Amoxicillin 500 mg',
        IdType: 1,
        Unit: 'Capsule',
        AppInstr: 'Take every 8 hours',
        Pos: [{ DtTo: '2026-11-02' }],
      },
    ]);
  });

  it('parses the minimal patient fixture and warns about the empty Auth', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(minimalFixture),
    );

    expect(value.Auth).toBe('');
    expect(value.Dt).toBe('2026-10-28');
    expect(value.Patient).toEqual({
      FName: 'Max',
      LName: 'Beispiel',
      BDt: '1970-01-01',
      Gender: 1,
    });
    expect(value.HcPerson).toBeUndefined();
    expect(value.HcOrg).toBeUndefined();
    expect(value.Medicaments).toEqual([
      {
        Id: 'Paracetamol 500 mg',
        IdType: 1,
        Unit: 'Tablet',
        Pos: [{ DtTo: '2026-10-31', D: [1, 1, 0, 0] }],
      },
    ]);
    expect(warnings).toEqual([{ code: 'empty-string', path: '/Auth', message: expect.any(String) }]);
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
        Pos: [{ DtTo: '2026-10-05', D: [2, 0, 0, 0] }],
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

  it('does not emit MP/PMC-only columns on an Rx medicament', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(singleMedicamentFixture),
    );
    const keys = Object.keys(value.Medicaments?.[0] ?? {});

    expect(keys).not.toContain('TkgRsn');
    expect(keys).not.toContain('PrscbBy');
  });

  it('reads optional Rep/Subs/NbPack/IndC cells when a row carries them', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        paperText([
          'Ibu 400 mg | 1 | 0 | 0 | 0 | Tablet | 01.09.2026 | 05.10.2026 | | | | Rep: 3 | NbPack: 2 | Subs: 1 | IndC: 12345.00',
        ]),
      ),
    );

    expect(value.Medicaments?.[0]).toMatchObject({
      Rep: 3,
      NbPack: 2,
      Subs: 1,
      IndC: '12345.00',
    });
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
        { code: 'invalid-value', path: '/Id', message: expect.stringContaining('crypto') },
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
    expect(tolerant.value.HcPerson).toEqual(strict.value.HcPerson);
    expect(tolerant.value.HcOrg).toEqual(strict.value.HcOrg);
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
    expect(tolerant.value.HcPerson).toEqual(strict.value.HcPerson);
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
        Pos: [{ D: [2, 0, 0, 0] }],
      },
      {
        Id: 'SORTIS Filmtabl 20 mg Atorvastatin',
        IdType: 1,
        Unit: 'Milligramm Atorvastatin',
        Pos: [{ D: [0, 0, 1, 0] }],
      },
      {
        Id: 'CO-DIOVAN Filmtabl 160/12.5 mg Valsartan, Hydrochlorothiazid',
        IdType: 1,
        Unit: 'Stück',
        Pos: [{ D: [1, 0, 0, 0] }],
      },
      {
        Id: 'PANADOL S Filmtabl 500 mg (#) Paracetamol',
        IdType: 1,
        Unit: 'Stück',
        AppInstr: 'bis zu max. 4 mal täglich 1 Tablette einnehmen',
      },
      {
        Id: 'Essigwickel',
        IdType: 1,
        AppInstr: 'bei Bedarf',
      },
    ]);
  });

  it('reads the unlabelled patient block and the German issue date', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));

    expect(value.Patient).toEqual({
      FName: 'Peter',
      LName: 'Muster',
      BDt: '1943-11-01',
      Gender: 1,
      Street: '2, Seidenhofstrasse, Altstadt',
      Zip: '6002',
      City: 'Luzern',
    });
    expect(value.Dt).toBe('2026-10-27');
    expect(value.rev).toBe(3);
    expect(value.MedType).toBe(3);
  });

  it('never promotes the printed "Von" column to DtTo and never emits DtFrom', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));
    const serialized = JSON.stringify(value);

    expect(serialized).not.toContain('DtFrom');
    expect(serialized).not.toContain('DtTo');
    // The rows carry a printed from-date (03.11.2015, 01.03.2016, 09.09.2016)
    // but no end date; Rx has no DtFrom, so the value is consumed and dropped.
    expect(value.Medicaments?.every((medicament) => medicament.Pos === undefined
      || medicament.Pos[0]?.DtTo === undefined)).toBe(true);
  });

  it('reports no invalid-value error, only the empty provider GLN warning', () => {
    const { warnings } = expectSuccess(parsePrescriptionText(realGermanFixture));

    expect(warnings).toEqual([{ code: 'empty-string', path: '/Auth', message: expect.any(String) }]);
  });

  it('surfaces the missing provider identity instead of inventing one', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanFixture));
    const validation = validateObject(value, { medType: 3, rev: 3 });

    // The sample prints `erstellt von :` without a value and no GLN anywhere, so
    // revision 3 cannot be satisfied; the gap is reported, not filled in. The
    // per-row prescribers name two different doctors, so the fix-round-3
    // inference is ambiguous and deliberately sets nothing.
    expect(value.HcPerson).toBeUndefined();
    expect(value.HcOrg).toBeUndefined();
    expect(validation.errors.map((error) => error.params)).toEqual([
      { missingProperty: 'HcPerson' },
      { missingProperty: 'HcOrg' },
    ]);
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

    expect(value.Dt).toBe('2023-02-09');
    expect(value.Medicaments).toEqual([
      {
        Id: 'ANTIBIOTIKUM Tabl 800/160mg Disulfontetraprim, Monoketozam',
        IdType: 1,
        Unit: 'Stk',
        AppInstr: 'nach dem Essen',
        Pos: [{ DtTo: '2023-02-19', D: [1, 0, 1, 0] }],
      },
      {
        Id: 'CO-ANTIHYP Filmtabl 160/12.5 mg Balsorten, Hydronatriazid',
        IdType: 1,
        Unit: 'Stk',
        Pos: [{ D: [1, 0, 0, 0] }],
      },
      {
        Id: 'CHOLES Filmtabl 20 mg Otamustitan',
        IdType: 1,
        Unit: 'Stk',
        Pos: [{ D: [0.5, 0, 1, 0] }],
      },
      {
        Id: 'ANTIKRAMPF Inj Lös 10 mg/2ml i.m./i.v. Trifluopam',
        IdType: 1,
        Unit: 'ml',
        AppInstr: 'nur i.m., nur durch instruierte Personen!',
        Pos: [{ D: [2, 0, 0, 0] }],
      },
      {
        Id: 'Essigwickel',
        IdType: 1,
        AppInstr: 'bei Bedarf',
      },
      {
        Id: 'ANTIPYRETIC Filmtabl 500 mg Antipyretic',
        IdType: 1,
        AppInstr: 'bis zu max. 4 mal täglich 1 Tablette einnehmen',
      },
    ]);
    expect(warnings).toEqual([{ code: 'empty-string', path: '/Auth', message: expect.any(String) }]);
  });

  it('never emits DtFrom for the printed "Von" column', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGerman2023Fixture));

    expect(JSON.stringify(value)).not.toContain('DtFrom');
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
  });

  it('stays validate-blocked on the missing provider identity and invents none', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGerman2023Fixture));

    // No GLN / organisation is printed and four different doctors are named per
    // row, so the round-3 inference stays deliberately ambiguous.
    expect(value.HcPerson).toBeUndefined();
    expect(value.HcOrg).toBeUndefined();
    expect(validateObject(value, { medType: 3, rev: 3 }).errors.map((error) => error.params)).toEqual([
      { missingProperty: 'HcPerson' },
      { missingProperty: 'HcOrg' },
    ]);
  });
});

describe('author inference from the "Prescribed by" column (fix round 3)', () => {
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

  it('infers HcPerson from one consistent prescriber and adds no HcOrg', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        authorText([`GLN: ${GLN}`], [row('Dr. med. Anna Muster'), row('Dr. med. Anna Muster')]),
      ),
    );

    expect(value.HcPerson).toEqual({ Gln: GLN, FName: 'Anna', LName: 'Muster' });
    // `HcOrg` is only ever the printed organisation block, never inferred.
    expect(value.HcOrg).toBeUndefined();
    expect(value.Auth).toBe(GLN);
  });

  it('drops the honorific and the printed city line of the cell', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(authorText([`GLN: ${GLN}`], [row('Dr. Example Karl, Wängi')])),
    );

    expect(value.HcPerson).toEqual({ Gln: GLN, FName: 'Example', LName: 'Karl' });
  });

  it('ignores self-medication markers, empty cells and the printed dash', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        authorText(
          [`GLN: ${GLN}`],
          [row('Selbstmedikation'), row(''), row('-'), row('Dr. med. Anna Muster')],
        ),
      ),
    );

    expect(value.HcPerson).toEqual({ Gln: GLN, FName: 'Anna', LName: 'Muster' });
  });

  it('infers nothing when only self-medication rows are printed', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        authorText([`GLN: ${GLN}`], [row('Selbstmedikation'), row('Self medication')]),
      ),
    );

    expect(value.HcPerson).toBeUndefined();
  });

  it('drops a self-medication cell whose printed reason is glued to it', () => {
    // The 2023 layout can glue `Fieber` into the `Verordnet` band cell. The
    // prefix form of the marker must still name no prescriber, otherwise the
    // glued text would fake a second author and defeat the inference.
    const { value } = expectSuccess(
      parsePrescriptionText(
        authorText(
          [`GLN: ${GLN}`],
          [
            row('Selbstmedikation Fieber'),
            row('Dr. med. Anna Muster'),
            row('Selbstmedikation Schmerzen'),
          ],
        ),
      ),
    );

    expect(value.HcPerson).toEqual({ Gln: GLN, FName: 'Anna', LName: 'Muster' });
  });

  it('infers nothing from two distinct prescribers (no error of its own)', () => {
    const { value, warnings } = expectSuccess(
      parsePrescriptionText(
        authorText(
          [`GLN: ${GLN}`],
          [row('Dr. med. Anna Muster'), row('Dr. med. Bruno Arzt'), row('Dr. med. Anna Muster')],
        ),
      ),
    );

    // Ambiguity is not a parse error: the validator keeps reporting the missing
    // required `HcPerson`/`HcOrg` exactly as before the inference existed.
    expect(value.HcPerson).toBeUndefined();
    expect(warnings.map((warning) => warning.code)).not.toContain('invalid-value');
    expect(validateObject(value, { medType: 3, rev: 3 }).errors.map((error) => error.params)).toEqual([
      { missingProperty: 'HcPerson' },
      { missingProperty: 'HcOrg' },
    ]);
  });

  it('keeps a named provider block as the author', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(
        authorText(
          ['Created by: Dr. med. Anna Muster', `GLN: ${GLN}`],
          [row('Dr. med. Bruno Arzt')],
        ),
      ),
    );

    // Document-level authorship wins over the per-row column: inference is
    // additive and never overrides printed data.
    expect(value.HcPerson).toEqual({ Gln: GLN, FName: 'Anna', LName: 'Muster' });
  });

  it('needs a printed GLN, because HcPerson.Gln is required', () => {
    const { value } = expectSuccess(
      parsePrescriptionText(authorText([], [row('Dr. med. Anna Muster')])),
    );

    expect(value.HcPerson).toBeUndefined();
  });

  it('infers the same author on the tolerant single-spaced path', () => {
    const spaced = authorText([`GLN: ${GLN}`], [row('Dr. med. Anna Muster'), row('Dr. med. Anna Muster')]);
    const strict = expectSuccess(parsePrescriptionText(spaced));
    const tolerant = expectSuccess(parsePrescriptionText(singleSpaced(spaced)));

    expect(tolerant.value.HcPerson).toEqual(strict.value.HcPerson);
    expect(tolerant.value.HcPerson).toEqual({ Gln: GLN, FName: 'Anna', LName: 'Muster' });
  });

  it('validates and encodes the real one-doctor sample variant', () => {
    const { value } = expectSuccess(parsePrescriptionText(realGermanOneDoctorFixture));

    // Derived from the committed real HCI sample: the per-row prescribers are
    // unified to one doctor and the document-level provider block, left empty in
    // the template, is filled (synthetic placeholder GLN) because revision 3
    // requires HcPerson.Gln and HcOrg.
    expect(value.HcPerson).toEqual({ Gln: '7600000000000', FName: 'Example', LName: 'Karl' });
    expect(value.HcOrg).toEqual({
      Name: 'Praxis Dr. Example Karl',
      Street: 'Hauptstrasse 1',
      Zip: '8355',
      City: 'Wängi',
    });
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
      Unit: 'Stück',
      AppInstr: 'bei Bedarf',
      Pos: [{ D: [1, 0, 0, 0] }],
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

    expect(result.warnings.map((warning) => warning.code)).toEqual(['empty-string']);
    expect(result.value.Medicaments?.[0]).toEqual({
      Id: 'Ibu 400 mg',
      IdType: 1,
      AppInstr: 'bei Bedarf',
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
    expect(medicament?.AppInstr).toBeUndefined();
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
      Unit: 'Stück',
      AppInstr: 'bei Bedarf',
      Pos: [{ D: [1, 0, 0, 0] }],
    });
  });

  it('reads "-" as an empty dose cell, an omitted unit and no end date', () => {
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
      Pos: [{ D: [2, 0, 0, 0] }],
    });
  });

  it('keeps "-" rows without a dose vector out of Pos', () => {
    const { value } = expectSuccess(
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
      AppInstr: 'bei Bedarf',
    });
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
      { Id: 'Ramipril 5 mg', IdType: 1, Unit: 'Stück', AppInstr: 'morgens', Pos: [{ D: [1, 0, 0, 0] }] },
      { Id: 'Ibuprofen 400 mg', IdType: 1, Unit: 'Stück', Pos: [{ DtTo: '2026-10-05', D: [0, 0, 0, 2] }] },
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
