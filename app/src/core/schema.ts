/**
 * Hand-written JSON Schema (draft 2020-12) for the CHMED16A JSON object model,
 * plus the context selectors used to pick the right subschema.
 *
 * Strategy (see `plan/in-progress/001-chmed16a-tools.md`, "JSON Schema strategy"):
 * - one root document per context: `MedType` 1 (MP), 2 (PMC) and 3 (Rx), where
 *   Rx is further narrowed by `rev` (absent = 1, 2, 3, >=4 validated as 3);
 * - `additionalProperties: true` everywhere: unknown fields MUST be ignored for
 *   forward compatibility (`README.md:49-53`, `chmed16a/prescription.md:49-52`);
 * - the schema only enforces required fields, primitive types, enums and the
 *   `IndC` format; everything the plan classifies as non-blocking (unknown
 *   fields, `-`-context fields, `Lng` casing, risk ids, empty optionals,
 *   measurement value/pairing, `D` length, ignored private fields) is reported
 *   as a warning by `validate.ts`.
 *
 * This module is framework-free: it only imports types, never UI/codec code.
 */

import type { MedType } from './types';

/** A JSON Schema fragment. Deliberately loose: schemas are data, not types. */
export type JsonSchema = Record<string, unknown>;

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** Context used to select the active schema. */
export interface ValidationContext {
  medType: MedType;
  /** Rx revision (`chmed16a/prescription.md:225-233`). Ignored for MP/PMC. */
  rev: number;
}

const OBJECT_TYPE = 'object' as const;
const ARRAY_TYPE = 'array' as const;

function ref(name: string): JsonSchema {
  return { $ref: `#/$defs/${name}` };
}

function arrayOf(schema: JsonSchema): JsonSchema {
  return { type: ARRAY_TYPE, items: schema };
}

/**
 * All objects are open: unknown fields must never be rejected.
 * `required` is only emitted when non-empty to keep the documents readable.
 */
function objectSchema(
  properties: Record<string, JsonSchema>,
  required: readonly string[] = [],
): JsonSchema {
  return {
    type: OBJECT_TYPE,
    ...(required.length > 0 ? { required: [...required] } : {}),
    properties,
    additionalProperties: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Shared `$defs`                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `chmed16a/README.md:1318-1360`.
 *
 * `Nm` is required by the specification, but *only* when `PSchema` is set:
 * "When empty or not specified, all private fields must be ignored."
 * (`chmed16a/README.md:382`). The requirement is enforced semantically in
 * `validate.ts`, otherwise ignored private fields would still raise errors.
 */
const privateFieldDef = objectSchema({
  Nm: { type: 'string' },
  Val: { type: 'string' },
  PFields: arrayOf(ref('privateField')),
});

/** `chmed16a/README.md:574-614` */
const patientIdDef = objectSchema(
  {
    Type: { type: 'integer', enum: [1] },
    Val: { type: 'string' },
  },
  ['Type', 'Val'],
);

/** `chmed16a/README.md:707-758` — `Val` is a STRING (e.g. `"53"`). */
const measurementDef = objectSchema(
  {
    Type: { type: 'integer', enum: [1, 2] },
    // Spec-tolerant: a numeric value is accepted and reported as a warning by
    // `validate.ts` instead of blocking the document.
    Val: { type: ['string', 'number'] },
    Unit: { type: 'integer', enum: [1, 2] },
  },
  ['Type', 'Val', 'Unit'],
);

/**
 * `chmed16a/README.md:759-923`.
 *
 * `R` entries are `number | string`: RC 6 uses external CDSCODE codes and the
 * official example itself contains 555/571, which are not in the numeric table.
 * Table membership is therefore a warning, never an error.
 */
const riskCategoryDef = objectSchema(
  {
    Id: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7] },
    R: arrayOf({ type: ['number', 'string'] }),
  },
  ['Id'],
);

/** `chmed16a/README.md:1187-1266` — MP only. */
const takingTimeDef = objectSchema(
  {
    Off: { type: 'number' },
    Du: { type: 'number' },
    DoFrom: { type: 'number' },
    DoTo: { type: 'number' },
    A: { type: 'number' },
    MA: { type: 'number' },
  },
  ['Off'],
);

/** `chmed16a/README.md:1267-1317` — PMC only. */
const recommendationDef = objectSchema(
  {
    Id: { type: 'string' },
    PatAgr: { type: 'integer', enum: [0, 1] },
    Rmk: { type: 'string' },
  },
  ['Id'],
);

