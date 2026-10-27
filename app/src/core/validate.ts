/**
 * Framework-free CHMED16A validation entry points.
 *
 * Blocking (`ok: false`) findings are missing required fields, wrong primitive
 * types, out-of-range enum values, malformed `IndC` and `Auth`/`HcPerson.Gln`
 * mismatches. Everything the plan classifies as spec-tolerant (unknown fields,
 * `-`-context fields, `Lng` casing, non-table risk ids, empty optionals,
 * measurement value/pairing, `D` length, ignored private fields) is reported as
 * a non-blocking warning.
 *
 * Ajv is configured with `{ allErrors: true, strict: false, coerceTypes: false }`
 * so the input is never coerced and every error is collected.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';

import {
  contextFor,
  effectiveRxRevision,
  medicationBaseSchema,
  schemaForContext,
} from './schema';
import type { ValidationContext } from './schema';

export type { ValidationContext } from './schema';

/** A blocking finding, shaped after Ajv's `ErrorObject`. */
export interface ValidationError {
  /** JSON Pointer into the document, e.g. `/Medicaments/0/IdType`. */
  instancePath: string;
  /** JSON Schema keyword that failed (`required`, `type`, `enum`, ...). */
  keyword: string;
  message: string;
  params: Record<string, unknown>;
}

/** Non-blocking finding. `path` is a JSON Pointer into the document. */
export interface ValidationWarning {
  code: WarningCode;
  path: string;
  message: string;
}

export type WarningCode =
  | 'unknown-field'
  | 'context-field'
  | 'lng-case'
  | 'risk-id'
  | 'empty-string'
  | 'measurement-value'
  | 'measurement-unit'
  | 'doses-length'
  | 'pfields-ignored'
  | 'rev1-assumption'
  | 'unknown-revision'
  | 'indc-revision';

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/** Result of parsing JSON text: the value, or one blocking `json-syntax` error. */
export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: ValidationError };

/* -------------------------------------------------------------------------- */
/* Ajv setup                                                                  */
/* -------------------------------------------------------------------------- */

const ajv = new Ajv2020({ allErrors: true, strict: false, coerceTypes: false });

const validators = new Map<string, ValidateFunction>();

function validatorFor(context: ValidationContext | null): ValidateFunction {
  const key =
    context === null
      ? 'base'
      : `${context.medType}:${context.medType === 3 ? effectiveRxRevision(context.rev) : 0}`;
  const cached = validators.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const schema = context === null ? medicationBaseSchema : schemaForContext(context);
  const validate = ajv.compile(schema);
  validators.set(key, validate);
  return validate;
}

function toValidationError(error: ErrorObject): ValidationError {
  return {
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message ?? 'Invalid value.',
    params: error.params,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses JSON text, reporting a syntax error as a blocking `json-syntax`
 * finding with 1-based `params.line` / `params.column`.
 *
 * This is the single source of truth for JSON line/column reporting: the
 * validator and the CHMED decoder both use it.
 */
export function parseJsonText(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: jsonSyntaxError(text, error) };
  }
}

/**
 * Parses and validates a JSON document.
 *
 * A JSON syntax error is reported as the single blocking error with keyword
 * `json-syntax`; `params.line` / `params.column` are 1-based. The offset is read
 * from the V8 error message (`... at position N ...`) and converted to
 * line/column by scanning the text, so the numbers do not depend on how the
 * engine formats its own `(line X column Y)` suffix. When no offset is
 * available (e.g. "Unexpected end of JSON input"), the end of the text is
 * reported.
 */
export function validateJsonText(text: string): ValidationResult {
  const parsed = parseJsonText(text);
  if (!parsed.ok) {
    return { ok: false, errors: [parsed.error], warnings: [] };
  }
  return validateObject(parsed.value);
}

/**
 * Validates an already parsed value.
 *
 * @param object  Parsed JSON value; must be an object.
 * @param context Optional override; by default derived from `MedType`/`rev`.
 */
