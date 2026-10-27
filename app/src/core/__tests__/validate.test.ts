import { describe, expect, it } from 'vitest';

import { schemaDefs } from '../schema';
import { validateJsonText, validateObject } from '../validate';
import type { ValidationResult } from '../validate';

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObj(value: unknown): Obj {
  if (!isObj(value)) {
    throw new Error('expected an object');
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function medicaments(root: Obj): Obj[] {
  const value = root.Medicaments;
  if (!Array.isArray(value)) {
    throw new Error('Medicaments missing');
  }
  return value.map(asObj);
}

function errorsAt(result: ValidationResult, instancePath: string): ValidationResult['errors'] {
  return result.errors.filter((error) => error.instancePath === instancePath);
}

function warningPaths(result: ValidationResult): string[] {
  return result.warnings.map((warning) => warning.path);
}

function warningCodes(result: ValidationResult): string[] {
  return result.warnings.map((warning) => warning.code);
}

/**
 * The only fenced JSON block of the specification
 * (`chmed16a/README.md:1364-1538`), byte-for-byte.
 */
const officialExampleText = `{
  "Auth": "7601003178999",
  "Dt": "2016-09-12T11:46:09+02:00",
  "Id": "26d3dff7-ab05-4737-a49c-5eccd33595f6",
  "MedType": 1,
  "Medicaments": [
    {
      "Id": "971867",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            0,
            0,
            0,
            0
          ],
          "DtFrom": "2016-09-12"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Akne",
      "Unit": "STK"
    },
    {
      "Id": "4461382",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            0,
            1,
            0,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Blutverdünnung",
      "Unit": "STK"
    },
    {
      "Id": "2355687",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            1,
            0,
            1,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Bluthochdruck/Herz",
      "Unit": "STK"
    },
    {
      "Id": "1426310",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            0,
            0,
            1,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Cholesterinsenker",
      "Unit": "STK"
    },
    {
      "Id": "809693",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            1,
            0,
            0,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Bluthochdruck/Wasser",
      "Unit": "STK"
    },
    {
      "Id": "1551274",
      "IdType": 3,
      "Pos": [
        {
          "D": [
            1,
            0,
            0,
            0
          ],
          "DtFrom": "2016-02-10"
        }
      ],
      "Roa": "PO",
      "TkgRsn": "Bluthochdruck/Wasser",
      "Unit": "STK"
    }
  ],
  "Patient": {
    "BDt": "1981-01-12",
    "City": "Bern",
    "FName": "Maxima",
    "Gender": 2,
    "LName": "Matter",
    "Lng": "DE",
    "Med": {
      "DLstMen": "",
      "Meas": [
        {
          "Type": 1,
          "Unit": 2,
          "Val": "53"
        },
        {
          "Type": 2,
          "Unit": 1,
          "Val": "158"
        }
      ],
      "Rc": [
        {
          "Id": 1,
          "R": [
            577
          ]
        },
        {
          "Id": 2
        },
        {
          "Id": 3,
          "R": [
            612
          ]
        },
        {
          "Id": 4
        },
        {
          "Id": 5
        },
        {
          "Id": 6,
          "R": [
            555,
            571
          ]
        }
      ]
    },
    "Phone": "+4158 851 2600",
    "Street": "Untermattweg 8",
    "Zip": "3027"
  },
  "Rmk": ""
}`;

const officialExample = JSON.parse(officialExampleText) as Obj;

/** Minimal revision 2/3 prescription; `rev` omitted means revision 1. */
function rxExample(rev?: number): Obj {
  const root: Obj = {
    MedType: 3,
    Id: '26d3dff7-ab05-4737-a49c-5eccd33595f6',
    Auth: '7601003178999',
    Dt: '2026-04-01T10:00:00+02:00',
    Patient: { FName: 'Maxima', LName: 'Matter', BDt: '1981-01-12' },
    Medicaments: [{ Id: '971867', IdType: 3, Pos: [{ D: [1, 0, 0, 0] }] }],
  };
  if (rev !== undefined) {
    root.rev = rev;
  }
  if (rev !== undefined && rev >= 2) {
    root.HcPerson = { Gln: '7601003178999', FName: 'Anna', LName: 'Arzt' };
    root.HcOrg = { Name: 'Praxis', Street: 'Hauptstrasse 1', Zip: '3000', City: 'Bern' };
  }
  return root;
}

describe('official example (chmed16a/README.md:1364-1538)', () => {
  it('is valid without a single error', () => {
    const result = validateJsonText(officialExampleText);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('only warns about its own quirks (Lng casing, empty optionals)', () => {
    const result = validateJsonText(officialExampleText);

    expect(result.warnings).toHaveLength(3);
    expect(warningCodes(result)).toEqual(
      expect.arrayContaining(['lng-case', 'empty-string', 'empty-string']),
    );
    expect(warningPaths(result)).toEqual(
      expect.arrayContaining(['/Patient/Lng', '/Rmk', '/Patient/Med/DLstMen']),
    );
  });

  it('accepts the external allergy codes 555/571 of risk category 6', () => {
    const result = validateObject(officialExample);

    expect(warningCodes(result)).not.toContain('risk-id');
  });
});

describe('JSON syntax errors', () => {
  it('reports 1-based line and column for `{a:}`', () => {
    const result = validateJsonText('{a:}');

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0];
    expect(error?.keyword).toBe('json-syntax');
    expect(error?.params).toMatchObject({ line: 1, column: 2 });
    expect(error?.message).toContain('line 1, column 2');
  });

  it('counts lines for a multi-line document with a trailing comma', () => {
    const result = validateJsonText('{\n  "a": 1,\n}');

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.keyword).toBe('json-syntax');
    expect(result.errors[0]?.params).toMatchObject({ line: 3, column: 1 });
  });

  it('points at the end of the text for truncated input', () => {
    const result = validateJsonText('{"a": 1');

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.keyword).toBe('json-syntax');
    expect(result.errors[0]?.params.line).toBe(1);
  });

  it('rejects non-object roots', () => {
    expect(validateJsonText('[]').ok).toBe(false);
    expect(validateJsonText('null').ok).toBe(false);
    expect(validateObject(42).errors[0]?.keyword).toBe('type');
  });
});

describe('blocking errors: required fields and types', () => {
  it('flags a missing root `Dt`', () => {
    const root = clone(officialExample);
    delete root.Dt;

    const result = validateObject(root);
    const errors = errorsAt(result, '');

    expect(result.ok).toBe(false);
    expect(errors.some((error) => error.params.missingProperty === 'Dt')).toBe(true);
  });

  it('flags a missing `Patient`', () => {
    const root = clone(officialExample);
    delete root.Patient;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(
      errorsAt(result, '').some((error) => error.params.missingProperty === 'Patient'),
    ).toBe(true);
  });

  it('flags a missing `Medicaments[0].IdType` with the Ajv instancePath', () => {
    const root = clone(officialExample);
    const meds = medicaments(root);
    delete meds[0]?.IdType;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(
      errorsAt(result, '/Medicaments/0').some(
        (error) => error.params.missingProperty === 'IdType',
      ),
    ).toBe(true);
  });

  it('flags `MedType: 4` as an enum error', () => {
    const root = clone(officialExample);
    root.MedType = 4;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/MedType').some((error) => error.keyword === 'enum')).toBe(true);
  });

  it('does not coerce numbers/strings (MedType "1")', () => {
    const root = clone(officialExample);
    root.MedType = '1';

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/MedType').some((error) => error.keyword === 'type')).toBe(true);
  });

  it('flags a wrong primitive type for `Patient.Gender`', () => {
    const root = clone(officialExample);
    asObj(root.Patient).Gender = 'female';

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/Patient/Gender').some((error) => error.keyword === 'type')).toBe(
      true,
    );
  });

  it('flags 23A-only `Gender: 3` as an enum error', () => {
    const root = clone(officialExample);
    asObj(root.Patient).Gender = 3;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/Patient/Gender').some((error) => error.keyword === 'enum')).toBe(
      true,
    );
  });

  it('flags out-of-range enum values (Measurement.Unit, Medicament.IdType)', () => {
    const root = clone(officialExample);
    const med = asObj(asObj(root.Patient).Med);
    const measurements = med.Meas;
    if (!Array.isArray(measurements)) {
      throw new Error('Meas missing');
    }
    asObj(measurements[0]).Unit = 3;
    medicaments(root)[0]!.IdType = 5;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/Patient/Med/Meas/0/Unit').some((e) => e.keyword === 'enum')).toBe(
      true,
    );
    expect(errorsAt(result, '/Medicaments/0/IdType').some((e) => e.keyword === 'enum')).toBe(
      true,
    );
  });

  it('flags out-of-range PatientId.Type, Measurement.Type and RiskCategory.Id', () => {
    const root = clone(officialExample);
    const patient = asObj(root.Patient);
    patient.Ids = [{ Type: 2, Val: 'X123' }];
    const med = asObj(patient.Med);
    const measurements = med.Meas;
    const rc = med.Rc;
    if (!Array.isArray(measurements) || !Array.isArray(rc)) {
      throw new Error('MP sub-objects missing');
    }
    asObj(measurements[0]).Type = 3;
    asObj(rc[0]).Id = 8;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/Patient/Ids/0/Type').some((e) => e.keyword === 'enum')).toBe(true);
    expect(errorsAt(result, '/Patient/Med/Meas/0/Type').some((e) => e.keyword === 'enum')).toBe(
      true,
    );
    expect(errorsAt(result, '/Patient/Med/Rc/0/Id').some((e) => e.keyword === 'enum')).toBe(true);
  });
});