/** `chmed16a/README.md:615-706` — MP only. */
const medicalDataDef = objectSchema({
  DLstMen: { type: 'string' },
  Prem: { type: 'integer', enum: [0, 1] },
  ToG: { type: 'string' },
  Rc: arrayOf(ref('riskCategory')),
  Meas: arrayOf(ref('measurement')),
  PFields: arrayOf(ref('privateField')),
});

/** `chmed16a/README.md:1087-1186` (MP). */
const posologyMpDef = objectSchema(
  {
    DtFrom: { type: 'string' },
    DtTo: { type: 'string' },
    CyDu: { type: 'number' },
    InRes: { type: 'integer', enum: [0, 1] },
    D: arrayOf({ type: 'number' }),
    TT: arrayOf(ref('takingTime')),
  },
  ['DtFrom'],
);

/** `chmed16a/README.md:1087-1186` (PMC: no `CyDu`/`InRes`/`TT`). */
const posologyPmcDef = objectSchema(
  {
    DtFrom: { type: 'string' },
    DtTo: { type: 'string' },
    D: arrayOf({ type: 'number' }),
  },
  ['DtFrom'],
);

/** `chmed16a/prescription.md:682-719` (Rx: only `DtTo` and `D`). */
const posologyRxDef = objectSchema({
  DtTo: { type: 'string' },
  D: arrayOf({ type: 'number' }),
});

/**
 * `chmed16a/README.md:925-1086` (MP).
 *
 * `AutoMed` is marked required by the table (`chmed16a/README.md:1010-1022`)
 * but is missing from every medicament of the official example
 * (`chmed16a/README.md:1364-1538`), which P2 requires to validate without
 * errors. It is therefore accepted as optional and never reported.
 */
const medicamentMpDef = objectSchema(
  {
    Id: { type: 'string' },
    IdType: { type: 'integer', enum: [1, 2, 3, 4] },
    Pos: arrayOf(ref('posologyMp')),
    Unit: { type: 'string' },
    TkgRsn: { type: 'string' },
    AppInstr: { type: 'string' },
    AutoMed: { type: 'integer', enum: [0, 1] },
    PrscbBy: { type: 'string' },
    Roa: { type: 'string' },
    PFields: arrayOf(ref('privateField')),
  },
  ['Id', 'IdType', 'Unit'],
);

/** `chmed16a/README.md:925-1086` (PMC: no `PrscbBy`/`Roa`, `Unit` optional). */
const medicamentPmcDef = objectSchema(
  {
    Id: { type: 'string' },
    IdType: { type: 'integer', enum: [1, 2, 3, 4] },
    Pos: arrayOf(ref('posologyPmc')),
    Unit: { type: 'string' },
    TkgRsn: { type: 'string' },
    AppInstr: { type: 'string' },
    AutoMed: { type: 'integer', enum: [0, 1] },
    PFields: arrayOf(ref('privateField')),
  },
  ['Id', 'IdType'],
);

/** `chmed16a/prescription.md:563-680` (Rx). `IndC` only exists since rev 3. */
function rxMedicamentDef(rev: number): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    Id: { type: 'string' },
    IdType: { type: 'integer', enum: [1, 2, 3, 4] },
    Pos: arrayOf(ref('posologyRx')),
    Unit: { type: 'string' },
    AppInstr: { type: 'string' },
    Rep: { type: 'integer' },
    Subs: { type: 'integer', enum: [0, 1] },
    NbPack: { type: 'integer' },
    PFields: arrayOf(ref('privateField')),
  };
  if (rev >= 3) {
    // `chmed16a/prescription.md:670-679`: string(8), format `00000.00`.
    properties.IndC = { type: 'string', maxLength: 8, pattern: '^\\d{5}\\.\\d{2}$' };
  }
  return objectSchema(properties, ['Id', 'IdType']);
}

/** `chmed16a/README.md:402-573` (MP: `Lng` required, `Med` allowed). */
const patientMpDef = objectSchema(
  {
    FName: { type: 'string' },
    LName: { type: 'string' },
    BDt: { type: 'string' },
    Gender: { type: 'integer', enum: [1, 2] },
    Street: { type: 'string' },
    Zip: { type: 'string' },
    City: { type: 'string' },
    Lng: { type: 'string' },
    Phone: { type: 'string' },
    Email: { type: 'string' },
    Ids: arrayOf(ref('patientId')),
    PFields: arrayOf(ref('privateField')),
    Med: ref('medicalData'),
  },
  ['Lng'],
);