export function validateObject(
  object: unknown,
  context?: ValidationContext,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!isRecord(object)) {
    return {
      ok: false,
      errors: [
        {
          instancePath: '',
          keyword: 'type',
          message: 'The CHMED16A document must be a JSON object.',
          params: { type: 'object' },
        },
      ],
      warnings,
    };
  }

  const resolved = context ?? contextFor(object);
  const validate = validatorFor(resolved);
  if (!validate(object)) {
    for (const error of validate.errors ?? []) {
      errors.push(toValidationError(error));
    }
  }

  collectWarnings(object, resolved, errors, warnings);

  return { ok: errors.length === 0, errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* JSON syntax errors                                                         */
/* -------------------------------------------------------------------------- */

const POSITION_PATTERN = /at position (\d+)/;

function jsonSyntaxError(text: string, error: unknown): ValidationError {
  const message = error instanceof Error ? error.message : String(error);
  const match = POSITION_PATTERN.exec(message);
  const rawPosition = match?.[1] === undefined ? null : Number(match[1]);
  const position = rawPosition === null ? text.length : Math.min(rawPosition, text.length);
  const { line, column } = offsetToLineColumn(text, position);

  return {
    instancePath: '',
    keyword: 'json-syntax',
    message: `Invalid JSON at line ${line}, column ${column}: ${message}`,
    params: { line, column, position: rawPosition },
  };
}

/** 1-based line/column for a 0-based character offset. */
function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/* -------------------------------------------------------------------------- */
/* Warning collection                                                         */
/* -------------------------------------------------------------------------- */

const ROOT_KNOWN = [
  'Patient',
  'Medicaments',
  'Recoms',
  'MedType',
  'Id',
  'Auth',
  'Zsr',
  'Dt',
  'Rmk',
  'ValBy',
  'ValDt',
  'PSchema',
  'PFields',
  'rev',
  'HcPerson',
  'HcOrg',
] as const;

const ROOT_ALLOWED_MP = [
  'Patient',
  'Medicaments',
  'MedType',
  'Id',
  'Auth',
  'Dt',
  'Rmk',
  'ValBy',
  'ValDt',
  'PSchema',
  'PFields',
] as const;

const ROOT_ALLOWED_PMC = [
  'Patient',
  'Medicaments',
  'Recoms',
  'MedType',
  'Id',
  'Auth',
  'Dt',
  'ValBy',
  'ValDt',
  'PSchema',
  'PFields',
] as const;

const ROOT_ALLOWED_RX = [
  'Patient',
  'Medicaments',
  'MedType',
  'Id',
  'Auth',
  'Zsr',
  'Dt',
  'Rmk',
  'PSchema',
  'PFields',
  'rev',
  'HcPerson',
  'HcOrg',
] as const;

const PATIENT_KNOWN = [
  'FName',
  'LName',
  'BDt',
  'Gender',
  'Street',
  'Zip',
  'City',
  'Lng',
  'Phone',
  'Email',
  'Rcv',
  'Ids',
  'PFields',
  'Med',
] as const;

const PATIENT_ALLOWED_MP = [
  'FName',
  'LName',
  'BDt',
  'Gender',
  'Street',
  'Zip',
  'City',
  'Lng',
  'Phone',
  'Email',
  'Ids',
  'PFields',
  'Med',
] as const;

const PATIENT_ALLOWED_PMC = [
  'FName',
  'LName',
  'BDt',
  'Gender',
  'Street',
  'Zip',
  'City',
  'Phone',
  'Email',
  'Ids',
  'PFields',
] as const;

const PATIENT_ALLOWED_RX = [
  'FName',
  'LName',
  'BDt',
  'Gender',
  'Street',
  'Zip',
  'City',
  'Phone',
  'Email',
  'Rcv',
  'Ids',
  'PFields',
] as const;

const MEDICAMENT_KNOWN = [
  'Id',
  'IdType',
  'Pos',
  'Unit',
  'TkgRsn',
  'AppInstr',
  'AutoMed',
  'PrscbBy',
  'Roa',
  'Rep',
  'Subs',
  'NbPack',
  'PFields',
  'IndC',
] as const;

const MEDICAMENT_ALLOWED_MP = [
  'Id',
  'IdType',
  'Pos',
  'Unit',
  'TkgRsn',
  'AppInstr',
  'AutoMed',
  'PrscbBy',
  'Roa',
  'PFields',
] as const;

const MEDICAMENT_ALLOWED_PMC = [
  'Id',
  'IdType',
  'Pos',
  'Unit',
  'TkgRsn',
  'AppInstr',
  'AutoMed',
  'PFields',
] as const;

const MEDICAMENT_ALLOWED_RX = [
  'Id',
  'IdType',
  'Pos',
  'Unit',
  'AppInstr',
  'Rep',
  'Subs',
  'NbPack',
  'PFields',
  // Since revision 3; older revisions get the `indc-revision` warning instead
  // of a misleading "not used by MedType 3" message.
  'IndC',
] as const;

const POSOLOGY_KNOWN = ['DtFrom', 'DtTo', 'CyDu', 'InRes', 'D', 'TT'] as const;
const POSOLOGY_ALLOWED_MP = POSOLOGY_KNOWN;
const POSOLOGY_ALLOWED_PMC = ['DtFrom', 'DtTo', 'D'] as const;
const POSOLOGY_ALLOWED_RX = ['DtTo', 'D'] as const;

const MEDICAL_DATA_KNOWN = ['DLstMen', 'Prem', 'ToG', 'Rc', 'Meas', 'PFields'] as const;
const TAKING_TIME_KNOWN = ['Off', 'Du', 'DoFrom', 'DoTo', 'A', 'MA'] as const;
const RECOMMENDATION_KNOWN = ['Id', 'PatAgr', 'Rmk'] as const;
const PATIENT_ID_KNOWN = ['Type', 'Val'] as const;
const MEASUREMENT_KNOWN = ['Type', 'Val', 'Unit'] as const;
const RISK_CATEGORY_KNOWN = ['Id', 'R'] as const;
const HC_PERSON_KNOWN = ['Gln', 'FName', 'LName', 'Zsr'] as const;
const HC_ORG_KNOWN = [
  'Name',
  'NameAffix',
  'Street',
  'Zip',
  'City',
  'Country',
  'Zsr',
  'Phone',
  'Email',
] as const;

interface FieldPolicy {
  known: readonly string[];
  allowed: readonly string[];
}

function contextLabel(medType: number): string {
  switch (medType) {
    case 1:
      return 'MedType 1 (MP)';
    case 2:
      return 'MedType 2 (PMC)';
    default:
      return 'MedType 3 (Rx)';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childPath(base: string, key: string): string {
  return `${base}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

/**
 * Flags unknown fields (forward compatibility, `README.md:49-53`) and fields
 * defined by the specification but not used by the active context (`-` cells in
 * the tables).
 */
function checkFields(
  object: Record<string, unknown>,
  path: string,
  policy: FieldPolicy,
  label: string,
  warnings: ValidationWarning[],
): void {
  for (const key of Object.keys(object)) {
    const fieldPath = childPath(path, key);
    if (!policy.known.includes(key)) {
      warnings.push({
        code: 'unknown-field',
        path: fieldPath,
        message: `Unknown field "${key}"; ignored for forward compatibility (README.md:49-53).`,
      });
    } else if (!policy.allowed.includes(key)) {
      warnings.push({
        code: 'context-field',
        path: fieldPath,
        message: `Field "${key}" is not used by ${label}; ignored.`,
      });
    }
  }
}

function rootPolicy(medType: number): FieldPolicy {
  if (medType === 1) {
    return { known: ROOT_KNOWN, allowed: ROOT_ALLOWED_MP };
  }
  if (medType === 2) {
    return { known: ROOT_KNOWN, allowed: ROOT_ALLOWED_PMC };
  }
  return { known: ROOT_KNOWN, allowed: ROOT_ALLOWED_RX };
}

function patientPolicy(medType: number): FieldPolicy {
  if (medType === 1) {
    return { known: PATIENT_KNOWN, allowed: PATIENT_ALLOWED_MP };
  }
  if (medType === 2) {
    return { known: PATIENT_KNOWN, allowed: PATIENT_ALLOWED_PMC };
  }
  return { known: PATIENT_KNOWN, allowed: PATIENT_ALLOWED_RX };
}

function medicamentAllowed(medType: number): readonly string[] {
  if (medType === 1) {
    return MEDICAMENT_ALLOWED_MP;
  }
  if (medType === 2) {
    return MEDICAMENT_ALLOWED_PMC;
  }
  return MEDICAMENT_ALLOWED_RX;
}

function posologyAllowed(medType: number): readonly string[] {
  if (medType === 1) {
    return POSOLOGY_ALLOWED_MP;
  }
  if (medType === 2) {
    return POSOLOGY_ALLOWED_PMC;
  }
  return POSOLOGY_ALLOWED_RX;
}

/** Numeric _Risk Id_ values listed per _Risk Category_ (`chmed16a/README.md:811-923`). */
const RISK_IDS_BY_CATEGORY: Readonly<Record<number, readonly number[]>> = {
  1: [597, 575, 576, 577],
  2: [572, 573, 574],
  3: [78, 77, 612],
  4: [580],
  5: [615],
  7: [779, 780],
};

function collectWarnings(
  root: Record<string, unknown>,
  context: ValidationContext | null,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (context === null) {
    collectPrivateFieldWarnings(root, errors, warnings);
    collectEmptyStringWarnings(root, warnings);
    return;
  }

  const { medType, rev } = context;
  const label = contextLabel(medType);
  const rxRevision = medType === 3 ? effectiveRxRevision(rev) : 0;

  checkFields(root, '', rootPolicy(medType), label, warnings);

  const patient = root.Patient;
  if (isRecord(patient)) {
    checkFields(patient, '/Patient', patientPolicy(medType), label, warnings);

    const lng = patient.Lng;
    if (typeof lng === 'string' && lng !== lng.toLowerCase()) {
      warnings.push({
        code: 'lng-case',
        path: '/Patient/Lng',
        message: `Patient language "${lng}" should be a lowercase ISO 639-1 code (e.g. "de", chmed16a/README.md:487-496).`,
      });
    }
  }

  const medicaments = root.Medicaments;
  if (Array.isArray(medicaments)) {
    medicaments.forEach((item, index) => {
      if (!isRecord(item)) {
        return;
      }
      const path = `/Medicaments/${index}`;
      checkFields(
        item,
        path,
        { known: MEDICAMENT_KNOWN, allowed: medicamentAllowed(medType) },
        label,
        warnings,
      );

      if (medType === 3 && rxRevision < 3 && 'IndC' in item) {
        warnings.push({
          code: 'indc-revision',
          path: childPath(path, 'IndC'),
          message: `"IndC" is defined since revision 3; ignored for revision ${rxRevision} (chmed16a/prescription.md:74-78).`,
        });
      }

      collectPosologyWarnings(item.Pos, `${path}/Pos`, medType, label, warnings);
    });
  }

  const recoms = root.Recoms;
  if (medType === 2 && Array.isArray(recoms)) {
    recoms.forEach((item, index) => {
      if (!isRecord(item)) {
        return;
      }
      checkFields(
        item,
        `/Recoms/${index}`,
        { known: RECOMMENDATION_KNOWN, allowed: RECOMMENDATION_KNOWN },
        label,
        warnings,
      );
    });
  }

  if (medType === 1 && isRecord(patient) && isRecord(patient.Med)) {
    const med = patient.Med;
    checkFields(
      med,
      '/Patient/Med',
      { known: MEDICAL_DATA_KNOWN, allowed: MEDICAL_DATA_KNOWN },
      label,
      warnings,
    );
    collectMeasurementWarnings(med.Meas, label, warnings);
    collectRiskWarnings(med.Rc, label, warnings);
  }

  if (isRecord(patient) && Array.isArray(patient.Ids)) {
    collectSimpleObjectWarnings(patient.Ids, '/Patient/Ids', PATIENT_ID_KNOWN, label, warnings);
  }

  if (isRecord(root.HcPerson)) {
    checkFields(
      root.HcPerson,
      '/HcPerson',
      { known: HC_PERSON_KNOWN, allowed: HC_PERSON_KNOWN },
      label,
      warnings,
    );
  }

  if (isRecord(root.HcOrg)) {
    checkFields(
      root.HcOrg,
      '/HcOrg',
      { known: HC_ORG_KNOWN, allowed: HC_ORG_KNOWN },
      label,
      warnings,
    );
  }

  if (medType === 3) {
    collectRxWarnings(root, rxRevision, errors, warnings);
  }

  collectPrivateFieldWarnings(root, errors, warnings);
  collectEmptyStringWarnings(root, warnings);
}

function collectPosologyWarnings(
  posValue: unknown,
  path: string,
  medType: number,
  label: string,
  warnings: ValidationWarning[],
): void {
  if (!Array.isArray(posValue)) {
    return;
  }
  const allowed = posologyAllowed(medType);
  posValue.forEach((posology, index) => {
    if (!isRecord(posology)) {
      return;
    }
    const posPath = `${path}/${index}`;
    checkFields(posology, posPath, { known: POSOLOGY_KNOWN, allowed }, label, warnings);

    if (Array.isArray(posology.TT) && medType === 1) {
      collectSimpleObjectWarnings(posology.TT, `${posPath}/TT`, TAKING_TIME_KNOWN, label, warnings);
    }

    const doses = posology.D;
    if (Array.isArray(doses) && doses.length > 4) {
      warnings.push({
        code: 'doses-length',
        path: childPath(posPath, 'D'),
        message: `"D" has ${doses.length} entries; only 4 (morning, noon, evening, night) are defined (assumption, plan 001:71). Extra entries are ignored.`,
      });
    }
  });
}

function collectSimpleObjectWarnings(
  value: unknown[],
  path: string,
  known: readonly string[],
  label: string,
  warnings: ValidationWarning[],
): void {
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    checkFields(item, `${path}/${index}`, { known, allowed: known }, label, warnings);
  });
}

function collectMeasurementWarnings(
  measValue: unknown,
  label: string,
  warnings: ValidationWarning[],
): void {
  if (!Array.isArray(measValue)) {
    return;
  }
  measValue.forEach((measurement, index) => {
    if (!isRecord(measurement)) {
      return;
    }
    const path = `/Patient/Med/Meas/${index}`;
    checkFields(
      measurement,
      path,
      { known: MEASUREMENT_KNOWN, allowed: MEASUREMENT_KNOWN },
      label,
      warnings,
    );

    const val = measurement.Val;
    if (typeof val !== 'string') {
      warnings.push({
        code: 'measurement-value',
        path: childPath(path, 'Val'),
        message: `Measurement value should be a string (e.g. "53", chmed16a/README.md:735-740); accepted as ${JSON.stringify(val)}.`,
      });
    } else if (val.trim() !== '' && !Number.isFinite(Number(val))) {
      warnings.push({
        code: 'measurement-value',
        path: childPath(path, 'Val'),
        message: `Measurement value "${val}" is not parseable as a number (chmed16a/README.md:735-740).`,
      });
    }

    const type = measurement.Type;
    const unit = measurement.Unit;
    if ((type === 1 || type === 2) && (unit === 1 || unit === 2)) {
      // The specification lists the allowed unit per type but does not state the
      // cross-constraint as a requirement; a mismatch is therefore a warning.
      const expectedUnit = type === 1 ? 2 : 1;
      if (unit !== expectedUnit) {
        warnings.push({
          code: 'measurement-unit',
          path: childPath(path, 'Unit'),
          message: `Measurement unit ${unit} does not match type ${type} (type 1 = weight in kg/unit 2, type 2 = height in cm/unit 1, chmed16a/README.md:741-756).`,
        });
      }
    }
  });
}

function collectRiskWarnings(
  rcValue: unknown,
  label: string,
  warnings: ValidationWarning[],
): void {
  if (!Array.isArray(rcValue)) {
    return;
  }
  rcValue.forEach((riskCategory, index) => {
    if (!isRecord(riskCategory)) {
      return;
    }
    const path = `/Patient/Med/Rc/${index}`;
    checkFields(
      riskCategory,
      path,
      { known: RISK_CATEGORY_KNOWN, allowed: RISK_CATEGORY_KNOWN },
      label,
      warnings,
    );

    const id = riskCategory.Id;
    if (typeof id !== 'number') {
      return;
    }
    const listed = RISK_IDS_BY_CATEGORY[id];
    // RC 6 (allergies) uses external CDSCODE codes; never check it.
    if (listed === undefined || !Array.isArray(riskCategory.R)) {
      return;
    }
    riskCategory.R.forEach((risk, riskIndex) => {
      if (typeof risk !== 'number') {
        return;
      }
      if (!listed.includes(risk)) {
        warnings.push({
          code: 'risk-id',
          path: `/Patient/Med/Rc/${index}/R/${riskIndex}`,
          message: `Risk Id ${risk} is not listed for Risk Category ${id} (chmed16a/README.md:811-923); accepted as an external code.`,
        });
      }
    });
  });
}

function collectRxWarnings(
  root: Record<string, unknown>,
  rxRevision: number,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (rxRevision < 2) {
    warnings.push({
      code: 'rev1-assumption',
      path: '',
      message:
        'assumption: rev1 tables not in repo; revision 1 is validated leniently (only patient names/birth date, id and auth are enforced). Set "rev" >= 2 for rev2+ rules (chmed16a/prescription.md:225-233).',
    });
  } else if (typeof root.rev === 'number' && Number.isInteger(root.rev) && root.rev >= 4) {
    warnings.push({
      code: 'unknown-revision',
      path: '/rev',
      message: `Unknown revision ${root.rev}; validated against revision 3 (revisions are additive, chmed16a/prescription.md:54-70).`,
    });
  }

  if (rxRevision < 2) {
    return;
  }

  // `chmed16a/prescription.md:288-303`: the GLN in Auth MUST also be in HcPerson.
  // A non-GLN Auth (e.g. the literal "patient") is explicitly allowed.
  const auth = root.Auth;
  const person = root.HcPerson;
  const personGln = isRecord(person) ? person.Gln : undefined;
  if (
    typeof auth === 'string' &&
    /^\d{13}$/.test(auth) &&
    typeof personGln === 'string' &&
    auth !== personGln
  ) {
    errors.push({
      instancePath: '/Auth',
      keyword: 'gln-mismatch',
      message: `Auth GLN "${auth}" must also be provided in HcPerson.Gln (chmed16a/prescription.md:301).`,
      params: { auth, gln: personGln },
    });
  }
}

/**
 * Walks every object in the document (depth first) and reports:
 * - `pFields` present while `PSchema` is empty/absent (ignored, not validated);
 * - missing `Nm` in private fields when `PSchema` is set.
 */
function collectPrivateFieldWarnings(
  root: Record<string, unknown>,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  const pSchema = root.PSchema;
  const active = typeof pSchema === 'string' && pSchema.trim() !== '';

  walkObjects(root, '', (object, path) => {
    const pFields = object.PFields;
    if (!Array.isArray(pFields)) {
      return;
    }
    const pFieldsPath = childPath(path, 'PFields');
    if (!active) {
      if (pFields.length > 0) {
        warnings.push({
          code: 'pfields-ignored',
          path: pFieldsPath,
          message:
            'Private fields are ignored because PSchema is empty or absent (chmed16a/README.md:382).',
        });
      }
      return;
    }
    pFields.forEach((field, index) => {
      if (!isRecord(field)) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(field, 'Nm')) {
        errors.push({
          instancePath: `${pFieldsPath}/${index}`,
          keyword: 'required',
          message: "must have required property 'Nm' (PSchema is set)",
          params: { missingProperty: 'Nm' },
        });
      }
    });
  });
}

function collectEmptyStringWarnings(
  root: Record<string, unknown>,
  warnings: ValidationWarning[],
): void {
  walkObjects(root, '', (object, path) => {
    for (const [key, value] of Object.entries(object)) {
      if (value === '') {
        warnings.push({
          code: 'empty-string',
          path: childPath(path, key),
          message: `Field "${key}" is an empty string; the specification recommends omitting empty optional fields (chmed16a/README.md:82).`,
        });
      }
    }
  });
}

function walkObjects(
  value: unknown,
  path: string,
  visit: (object: Record<string, unknown>, path: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkObjects(item, `${path}/${index}`, visit);
    });
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  visit(value, path);
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'object' && child !== null) {
      walkObjects(child, childPath(path, key), visit);
    }
  }
}