describe('context branching', () => {
  it('requires `Patient.Lng` for MP', () => {
    const root = clone(officialExample);
    delete asObj(root.Patient).Lng;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/Patient').some((e) => e.params.missingProperty === 'Lng')).toBe(
      true,
    );
  });

  it('requires patient names/birth date for PMC', () => {
    const root = clone(officialExample);
    root.MedType = 2;
    const patient = asObj(root.Patient);
    delete patient.FName;
    delete patient.LName;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    const missing = errorsAt(result, '/Patient').map((error) => error.params.missingProperty);
    expect(missing).toEqual(expect.arrayContaining(['FName', 'LName']));
  });

  it('treats MP-only fields as warnings for PMC', () => {
    const root = clone(officialExample);
    root.MedType = 2;

    const result = validateObject(root);

    const paths = warningPaths(result);
    expect(paths).toContain('/Patient/Lng');
    expect(paths).toContain('/Patient/Med');
    expect(paths).toContain('/Medicaments/0/Roa');
    expect(warningCodes(result)).toContain('context-field');
  });

  it('requires HcPerson/HcOrg from revision 2 on', () => {
    const root = rxExample(3);
    delete root.HcPerson;
    delete root.HcOrg;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    const missing = errorsAt(result, '').map((error) => error.params.missingProperty);
    expect(missing).toEqual(expect.arrayContaining(['HcPerson', 'HcOrg']));
  });

  it('requires patient identity for Rx', () => {
    const root = rxExample(3);
    const patient = asObj(root.Patient);
    delete patient.BDt;

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(errorsAt(result, '/Patient').some((e) => e.params.missingProperty === 'BDt')).toBe(
      true,
    );
  });

  it('validates a revision 2 prescription against rev2 rules', () => {
    const root = rxExample(2);
    const result = validateObject(root);

    expect(result).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it('validates a revision 3 prescription against rev3 rules', () => {
    const root = rxExample(3);
    medicaments(root)[0]!.IndC = '12345.67';

    const result = validateObject(root);

    expect(result).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it('is lenient and warns when `rev` is absent (rev1 assumed)', () => {
    const root = rxExample(1);
    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toContain('rev1-assumption');
    expect(warningPaths(result)).toContain('');
  });

  it('warns for an unknown revision >= 4 and validates as rev3', () => {
    const root = rxExample(4);
    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toContain('unknown-revision');
  });

  it('honours an explicit context override', () => {
    const root = clone(officialExample);
    root.MedType = 2;
    const patient = asObj(root.Patient);
    delete patient.FName;
    delete patient.LName;

    const result = validateObject(root, { medType: 2, rev: 1 });

    expect(result.ok).toBe(false);
    expect(
      errorsAt(result, '/Patient').some((error) => error.params.missingProperty === 'FName'),
    ).toBe(true);
  });
});

describe('warnings', () => {
  it('accepts unknown extra fields at root and in medicament', () => {
    const root = clone(officialExample);
    root.FutureField = 'x';
    medicaments(root)[0]!.FutureMedicamentField = 42;

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result).filter((code) => code === 'unknown-field')).toHaveLength(2);
    expect(warningPaths(result)).toContain('/FutureField');
    expect(warningPaths(result)).toContain('/Medicaments/0/FutureMedicamentField');
  });

  it("warns when IndC appears in MP ('-' context)", () => {
    const root = clone(officialExample);
    medicaments(root)[0]!.IndC = '12345.67';

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningPaths(result)).toContain('/Medicaments/0/IndC');
    expect(
      result.warnings.find((warning) => warning.path === '/Medicaments/0/IndC')?.code,
    ).toBe('context-field');
  });

  it('warns when IndC appears before revision 3', () => {
    const root = rxExample(2);
    medicaments(root)[0]!.IndC = '12345.67';

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toContain('indc-revision');
    expect(warningCodes(result)).not.toContain('context-field');
  });

  it('blocks a malformed IndC on revision 3', () => {
    const root = rxExample(3);
    medicaments(root)[0]!.IndC = '12.3';

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(
      errorsAt(result, '/Medicaments/0/IndC').some((error) => error.keyword === 'pattern'),
    ).toBe(true);
  });

  it('passes accents and emoji through untouched', () => {
    const root = clone(officialExample);
    asObj(root.Patient).FName = 'Müller–Sørensen';
    root.Rmk = 'Привет 👋🏽';

    const textResult = validateJsonText(JSON.stringify(root));

    expect(textResult.ok).toBe(true);
    expect(textResult.warnings.some((w) => w.path === '/Patient/FName')).toBe(false);
    expect(textResult.warnings.some((w) => w.path === '/Rmk')).toBe(false);
  });

  it('warns about non-table numeric risk ids (never errors)', () => {
    const root = clone(officialExample);
    const med = asObj(asObj(root.Patient).Med);
    const rc = med.Rc;
    if (!Array.isArray(rc)) {
      throw new Error('Rc missing');
    }
    asObj(rc[0]).R = [999];

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningPaths(result)).toContain('/Patient/Med/Rc/0/R/0');
  });

  it('accepts string risk ids (external codes) without warnings', () => {
    const root = clone(officialExample);
    const med = asObj(asObj(root.Patient).Med);
    const rc = med.Rc;
    if (!Array.isArray(rc)) {
      throw new Error('Rc missing');
    }
    asObj(rc[0]).R = ['CHA4711'];

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).not.toContain('risk-id');
  });

  it('accepts Measurement.Val as a number but warns (string by specification)', () => {
    const root = clone(officialExample);
    const med = asObj(asObj(root.Patient).Med);
    const measurements = med.Meas;
    if (!Array.isArray(measurements)) {
      throw new Error('Meas missing');
    }
    asObj(measurements[0]).Val = 53;

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningPaths(result)).toContain('/Patient/Med/Meas/0/Val');
    expect(warningCodes(result)).toContain('measurement-value');
  });

  it('warns when Measurement.Val is not parseable as a number', () => {
    const root = clone(officialExample);
    const med = asObj(asObj(root.Patient).Med);
    const measurements = med.Meas;
    if (!Array.isArray(measurements)) {
      throw new Error('Meas missing');
    }
    asObj(measurements[0]).Val = '53 kg';

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(
      result.warnings.filter(
        (warning) =>
          warning.code === 'measurement-value' && warning.path === '/Patient/Med/Meas/0/Val',
      ),
    ).toHaveLength(1);
  });

  it('warns about a type/unit pairing mismatch without blocking', () => {
    const root = clone(officialExample);
    const med = asObj(asObj(root.Patient).Med);
    const measurements = med.Meas;
    if (!Array.isArray(measurements)) {
      throw new Error('Meas missing');
    }
    asObj(measurements[0]).Unit = 1;

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningPaths(result)).toContain('/Patient/Med/Meas/0/Unit');
    expect(warningCodes(result)).toContain('measurement-unit');
  });

  it('warns when the D array has more than 4 entries', () => {
    const root = clone(officialExample);
    const pos = medicaments(root)[0]!.Pos;
    if (!Array.isArray(pos)) {
      throw new Error('Pos missing');
    }
    asObj(pos[0]).D = [1, 2, 3, 4, 5];

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toContain('doses-length');
  });

  it("warns about '-' context fields instead of rejecting them", () => {
    const root = rxExample(3);
    medicaments(root)[0]!.Rep = 6;
    const mp = clone(officialExample);
    medicaments(mp)[0]!.Rep = 6;

    expect(validateObject(root).ok).toBe(true);
    expect(warningCodes(validateObject(root))).not.toContain('context-field');

    expect(warningPaths(validateObject(mp))).toContain('/Medicaments/0/Rep');
    expect(validateObject(mp).ok).toBe(true);
  });
});