/** `chmed16a/README.md:402-573` (PMC: names + birth date required, no `Lng`). */
const patientPmcDef = objectSchema(
  {
    FName: { type: 'string' },
    LName: { type: 'string' },
    BDt: { type: 'string' },
    Gender: { type: 'integer', enum: [1, 2] },
    Street: { type: 'string' },
    Zip: { type: 'string' },
    City: { type: 'string' },
    Phone: { type: 'string' },
    Email: { type: 'string' },
    Ids: arrayOf(ref('patientId')),
    PFields: arrayOf(ref('privateField')),
  },
  ['FName', 'LName', 'BDt'],
);

/** `chmed16a/prescription.md:394-523` (Rx: names + birth date required). */
const patientRxDef = objectSchema(
  {
    FName: { type: 'string' },
    LName: { type: 'string' },
    BDt: { type: 'string' },
    Gender: { type: 'integer', enum: [1, 2] },
    Street: { type: 'string' },
    Zip: { type: 'string' },
    City: { type: 'string' },
    Phone: { type: 'string' },
    Email: { type: 'string' },
    Rcv: { type: 'string' },
    Ids: arrayOf(ref('patientId')),
    PFields: arrayOf(ref('privateField')),
  },
  ['FName', 'LName', 'BDt'],
);

/** `chmed16a/prescription.md:761-804` (Rx since revision 2). */
const hcPersonDef = objectSchema(
  {
    Gln: { type: 'string', maxLength: 13 },
    FName: { type: 'string' },
    LName: { type: 'string' },
    Zsr: { type: 'string', maxLength: 7 },
  },
  ['Gln', 'FName', 'LName'],
);

/** `chmed16a/prescription.md:806-894` (Rx since revision 2). */
const hcOrgDef = objectSchema(
  {
    Name: { type: 'string' },
    NameAffix: { type: 'string' },
    Street: { type: 'string' },
    Zip: { type: 'string' },
    City: { type: 'string' },
    Country: { type: 'string', maxLength: 2 },
    Zsr: { type: 'string', maxLength: 7 },
    Phone: { type: 'string' },
    Email: { type: 'string' },
  },
  ['Name', 'Street', 'Zip', 'City'],
);

/** Every definition, for inspection/tests. */
export const schemaDefs: Readonly<Record<string, JsonSchema>> = {
  privateField: privateFieldDef,
  patientId: patientIdDef,
  measurement: measurementDef,
  riskCategory: riskCategoryDef,
  takingTime: takingTimeDef,
  recommendation: recommendationDef,
  medicalData: medicalDataDef,
  posologyMp: posologyMpDef,
  posologyPmc: posologyPmcDef,
  posologyRx: posologyRxDef,
  medicamentMp: medicamentMpDef,
  medicamentPmc: medicamentPmcDef,
  medicamentRx: rxMedicamentDef(3),
  patientMp: patientMpDef,
  patientPmc: patientPmcDef,
  patientRx: patientRxDef,
  hcPerson: hcPersonDef,
  hcOrg: hcOrgDef,
};

function pickDefs(names: readonly string[]): Record<string, JsonSchema> {
  const picked: Record<string, JsonSchema> = {};
  for (const name of names) {
    const def = schemaDefs[name];
    if (def !== undefined) {
      picked[name] = def;
    }
  }
  return picked;
}

function documentWith(
  id: string,
  root: JsonSchema,
  defs: Record<string, JsonSchema>,
): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: `https://chmed16a.tools/schema/${id}.json`,
    ...root,
    $defs: defs,
  };
}

/* -------------------------------------------------------------------------- */
/* Context roots                                                              */
/* -------------------------------------------------------------------------- */

/** Fields every medication object requires (`chmed16a/README.md:207-400`). */
const ROOT_REQUIRED = ['Patient', 'MedType', 'Id', 'Auth', 'Dt'] as const;

const ROOT_PROPERTIES: Record<string, JsonSchema> = {
  Id: { type: 'string' },
  Auth: { type: 'string' },
  Zsr: { type: 'string' },
  Dt: { type: 'string' },
  Rmk: { type: 'string' },
  ValBy: { type: 'string' },
  ValDt: { type: 'string' },
  PSchema: { type: 'string' },
  PFields: arrayOf(ref('privateField')),
};

const MP_DEFS = [
  'privateField',
  'patientId',
  'measurement',
  'riskCategory',
  'takingTime',
  'medicalData',
  'posologyMp',
  'medicamentMp',
  'patientMp',
] as const;

const PMC_DEFS = [
  'privateField',
  'patientId',
  'posologyPmc',
  'medicamentPmc',
  'patientPmc',
  'recommendation',
] as const;

const RX_DEFS = [
  'privateField',
  'patientId',
  'posologyRx',
  'medicamentRx',
  'patientRx',
  'hcPerson',
  'hcOrg',
] as const;

/** `MedType: 1` (MedicationPlan). */
export const medicationMpSchema: JsonSchema = documentWith(
  'medication-mp',
  objectSchema(
    {
      ...ROOT_PROPERTIES,
      MedType: { type: 'integer', enum: [1] },
      Patient: ref('patientMp'),
      Medicaments: arrayOf(ref('medicamentMp')),
    },
    ROOT_REQUIRED,
  ),
  pickDefs(MP_DEFS),
);

/** `MedType: 2` (PolymedicationCheck). */
export const medicationPmcSchema: JsonSchema = documentWith(
  'medication-pmc',
  objectSchema(
    {
      ...ROOT_PROPERTIES,
      MedType: { type: 'integer', enum: [2] },
      Patient: ref('patientPmc'),
      Medicaments: arrayOf(ref('medicamentPmc')),
      Recoms: arrayOf(ref('recommendation')),
    },
    ROOT_REQUIRED,
  ),
  pickDefs(PMC_DEFS),
);

/**
 * `MedType: 3` (Rx). Revisions are additive narrowing
 * (`chmed16a/prescription.md:54-70`): rev 2 adds `HcPerson`/`HcOrg`, rev 3 adds
 * the optional `Medicament.IndC` (with its format constraint).
 */
export function rxSchemaForRevision(rev: number): JsonSchema {
  const effective = effectiveRxRevision(rev);
  const required: string[] = [...ROOT_REQUIRED];
  if (effective >= 2) {
    required.push('HcPerson', 'HcOrg');
  }
  return documentWith(
    `medication-rx-rev${effective}`,
    objectSchema(
      {
        ...ROOT_PROPERTIES,
        Auth: { type: 'string', maxLength: 13 },
        Zsr: { type: 'string', maxLength: 7 },
        rev: { type: 'integer', minimum: 1 },
        MedType: { type: 'integer', enum: [3] },
        Patient: ref('patientRx'),
        Medicaments: arrayOf(ref('medicamentRx')),
        HcPerson: ref('hcPerson'),
        HcOrg: ref('hcOrg'),
      },
      required,
    ),
    {
      ...pickDefs(RX_DEFS),
      medicamentRx: rxMedicamentDef(effective),
    },
  );
}

/** Revision 1 is the most permissive Rx form (tables absent in this repo). */
export const medicationRxRev1Schema: JsonSchema = rxSchemaForRevision(1);
/** Revision 2 = revision 3 minus `IndC`. */
export const medicationRxRev2Schema: JsonSchema = rxSchemaForRevision(2);
/** Revision 3 (current). */
export const medicationRxRev3Schema: JsonSchema = rxSchemaForRevision(3);

/** Fallback schema when `MedType` is absent or outside 1..3. */
export const medicationBaseSchema: JsonSchema = documentWith(
  'medication-base',
  objectSchema(
    {
      MedType: { type: 'integer', enum: [1, 2, 3] },
      Patient: { type: OBJECT_TYPE },
      Id: { type: 'string' },
      Auth: { type: 'string' },
      Dt: { type: 'string' },
      Medicaments: { type: ARRAY_TYPE },
    },
    ROOT_REQUIRED,
  ),
  {},
);

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Clamps a raw `rev` to the revision whose rules are applied. Unknown revisions
 * (>= 4) are validated as revision 3; the warning is emitted by `validate.ts`.
 */
export function effectiveRxRevision(rev: number | undefined): 1 | 2 | 3 {
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 2) {
    return 1;
  }
  return rev >= 3 ? 3 : 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Derives the validation context from a parsed medication object.
 * Returns `null` when `MedType` is missing or not 1|2|3 (the base schema then
 * reports the enum error).
 */
export function contextFor(root: unknown): ValidationContext | null {
  if (!isRecord(root)) {
    return null;
  }
  const medType = root.MedType;
  if (medType !== 1 && medType !== 2 && medType !== 3) {
    return null;
  }
  const rawRev = root.rev;
  const rev = typeof rawRev === 'number' && Number.isInteger(rawRev) && rawRev >= 1 ? rawRev : 1;
  return { medType, rev };
}

/** Returns the complete schema document for a context. */
export function schemaForContext(context: ValidationContext): JsonSchema {
  switch (context.medType) {
    case 1:
      return medicationMpSchema;
    case 2:
      return medicationPmcSchema;
    case 3:
      return rxSchemaForRevision(context.rev);
  }
}