describe('private fields and PSchema', () => {
  it('ignores pFields and warns when PSchema is absent', () => {
    const root = clone(officialExample);
    root.PFields = [{ Val: 'nothing' }];

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).toContain('pfields-ignored');
    expect(warningPaths(result)).toContain('/PFields');
  });

  it('ignores pFields when PSchema is an empty string', () => {
    const root = clone(officialExample);
    root.PSchema = '';
    root.PFields = [{ Val: 'nothing' }];

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningPaths(result)).toContain('/PFields');
  });

  it('requires Nm when PSchema is set', () => {
    const root = clone(officialExample);
    root.PSchema = '{"version":1}';
    root.PFields = [{ Val: 'nothing' }];

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(
      errorsAt(result, '/PFields/0').some((error) => error.params.missingProperty === 'Nm'),
    ).toBe(true);
  });

  it('accepts complete private fields when PSchema is set', () => {
    const root = clone(officialExample);
    root.PSchema = '{"version":1}';
    root.PFields = [{ Nm: 'colour', Val: 'blue', PFields: [{ Nm: 'shade' }] }];

    const result = validateObject(root);

    expect(result.ok).toBe(true);
    expect(warningCodes(result)).not.toContain('pfields-ignored');
  });
});

describe('Rx specifics', () => {
  it('accepts a uuid-style medicament id', () => {
    const root = rxExample(3);
    medicaments(root)[0]!.Id = '26d3dff7-ab05-4737-a49c-5eccd33595f6';

    const result = validateObject(root);

    expect(result.ok).toBe(true);
  });

  it('blocks an Auth GLN that differs from HcPerson.Gln', () => {
    const root = rxExample(3);
    asObj(root.HcPerson).Gln = '7601003178000';

    const result = validateObject(root);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.keyword === 'gln-mismatch')).toBe(true);
    expect(errorsAt(result, '/Auth')).toHaveLength(1);
  });

  it('allows the literal author "patient" (no GLN)', () => {
    const root = rxExample(3);
    root.Auth = 'patient';

    const result = validateObject(root);

    expect(result.ok).toBe(true);
  });
});

describe('schema documents', () => {
  it('never rejects unknown fields at any level', () => {
    for (const [name, definition] of Object.entries(schemaDefs)) {
      expect(name).not.toBe('');
      expect(definition.additionalProperties).toBe(true);
    }
  });
});
