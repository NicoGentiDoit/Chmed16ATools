/**
 * Normalized eMediplan paper-layout text → CHMED16A ePrescription (Rx).
 *
 * This module is a **pure decision layer**: it performs no I/O, has no
 * dependency on a PDF/OCR adapter and never touches the DOM. It consumes the
 * text produced by the Phase 2 normalizer (`pdf-extract.ts` /
 * `pdf-to-prescription.ts`) and returns either a `MedicationRx` object or a
 * typed `ParseError[]`. Input is untrusted (PDF-extracted text), so every
 * pattern is bounded, every array access is guarded and the public entry point
 * is wrapped in a catch-all: it never throws.
 *
 * ## Input contract
 *
 * The text is a line-oriented rendering of the printed paper layout with the
 * *table headers and medication rows* already flattened to one line each;
 * columns are separated by `|`, a tab, or two or more spaces (the Phase 2
 * adapter is responsible for that flattening — see
 * `app/src/core/qr-scan.ts:1-13` for the pure/adapter split precedent).
 * Header blocks use the printed `Label: value` form.
 *
 * Since fix round 2 the text-layer path feeds `pdf-extract.ts`'s
 * `tabulateLayout`: it rebuilds one pipe-separated line per printed y-band row
 * from the PDF item geometry, so the strict path also applies to real layouts
 * whose column gaps oscillate (and therefore cannot be split on spaces). The
 * strict path still wins for separator-formatted input and the tolerant path
 * still serves flat OCR text; the three inputs share one output contract.
 *
 * ## Real-world paper variations (fix round 2)
 *
 * The German HCI sample prints a title vocabulary and edge cases the English
 * spec table does not name, so the parser accepts them in addition:
 * - titles `Einheit` (quantity) and `Anleitung` (instructions);
 * - wrapped header fragments such as `zur` / `durch` (they carry no column and
 *   are dropped by the tabulator; a bare `durch` line is never a title);
 * - `-` in a dose or date cell: the printed form of an empty cell, i.e. dose 0
 *   and "no end date", never an `invalid-value`;
 * - an unlabelled patient block: a `DD.MM.YYYY (M|W|F)` line is the birth line,
 *   with the name above and the address below it (labelled anchors still win);
 * - the provider label `erstellt von` (with the printed space before the colon);
 * - a second table (`Reservemedikation`): its rows append to the same
 *   medicaments array in document order.
 *
 * ## Two layout paths (same output contract)
 *
 * Both paths produce the same `MedicationRx` (or typed `ParseError[]`), and both
 * are fail-closed: text that is not a printed medication table ends in
 * `unsupported-layout`.
 *
 * 1. **Strict** (`layoutFor`): the header row must be split into at least four
 *    recognized title cells by `|`, a tab or 2+ spaces, one of them
 *    `Medication`. Rows are split the same way. This is the printed-layout path
 *    and always wins when it applies.
 * 2. **Tolerant** (`findTolerantHeader`, only when the strict detector found
 *    nothing): the header is a single-spaced line that *starts* with a
 *    medication title and carries at least four recognized titles, including
 *    all four dose columns (Morning/Noon/Evening/Night). Row cells are then
 *    located by token window instead of separators: the first run of four
 *    consecutive dose tokens is the dose window (medication description before
 *    it), `See instructions` may stand in for that window, and the cells after
 *    it are read positionally (Quantity, From, Up to). The free-text columns
 *    cannot be separated without their gaps, so trailing non-representable
 *    columns are peeled from the right: a `Dr.`/`Prof.`/`med.` honorific starts
 *    `Prescribed by`, the last word before it is the printed `Reason` label, and
 *    the rest is `Instructions`. That heuristic is why an OCR result is always
 *    reported with the low-confidence warning; it never invents text, it only
 *    drops columns an Rx cannot represent.
 *
 * Spec anchors:
 * - `chmed16a/README.md:1664-1723` — patient and service-provider blocks.
 * - `chmed16a/README.md:1735-1745` — medication columns.
 * - `chmed16a/README.md:1753` — issue date.
 * - `chmed16a/prescription.md:209-392` — Rx root object (rev 3).
 * - `chmed16a/prescription.md:563-680` — `MedicamentRx`.
 * - `chmed16a/prescription.md:682-719` — `PosologyRx` (only `DtTo` and `D`).
 *
 * ## Column mapping (`chmed16a/README.md:1735-1745`)
 *
 * | Printed column            | Target                                   |
 * | ------------------------- | ---------------------------------------- |
 * | Medication                | `MedicamentRx.Id` / `.IdType`             |
 * | Morning/Noon/Evening/Night| `Pos[0].D` (4 slots, fractions → decimal)|
 * | Quantity                  | `MedicamentRx.Unit`                       |
 * | From                      | not representable (Rx has no `DtFrom`)    |
 * | Up to and including       | `Pos[0].DtTo`                             |
 * | Instructions              | `MedicamentRx.AppInstr`                   |
 * | Reason                    | not a Rx field (`TkgRsn` is MP only)      |
 * | Prescribed by             | not a Rx field (`PrscbBy`/`AutoMed` MP); a unique printed value infers the author (`HcPerson`), see `uniquePrescriber` |
 * | Reserve medication        | not representable (Rx `Pos` only `D`/`DtTo`) |
 *
 * `Rep`, `Subs`, `NbPack` and `IndC` are not printed columns, but they are
 * accepted when a row carries them as explicit `Rep: 3`-style cells.
 *
 * ## Header heuristics
 *
 * - Patient: `First name:` / `Last name:` labels, or the unlabelled name line
 *   directly above `Born on: DD.MM.YYYY (M|F)`; the address line directly below
 *   it is read as `Street, Zip City / Phone` (`README.md:1672`).
 * - Provider: `Created by:` / `Printed by:` (person; honorifics are dropped),
 *   `Organisation:` / `Praxis:` / `Apotheke:` (organisation), `GLN:` (13
 *   digits), `Zsr:`, and `Street:` / `Zip:` / `City:` inside the provider
 *   block (`README.md:1705-1723`).
 * - Issue date: `Issue date: DD.MM.YYYY [hh:mm]` (`README.md:1753`).
 * - Medication: the `Medication`-anchored header row plus at least three other
 *   known titles. Unknown or absent columns are skipped and optional fields are
 *   omitted instead of being emitted as empty strings.
 *
 * ## Deliberate parsing policy
 *
 * - Missing patient/issue-date/medication data is a blocking `missing-field`.
 * - An unreadable date or dose is a blocking `invalid-value` (fail closed).
 * - A provider block that only yields a GLN still sets `Auth`; `HcPerson` /
 *   `HcOrg` are emitted only when their required parts were actually detected,
 *   so revision-3 validation surfaces the gap instead of the parser inventing
 *   values (plan 002, Notes/Edge Cases).
 * - Fix round 3 (author inference): when the document-level author is unnamed
 *   and the medication table prints `Prescribed by` / `Verordnet durch` for its
 *   rows, exactly one distinct printed prescriber becomes the `HcPerson` name
 *   (`uniquePrescriber`). The GLN still comes only from an explicitly printed
 *   `GLN:` field, because revision 3 makes `HcPerson.Gln` required: with no
 *   printed GLN no `HcPerson` is created at all. Two or more distinct
 *   prescribers mean no inference (the validator reports the missing required
 *   field); the parser never picks an author and never adds an error of its own.
 * - `rev` is always `3`; the rev-1 assumption of `prescription.md:225-233` is
 *   never used.
 */

import type {
  HealthcareOrganization,
  HealthcarePerson,
  MedicationRx,
  MedicamentRx,
  PatientRx,
  PosologyRx,
} from './types';
import type { ValidationWarning } from './validate';

/** A single reason why the text could not be turned into a prescription. */
export interface ParseError {
  code: 'missing-field' | 'invalid-value' | 'unsupported-layout';
  /** JSON Pointer into the would-be result, e.g. `/Patient/BDt`. */
  path: string;
  message: string;
}

/** Parsed prescription plus non-blocking findings, or the blocking errors. */
export type PrescriptionParseResult =
  | { ok: true; value: MedicationRx; warnings: ValidationWarning[] }
  | { ok: false; errors: ParseError[] };

/* -------------------------------------------------------------------------- */
/* Patterns                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Medication table columns (`chmed16a/README.md:1735-1745`). Each matcher is
 * anchored at the start of a cell and uses a bounded lookahead instead of `\b`
 * so accented titles (e.g. `Quantité`) terminate correctly.
 */
export type ColumnKey =
  | 'medication'
  | 'morning'
  | 'noon'
  | 'evening'
  | 'night'
  | 'quantity'
  | 'from'
  | 'upTo'
  | 'instructions'
  | 'reason'
  | 'prescribedBy'
  | 'reserve';

/**
 * Printed title vocabulary. Exported (`columnKeyFor`) so the geometry
 * tabulator of `pdf-extract.ts` maps header items with exactly the same titles
 * this parser understands — one vocabulary, no drift between the two layers.
 *
 * `einheit` and `anleitung` are the German titles of the real HCI eMediplan
 * sample (quantity / instructions); the English spec table uses
 * `Quantity` / `Instructions`. The 2023 German sample prints the two-word
 * titles `Anwendungsinstruktion` / `Anwendungsgrund` instead (fix round 4);
 * they are distinct roots from `anleitung` / `grund`, so the anchored matchers
 * cannot partially overlap.
 */
const COLUMN_MATCHERS: ReadonlyArray<readonly [ColumnKey, RegExp]> = [
  ['medication', /^(?:medication|medikamente?|médicament|medicament|farmaco)(?=$|[\s(])/iu],
  ['morning', /^(?:morning|morgen|morgens|matin|mattina)(?=$|[\s(])/iu],
  ['noon', /^(?:noon|mittag|midi|mezzogiorno)(?=$|[\s(])/iu],
  ['evening', /^(?:evening|abend|soir|sera)(?=$|[\s(])/iu],
  ['night', /^(?:night|nacht|nuit|notte)(?=$|[\s(])/iu],
  ['quantity', /^(?:quantity|menge|einheit|quantité|quantita|quantità)(?=$|[\s(])/iu],
  ['upTo', /^(?:up to|bis|au|fino)(?=$|[\s(])/iu],
  ['from', /^(?:from|von|du|dal)(?=$|[\s(])/iu],
  [
    'instructions',
    /^(?:instructions?|hinweise?|anleitung|anwendungsinstruktion|indicazioni)(?=$|[\s(])/iu,
  ],
  ['reason', /^(?:reason|grund|anwendungsgrund|raison|motivo)(?=$|[\s(])/iu],
  ['prescribedBy', /^(?:prescribed by|verordnet|prescrit|prescritto)(?=$|[\s(])/iu],
  ['reserve', /^(?:reserve|reservemedikation)(?=$|[\s(])/iu],
];

/**
 * First column whose printed title matches `cell`.
 *
 * Bounded and allocation-free; empty cells carry no title. Used by `layoutFor`
 * and by the geometry tabulator in `pdf-extract.ts`.
 */
export function columnKeyFor(cell: string): ColumnKey | undefined {
  const value = cell.trim();
  if (value === '') {
    return undefined;
  }
  for (const [key, pattern] of COLUMN_MATCHERS) {
    if (pattern.test(value)) {
      return key;
    }
  }
  return undefined;
}

/** `Label: value`; the label is bounded so a hostile line cannot backtrack. */
const LABEL_PATTERN = /^([^:|]{1,40}?)\s*:\s*(.*)$/;

const FIRST_NAME_LABELS = [
  'first name',
  'firstname',
  'given name',
  'vorname',
  'prénom',
  'prenom',
  'nome',
];
const LAST_NAME_LABELS = [
  'last name',
  'lastname',
  'surname',
  'family name',
  'nachname',
  'nom',
  'cognome',
];
const BORN_LABELS = [
  'born on',
  'born',
  'date of birth',
  'birth date',
  'geburtsdatum',
  'geboren am',
  'date de naissance',
  'data di nascita',
];
const GENDER_LABELS = ['gender', 'geschlecht', 'sexe', 'sesso'];
const STREET_LABELS = ['street', 'strasse', 'rue', 'via'];
const ZIP_LABELS = ['zip', 'postal code', 'postcode', 'plz', 'code postal', 'cap'];
const CITY_LABELS = ['city', 'place', 'ort', 'ville', 'località', 'localita'];
const PHONE_LABELS = ['phone', 'telephone', 'tel', 'telefon', 'téléphone'];
const EMAIL_LABELS = ['email', 'e-mail', 'mail'];
const ISSUE_DATE_LABELS = [
  'issue date',
  'issued',
  'creation date',
  'created on',
  'ausstellungsdatum',
  "date d'émission",
  'data di emissione',
];
const CREATED_BY_LABELS = [
  'created by',
  'printed by',
  'service provider',
  'author',
  'verordnet von',
  'prescrit par',
  // German HCI sample: printed with a space before the colon (`erstellt von :`).
  // The `Label: value` splitter below already tolerates that space.
  'erstellt von',
];
const ORG_LABELS = [
  'organisation',
  'organization',
  'practice',
  'praxis',
  'apotheke',
  'pharmacy',
  'pharmacie',
  'klinik',
  'clinic',
  'spital',
  'hospital',
  'institution',
];
const GLN_LABELS = ['gln', 'auth', 'gln number', 'gln-number', 'gln nummer'];
const ZSR_LABELS = ['zsr', 'zsr number', 'zsr-number', 'zsr nummer'];

const PROVIDER_SECTION_PATTERN =
  /^(?:service provider|provider|author|created by|printed by|drawn up by)\b/i;
const PATIENT_SECTION_PATTERN =
  /^(?:patient(?:in)?|personal data|patient data|stammdaten|header)\b/i;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const GLN_INLINE_PATTERN = /\bgln\s*[:=]?\s*(\d{13})(?=$|\s|\D)/i;
const ORG_HINT_PATTERN =
  /(?:praxis|apotheke|pharmacy|pharmacie|klinik|clinic|spital|hospital|zentrum|center|institut|institute|labor|gmbh|sarl)\b/i;
const HONORIFIC_IN_PATTERN = /\b(?:dr|prof|med|dipl)\./i;
const HONORIFIC_TOKEN_PATTERN = /^(?:dr|prof|med|dipl|phil|nat|sc|mr|mrs|ms|frau|herr)\.?$/i;
/**
 * The printed `Prescribed by` values that name no prescriber: self-medication
 * (`chmed16a/README.md:1735-1745`) in the four paper languages.
 *
 * Fix round 4: the token is matched as a *prefix* of the cell, with a word
 * boundary after it, because a real layout can glue the printed `Reason` into
 * the same band cell (`Selbstmedikation Fieber`). The anchor at the start stays
 * strict: text that merely contains the word is still read as a value.
 */
const SELF_MEDICATION_PATTERN =
  /^(?:selbstmedikation|self[\s-]?medication|automédication|automedicazione)\b/i;

const DATE_INLINE_PATTERN = /\b(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/;
const DMY_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_DATE_PREFIX = /^(\d{1,2}\.\d{1,2}\.\d{4})/;
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
const GENDER_IN_PARENS_PATTERN = /\(\s*(männlich|weiblich|male|female|m|w|f)\s*\)/i;
const MALE_PATTERN = /^(?:m|male|männlich|mann|herr)$/i;
const FEMALE_PATTERN = /^(?:f|w|female|weiblich|frau)$/i;

/**
 * An unlabelled birth line of the compact patient block: the date followed by
 * the printed gender letter, e.g. `01.11.1943 (M)` / `01.11.1943 (W)`.
 */
const COMPACT_BORN_PATTERN =
  /^(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\s*\(\s*(?:m|w|f|male|female|männlich|weiblich)\s*\)$/i;

const STREET_ADDRESS_PATTERN = /^(.{1,80}?),\s*(\d{4,5})\s+(.{1,60})$/;
const ZIP_CITY_PATTERN = /^(\d{4,5})\s+(.{1,60})$/;

const DECIMAL_DOSE_PATTERN = /^\d{1,3}(?:[.,]\d{1,2})?$/;
const MIXED_FRACTION_PATTERN = /^(\d{1,3}) (\d{1,2}\/\d{1,2})$/;
/**
 * The dose cell can print `See instructions` instead of four doses. Fix round 4
 * adds the German 2023 wording `siehe Anwendungsinstruktion`; the existing
 * alternates are unchanged.
 */
const SEE_INSTRUCTIONS_PATTERN =
  /see instructions?|nach Anweisung|voir les instructions|secondo le istruzioni|\bsiehe Anwendungsinstruktion\b/i;

/** A single whitespace-delimited dose cell (`1`, `0`, `½`, `1/3`, `1,5`). */
const DOSE_TOKEN_PATTERN = /^(?:-|–|\d{1,3}(?:[.,]\d{1,2})?|[½¼¾⅛]|\d{1,2}\/\d{1,2})$/u;
/**
 * The printed form of an empty cell: a lone dash (the German HCI sample prints
 * `-` in every empty dose/date/unit cell of the medication table).
 */
const DASH_CELL_PATTERN = /^[-–—]$/;
/** A single whitespace-delimited printed date cell. */
const DATE_TOKEN_PATTERN = /^(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})$/;
/** First token of a printed header row (`Medication`, `Medikamente`, ...). */
const MEDICATION_TITLE_START = /^(?:medication|medikamente?|médicament|medicament|farmaco)(?=$|[\s(])/iu;

const GTIN_PATTERN = /\b(?:gtin|ean)\s*[:=]?\s*(\d{13,14})(?=$|\s|\D)/i;
const PHARMACODE_PATTERN = /\bpharmacode\s*[:=]?\s*(\d{4,7})(?=$|\s|\D)/i;

const REP_PATTERN = /^rep\s*[:=]\s*(\d{1,3})$/i;
const NBPACK_PATTERN = /^nbpack\s*[:=]\s*(\d{1,3})$/i;
const SUBS_PATTERN = /^subs?\s*[:=]\s*([01])$/i;
const INDC_PATTERN = /^indc\s*[:=]\s*(\d{5}\.\d{2})$/i;

const COMMENT_STOP_PATTERN = /^(?:comment|comments|bemerkung|kommentar|remark|remarks|footer)\b/i;
/** `Page 1 of 1` and the German `Seite 1 von 1` footer. */
const PAGE_MARKER_PATTERN = /\b(?:page|seite)\s+\d{1,3}\s+(?:of|von)\s+\d{1,3}\s*$/i;
/** The generator line of the printed footer, e.g. `eMediplan by HCI Solutions AG`. */
const FOOTER_GENERATOR_PATTERN = /eMediplan\s+by\b/i;
/** A second table is introduced by its printed title; its rows are still parsed. */
const RESERVE_TITLE_PATTERN = /^(?:reservemedikation|reserve medication)$/i;

/** Printed dosage fractions (`chmed16a/README.md:1738`). */
const FRACTION_DOSES: ReadonlyMap<string, number> = new Map([
  ['½', 0.5],
  ['¼', 0.25],
  ['¾', 0.75],
  ['⅛', 0.125],
  ['1/2', 0.5],
  ['1/4', 0.25],
  ['3/4', 0.75],
  ['1/8', 0.125],
  ['1/3', 0.33],
  ['2/3', 0.67],
]);

/* -------------------------------------------------------------------------- */
/* Internal shapes                                                            */
/* -------------------------------------------------------------------------- */

interface AddressFields {
  street?: string;
  zip?: string;
  city?: string;
  phone?: string;
  email?: string;
}

interface PatientScan extends AddressFields {
  fName?: string;
  lName?: string;
  bDt?: string;
  bDtRaw?: string;
  gender?: 1 | 2;
}

interface ProviderScan extends AddressFields {
  personName?: string;
  orgName?: string;
  gln?: string;
  zsr?: string;
}

interface HeaderScan {
  patient: PatientScan;
  provider: ProviderScan;
  id?: string;
  issueDate?: string;
}

interface ColumnLayout {
  medication: number;
  morning?: number;
  noon?: number;
  evening?: number;
  night?: number;
  quantity?: number;
  upTo?: number;
  instructions?: number;
  /** `Prescribed by` / `Verordnet durch`; read for author inference only. */
  prescribedBy?: number;
}

/**
 * Presence of the columns the tolerant path needs to peel free text from the
 * right. The tolerant path has no cell indices: it works on token windows.
 */
interface TolerantLayout {
  readonly hasFrom: boolean;
  readonly hasReason: boolean;
  readonly hasPrescribedBy: boolean;
}

interface MedicamentExtras {
  rep?: number;
  subs?: 0 | 1;
  nbPack?: number;
  indC?: string;
}

type BlockState = 'other' | 'patient' | 'provider';

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Bounded copy used in messages and in `Id` so untrusted text stays small. */
function clip(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit);
}

/**
 * Normalizes line endings, page breaks and Unicode spaces, then trims each
 * line. Internal runs of spaces are preserved because they double as the
 * column separator.
 */
function normalizeLines(text: string): string[] {
  return text
    .split('\r\n')
    .join('\n')
    .split('\r')
    .join('\n')
    .split('\f')
    .join('\n')
    .replace(/[\u00a0\u2007\u2009\u202f]/g, ' ')
    .split('\n')
    .map((line) => line.trim());
}

/** Splits one printed row into cells (`|`, tab or 2+ spaces). */
function splitColumns(line: string): readonly string[] {
  if (line.includes('|')) {
    return line.split('|').map((cell) => cell.trim());
  }
  if (line.includes('\t')) {
    return line.split(/\t+/).map((cell) => cell.trim());
  }
  const spaced = line.split(/\s{2,}/).map((cell) => cell.trim());
  return spaced.length >= 2 ? spaced : [line.trim()];
}

/**
 * True for the printed representation of an empty cell: nothing, or a lone dash.
 *
 * The German HCI sample prints every empty dose/date/unit cell as `-`; the
 * English spec example leaves the same cells blank, so both forms mean "no
 * value" and neither is an `invalid-value`.
 */
function isBlankCell(raw: string): boolean {
  const value = raw.trim();
  return value === '' || DASH_CELL_PATTERN.test(value);
}

/** Splits `Label: value`; returns `undefined` for non-label lines. */
function parseLabel(line: string): { label: string; value: string } | undefined {
  const match = LABEL_PATTERN.exec(line);
  if (match === null) {
    return undefined;
  }
  const rawLabel = match[1];
  const rawValue = match[2];
  if (rawLabel === undefined) {
    return undefined;
  }
  return {
    label: rawLabel.replace(/\s+/g, ' ').trim().toLowerCase(),
    value: rawValue === undefined ? '' : rawValue.trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* Header block parsing (`chmed16a/README.md:1664-1723`)                      */
/* -------------------------------------------------------------------------- */

function isAddressLabel(key: string): boolean {
  return (
    STREET_LABELS.includes(key) ||
    ZIP_LABELS.includes(key) ||
    CITY_LABELS.includes(key) ||
    PHONE_LABELS.includes(key) ||
    EMAIL_LABELS.includes(key)
  );
}

/** Address labels are assigned to the block they are printed in. */
function assignAddressField(target: AddressFields, key: string, value: string): void {
  if (value === '') {
    return;
  }
  if (STREET_LABELS.includes(key)) {
    target.street = value;
  } else if (ZIP_LABELS.includes(key)) {
    target.zip = value;
  } else if (CITY_LABELS.includes(key)) {
    target.city = value;
  } else if (PHONE_LABELS.includes(key)) {
    target.phone = value;
  } else if (EMAIL_LABELS.includes(key)) {
    target.email = value;
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1800 || year > 2200) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(year, month);
}

/** `DD.MM.YYYY` / `YYYY-MM-DD` → `YYYY-MM-DD`; `undefined` when invalid. */
function normalizeDate(raw: string): string | undefined {
  const value = raw.trim();
  const dmy = DMY_DATE_PATTERN.exec(value);
  if (dmy !== null) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (!isValidCivilDate(year, month, day)) {
      return undefined;
    }
    return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
  }
  const iso = ISO_DATE_PATTERN.exec(value);
  if (iso !== null) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidCivilDate(year, month, day)) {
      return undefined;
    }
    return value;
  }
  return undefined;
}

/** Reads the first date token of a printed field (date, date+time, ...). */
function extractDate(raw: string): string | undefined {
  const value = raw.trim();
  const prefix = DMY_DATE_PREFIX.exec(value)?.[1] ?? ISO_DATE_PREFIX.exec(value)?.[1];
  return prefix === undefined ? undefined : normalizeDate(prefix);
}

function parseGender(raw: string): 1 | 2 | undefined {
  const value = raw.trim();
  if (MALE_PATTERN.test(value)) {
    return 1;
  }
  if (FEMALE_PATTERN.test(value)) {
    return 2;
  }
  return undefined;
}

function parseBornOn(raw: string): { date?: string; rawDate?: string; gender?: 1 | 2 } {
  const rawDate = DATE_INLINE_PATTERN.exec(raw)?.[1];
  const genderToken = GENDER_IN_PARENS_PATTERN.exec(raw)?.[1];
  const gender = genderToken === undefined ? undefined : parseGender(genderToken);
  if (rawDate === undefined) {
    return gender === undefined ? {} : { gender };
  }
  const date = normalizeDate(rawDate);
  if (date === undefined) {
    return gender === undefined ? { rawDate } : { rawDate, gender };
  }
  return gender === undefined ? { date } : { date, gender };
}

/**
 * `First Last` split. Leading honorifics (`Dr.`, `med.`, `Prof.`) are dropped;
 * a single remaining token is not a usable person name.
 */
function splitPersonName(raw: string): { fName: string; lName: string } | undefined {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '' && !HONORIFIC_TOKEN_PATTERN.test(token));
  const fName = tokens[0];
  if (fName === undefined) {
    return undefined;
  }
  const lName = tokens.slice(1).join(' ');
  if (lName === '') {
    return undefined;
  }
  return { fName, lName };
}

/**
 * The name printed immediately above `Born on:` (`chmed16a/README.md:1672`).
 * Looks back at most three lines and refuses label lines, section titles and
 * anything that looks like a date or a table row.
 */
function previousNameLine(lines: readonly string[], index: number): string | undefined {
  for (let cursor = index - 1; cursor >= 0 && cursor >= index - 3; cursor -= 1) {
    const line = lines[cursor]?.trim() ?? '';
    if (line === '') {
      continue;
    }
    if (PATIENT_SECTION_PATTERN.test(line)) {
      continue;
    }
    if (parseLabel(line) !== undefined) {
      return undefined;
    }
    if (line.includes('|') || line.length > 80 || /\d{4}/.test(line)) {
      return undefined;
    }
    return line;
  }
  return undefined;
}

/**
 * The address printed below `Born on:` (`chmed16a/README.md:1672`), at most two
 * lines down. Stops at the next labelled field (`Phone:`, `Issue date:`, ...).
 */
function nextContentLine(lines: readonly string[], index: number): string | undefined {
  for (let cursor = index + 1; cursor < lines.length && cursor <= index + 2; cursor += 1) {
    const line = lines[cursor]?.trim() ?? '';
    if (line === '') {
      continue;
    }
    if (parseLabel(line) !== undefined || line.includes('|')) {
      return undefined;
    }
    return line;
  }
  return undefined;
}

/** `Street, Zip City / Phone` → address parts (`chmed16a/README.md:1680-1683`). */
function parseAddressLine(raw: string): AddressFields | undefined {
  const parts = raw.split(/\s*\/\s*/);
  const address = (parts[0] ?? '').trim();
  const phone = (parts[1] ?? '').trim();
  const result: AddressFields = {};
  if (phone !== '') {
    result.phone = phone;
  }
  const withStreet = STREET_ADDRESS_PATTERN.exec(address);
  if (withStreet !== null) {
    const street = withStreet[1];
    const zip = withStreet[2];
    const city = withStreet[3];
    if (street !== undefined && street !== '') {
      result.street = street.trim();
    }
    if (zip !== undefined) {
      result.zip = zip;
    }
    if (city !== undefined && city.trim() !== '') {
      result.city = city.trim();
    }
    return result;
  }
  const zipCity = ZIP_CITY_PATTERN.exec(address);
  if (zipCity !== null) {
    const zip = zipCity[1];
    const city = zipCity[2];
    if (zip !== undefined) {
      result.zip = zip;
    }
    if (city !== undefined && city.trim() !== '') {
      result.city = city.trim();
    }
    return result;
  }
  return phone === '' ? undefined : result;
}

/** Fills the compact (unlabelled) name and address of the patient block. */
function fillCompactPatient(
  patient: PatientScan,
  lines: readonly string[],
  bornOnIndex: number,
): void {
  if (patient.fName === undefined || patient.lName === undefined) {
    const nameLine = previousNameLine(lines, bornOnIndex);
    if (nameLine !== undefined) {
      const name = splitPersonName(nameLine);
      if (name !== undefined) {
        if (patient.fName === undefined) {
          patient.fName = name.fName;
        }
        if (patient.lName === undefined) {
          patient.lName = name.lName;
        }
      }
    }
  }
  const hasAddress =
    patient.street !== undefined ||
    patient.zip !== undefined ||
    patient.city !== undefined ||
    patient.phone !== undefined;
  if (hasAddress) {
    return;
  }
  const addressLine = nextContentLine(lines, bornOnIndex);
  if (addressLine === undefined) {
    return;
  }
  const address = parseAddressLine(addressLine);
  if (address === undefined) {
    return;
  }
  if (address.street !== undefined) {
    patient.street = address.street;
  }
  if (address.zip !== undefined) {
    patient.zip = address.zip;
  }
  if (address.city !== undefined) {
    patient.city = address.city;
  }
  if (address.phone !== undefined) {
    patient.phone = address.phone;
  }
}

/**
 * Scans the header block(s). State is block-based: address labels belong to the
 * patient or provider block they are printed in, and the compact patient name
 * and address are resolved only around the `Born on:` anchor.
 */
function scanHeader(lines: readonly string[]): HeaderScan {
  const scan: HeaderScan = { patient: {}, provider: {} };
  let state: BlockState = 'other';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') {
      continue;
    }

    if (scan.id === undefined) {
      const id = UUID_PATTERN.exec(line);
      if (id?.[0] !== undefined) {
        scan.id = id[0];
      }
    }
    if (scan.provider.gln === undefined) {
      const gln = GLN_INLINE_PATTERN.exec(line)?.[1];
      if (gln !== undefined) {
        scan.provider.gln = gln;
        state = 'provider';
      }
    }

    const label = parseLabel(line);
    if (label === undefined) {
      if (PROVIDER_SECTION_PATTERN.test(line)) {
        state = 'provider';
      } else if (PATIENT_SECTION_PATTERN.test(line)) {
        state = 'patient';
      } else if (scan.patient.bDt === undefined && scan.patient.bDtRaw === undefined) {
        // Unlabelled compact patient block (German HCI sample): the birth line
        // is `DD.MM.YYYY (M|W)`, the name is the line above it and the address
        // the line below. Labelled `Born on:` anchors were handled above and
        // keep priority because they set `bDt`/`bDtRaw` first.
        if (COMPACT_BORN_PATTERN.test(line)) {
          state = 'patient';
          const born = parseBornOn(line);
          if (born.date !== undefined) {
            scan.patient.bDt = born.date;
          } else if (born.rawDate !== undefined) {
            scan.patient.bDtRaw = born.rawDate;
          }
          if (scan.patient.gender === undefined && born.gender !== undefined) {
            scan.patient.gender = born.gender;
          }
          fillCompactPatient(scan.patient, lines, index);
        }
      }
      continue;
    }

    const key = label.label;
    const value = label.value;

    if (GLN_LABELS.includes(key)) {
      state = 'provider';
      if (scan.provider.gln === undefined && /^\d{13}$/.test(value)) {
        scan.provider.gln = value;
      }
      continue;
    }
    if (ZSR_LABELS.includes(key)) {
      state = 'provider';
      if (scan.provider.zsr === undefined && /^\d{1,7}$/.test(value)) {
        scan.provider.zsr = value;
      }
      continue;
    }
    if (CREATED_BY_LABELS.includes(key)) {
      state = 'provider';
      if (value !== '') {
        if (HONORIFIC_IN_PATTERN.test(value)) {
          if (scan.provider.personName === undefined) {
            scan.provider.personName = value;
          }
        } else if (ORG_HINT_PATTERN.test(value)) {
          if (scan.provider.orgName === undefined) {
            scan.provider.orgName = value;
          }
        } else if (scan.provider.personName === undefined) {
          scan.provider.personName = value;
        }
      }
      continue;
    }
    if (ORG_LABELS.includes(key)) {
      state = 'provider';
      if (value !== '' && scan.provider.orgName === undefined) {
        scan.provider.orgName = value;
      }
      continue;
    }
    if (FIRST_NAME_LABELS.includes(key)) {
      state = 'patient';
      if (value !== '' && scan.patient.fName === undefined) {
        scan.patient.fName = value;
      }
      continue;
    }
    if (LAST_NAME_LABELS.includes(key)) {
      state = 'patient';
      if (value !== '' && scan.patient.lName === undefined) {
        scan.patient.lName = value;
      }
      continue;
    }
    if (BORN_LABELS.includes(key)) {
      state = 'patient';
      const born = parseBornOn(value);
      if (scan.patient.bDt === undefined && scan.patient.bDtRaw === undefined) {
        if (born.date !== undefined) {
          scan.patient.bDt = born.date;
        } else if (born.rawDate !== undefined) {
          scan.patient.bDtRaw = born.rawDate;
        }
      }
      if (scan.patient.gender === undefined && born.gender !== undefined) {
        scan.patient.gender = born.gender;
      }
      fillCompactPatient(scan.patient, lines, index);
      continue;
    }
    if (GENDER_LABELS.includes(key)) {
      const gender = parseGender(value);
      if (gender !== undefined && scan.patient.gender === undefined) {
        scan.patient.gender = gender;
      }
      continue;
    }
    if (ISSUE_DATE_LABELS.includes(key)) {
      if (scan.issueDate === undefined && value !== '') {
        scan.issueDate = extractDate(value) ?? clip(value, 40);
      }
      continue;
    }
    if (isAddressLabel(key)) {
      assignAddressField(state === 'provider' ? scan.provider : scan.patient, key, value);
    }
  }

  return scan;
}

/** Assembles `HcPerson`/`HcOrg` from the provider block (`prescription.md:761-894`). */
function buildProvider(provider: ProviderScan): {
  auth: string;
  hcPerson?: HealthcarePerson;
  hcOrg?: HealthcareOrganization;
} {
  const auth = provider.gln ?? '';
  const personName =
    provider.personName === undefined ? undefined : splitPersonName(provider.personName);
  let hcPerson: HealthcarePerson | undefined;
  if (provider.gln !== undefined && personName !== undefined) {
    hcPerson = {
      Gln: provider.gln,
      FName: personName.fName,
      LName: personName.lName,
    };
    if (provider.zsr !== undefined) {
      hcPerson.Zsr = provider.zsr;
    }
  }
  let hcOrg: HealthcareOrganization | undefined;
  if (
    provider.orgName !== undefined &&
    provider.street !== undefined &&
    provider.zip !== undefined &&
    provider.city !== undefined
  ) {
    hcOrg = {
      Name: provider.orgName,
      Street: provider.street,
      Zip: provider.zip,
      City: provider.city,
    };
    if (provider.phone !== undefined) {
      hcOrg.Phone = provider.phone;
    }
    if (provider.email !== undefined) {
      hcOrg.Email = provider.email;
    }
  }
  const result: { auth: string; hcPerson?: HealthcarePerson; hcOrg?: HealthcareOrganization } = {
    auth,
  };
  if (hcPerson !== undefined) {
    result.hcPerson = hcPerson;
  }
  if (hcOrg !== undefined) {
    result.hcOrg = hcOrg;
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Author inference from the `Prescribed by` column (fix round 3)             */
/* -------------------------------------------------------------------------- */

/**
 * One printed `Prescribed by` / `Verordnet durch` cell → the printed name parts.
 *
 * The cell of the German HCI sample is `Dr. Example Karl, Wängi`: the honorifics
 * are dropped and `FName`/`LName` are split by `splitPersonName`, i.e. exactly
 * the heuristic of the document-level provider block (`buildProvider`). The
 * part after the first comma is the printed city line the provider block also
 * prints on its second address line; a `HealthcarePerson` has no city, so it is
 * dropped instead of being glued into the family name.
 *
 * Empty cells, the printed dash and the self-medication markers name no
 * prescriber and yield `undefined`: nothing is ever invented here.
 */
function parsePrescriberCell(raw: string): { fName: string; lName: string } | undefined {
  const value = raw.trim();
  if (value === '' || isBlankCell(value) || SELF_MEDICATION_PATTERN.test(value)) {
    return undefined;
  }
  const namePart = (value.split(',')[0] ?? '').trim();
  if (namePart === '') {
    return undefined;
  }
  return splitPersonName(namePart);
}

/**
 * The single prescriber printed on every medication row of the document.
 *
 * Spec anchor: `chmed16a/prescription.md:341-352` — `HcPerson` is *the author of
 * the document*, and revision 2+ requires it. The German HCI sample leaves the
 * document-level `erstellt von :` empty and prints the prescribing doctor per
 * row instead, so the `Prescribed by` column is the only authorship evidence
 * such a document carries (fix round 3, user-approved).
 *
 * Decision rules:
 * - Self-medication markers, empty cells and the printed dash are ignored
 *   (`parsePrescriberCell`).
 * - Rows are compared by the parsed `FName`/`LName` pair, so `Dr. Example Karl`
 *   and `Example Karl` are the same author; honorific variants cannot fake an
 *   ambiguity.
 * - Exactly one distinct identity is returned. Two or more distinct identities
 *   return `undefined`: the parser never chooses between authors and adds no
 *   error of its own, the revision-3 validator reports the missing `HcPerson`
 *   (and `HcOrg`) as before. Inference is strictly additive.
 */
function uniquePrescriber(
  cells: readonly string[],
): { fName: string; lName: string } | undefined {
  let unique: { fName: string; lName: string } | undefined;
  let key = '';
  for (const cell of cells) {
    const person = parsePrescriberCell(cell);
    if (person === undefined) {
      continue;
    }
    const candidate = `${person.fName} ${person.lName}`.toLowerCase();
    if (unique === undefined) {
      unique = person;
      key = candidate;
      continue;
    }
    if (candidate !== key) {
      return undefined;
    }
  }
  return unique;
}

/* -------------------------------------------------------------------------- */
/* Medication table (`chmed16a/README.md:1735-1745`)                          */
/* -------------------------------------------------------------------------- */

/**
 * Derives the column layout from a printed header row. A row is a header when
 * the `Medication` title and at least three further known titles are present,
 * so arbitrary text and ordinary medication rows never match.
 */
function layoutFor(cells: readonly string[]): ColumnLayout | undefined {
  const indices = new Map<ColumnKey, number>();
  cells.forEach((cell, index) => {
    const key = columnKeyFor(cell);
    if (key === undefined || indices.has(key)) {
      return;
    }
    indices.set(key, index);
  });
  const medication = indices.get('medication');
  if (medication === undefined || indices.size < 4) {
    return undefined;
  }
  return {
    medication,
    morning: indices.get('morning'),
    noon: indices.get('noon'),
    evening: indices.get('evening'),
    night: indices.get('night'),
    quantity: indices.get('quantity'),
    upTo: indices.get('upTo'),
    instructions: indices.get('instructions'),
    prescribedBy: indices.get('prescribedBy'),
  };
}

function readCell(cells: readonly string[], index: number | undefined): string {
  if (index === undefined) {
    return '';
  }
  const value = cells[index];
  return value === undefined ? '' : value.trim();
}

/**
 * One printed dose cell → number. Empty cells count as 0 (nothing taken at that
 * time of day), and the printed dash of an empty cell means the same (see
 * `isBlankCell`); the printed fractions of `chmed16a/README.md:1738` and mixed
 * forms such as `1 1/2` are mapped to decimals.
 */
function parseDose(raw: string): number | undefined {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (isBlankCell(value)) {
    return 0;
  }
  const fraction = FRACTION_DOSES.get(value);
  if (fraction !== undefined) {
    return fraction;
  }
  const mixed = MIXED_FRACTION_PATTERN.exec(value);
  if (mixed !== null) {
    const whole = Number(mixed[1]);
    const part = FRACTION_DOSES.get(mixed[2] ?? '');
    if (Number.isFinite(whole) && part !== undefined) {
      return Math.round((whole + part) * 1000) / 1000;
    }
  }
  if (DECIMAL_DOSE_PATTERN.test(value)) {
    const dose = Number(value.replace(',', '.'));
    return Number.isFinite(dose) ? dose : undefined;
  }
  return undefined;
}

function parseSmallInt(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

/** Optional labelled cells (`Rep`, `Subs`, `NbPack`, `IndC`) of a row. */
function readExtras(cells: readonly string[]): MedicamentExtras {
  const extras: MedicamentExtras = {};
  for (const cell of cells) {
    const value = cell.trim();
    if (extras.rep === undefined) {
      const rep = parseSmallInt(REP_PATTERN.exec(value)?.[1]);
      if (rep !== undefined) {
        extras.rep = rep;
      }
    }
    if (extras.nbPack === undefined) {
      const nbPack = parseSmallInt(NBPACK_PATTERN.exec(value)?.[1]);
      if (nbPack !== undefined) {
        extras.nbPack = nbPack;
      }
    }
    if (extras.subs === undefined) {
      const subs = SUBS_PATTERN.exec(value)?.[1];
      if (subs === '0') {
        extras.subs = 0;
      } else if (subs === '1') {
        extras.subs = 1;
      }
    }
    if (extras.indC === undefined) {
      const indC = INDC_PATTERN.exec(value)?.[1];
      if (indC !== undefined) {
        extras.indC = indC;
      }
    }
  }
  return extras;
}

function parseMedicamentId(
  description: string,
): { id: string; idType: 1 | 2 | 3 } | undefined {
  const gtin = GTIN_PATTERN.exec(description)?.[1];
  if (gtin !== undefined) {
    return { id: gtin, idType: 2 };
  }
  const pharmacode = PHARMACODE_PATTERN.exec(description)?.[1];
  if (pharmacode !== undefined) {
    return { id: pharmacode, idType: 3 };
  }
  const cleaned = description.replace(/\s{2,}/g, ' ').trim();
  if (cleaned === '') {
    return undefined;
  }
  return { id: clip(cleaned, 120), idType: 1 };
}

/** Four-slot dosage vector; `invalid` carries the cell that could not be read. */
function dosageVector(
  cells: readonly string[],
  layout: ColumnLayout,
): { doses?: number[]; invalid?: string } {
  const { morning, noon, evening, night } = layout;
  if (
    morning === undefined ||
    noon === undefined ||
    evening === undefined ||
    night === undefined
  ) {
    return {};
  }
  const raw = [
    readCell(cells, morning),
    readCell(cells, noon),
    readCell(cells, evening),
    readCell(cells, night),
  ];
  if (raw.every((value) => value === '')) {
    return {};
  }
  if (SEE_INSTRUCTIONS_PATTERN.test(raw.join(' '))) {
    return {};
  }
  const doses: number[] = [];
  for (const value of raw) {
    const dose = parseDose(value);
    if (dose === undefined) {
      return { invalid: value };
    }
    doses.push(dose);
  }
  if (doses.every((dose) => dose === 0)) {
    return {};
  }
  return { doses };
}

function parseMedicamentCells(
  cells: readonly string[],
  layout: ColumnLayout,
  rowIndex: number,
  errors: ParseError[],
): MedicamentRx | undefined {
  const description = readCell(cells, layout.medication);
  if (description === '') {
    return undefined;
  }
  const identity = parseMedicamentId(description);
  if (identity === undefined) {
    return undefined;
  }

  const medicament: MedicamentRx = { Id: identity.id, IdType: identity.idType };
  const unit = readCell(cells, layout.quantity);
  if (!isBlankCell(unit)) {
    medicament.Unit = unit;
  }
  const instructions = readCell(cells, layout.instructions);
  if (!isBlankCell(instructions)) {
    medicament.AppInstr = instructions;
  }
  const extras = readExtras(cells);
  if (extras.rep !== undefined) {
    medicament.Rep = extras.rep;
  }
  if (extras.subs !== undefined) {
    medicament.Subs = extras.subs;
  }
  if (extras.nbPack !== undefined) {
    medicament.NbPack = extras.nbPack;
  }
  if (extras.indC !== undefined) {
    medicament.IndC = extras.indC;
  }

  const endRaw = readCell(cells, layout.upTo);
  let endDate: string | undefined;
  // A blank or printed-dash end cell means "no end date": the row keeps no
  // `DtTo` instead of failing on an `invalid-value`. The German sample's `Von`
  // (from) column is never read as an end date: `ColumnLayout` has no `from`
  // index at all, so the value is consumed and dropped with the cell.
  if (!isBlankCell(endRaw)) {
    endDate = extractDate(endRaw);
    if (endDate === undefined) {
      errors.push({
        code: 'invalid-value',
        path: `/Medicaments/${rowIndex}/Pos/0/DtTo`,
        message: `Cannot read the end date "${clip(endRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    }
  }

  const dosage = dosageVector(cells, layout);
  if (dosage.invalid !== undefined) {
    errors.push({
      code: 'invalid-value',
      path: `/Medicaments/${rowIndex}/Pos/0/D`,
      message: `Cannot read the dose "${clip(dosage.invalid, 40)}"; expected a number or one of ½, 1/3, ¼, 2/3, ¾, 1/8.`,
    });
  }

  if (endDate !== undefined || dosage.doses !== undefined) {
    const posology: PosologyRx = {};
    if (endDate !== undefined) {
      posology.DtTo = endDate;
    }
    if (dosage.doses !== undefined) {
      posology.D = dosage.doses;
    }
    medicament.Pos = [posology];
  }

  return medicament;
}

function parseMedicamentRows(
  lines: readonly string[],
  headerIndex: number,
  layout: ColumnLayout,
): { medicaments: MedicamentRx[]; errors: ParseError[]; prescribers: string[] } {
  const medicaments: MedicamentRx[] = [];
  const errors: ParseError[] = [];
  const prescribers: string[] = [];
  // A second table (`Reservemedikation`) re-prints the column titles, possibly
  // at different x positions but in the same order; re-deriving the layout from
  // its own header keeps index-based reads honest across tables.
  let activeLayout = layout;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') {
      continue;
    }
    if (
      COMMENT_STOP_PATTERN.test(line) ||
      PAGE_MARKER_PATTERN.test(line) ||
      FOOTER_GENERATOR_PATTERN.test(line)
    ) {
      break;
    }
    if (RESERVE_TITLE_PATTERN.test(line)) {
      // Printed table title of the reserve table: a marker, not a row.
      continue;
    }
    const cells = splitColumns(line);
    if (cells.length < 2) {
      continue;
    }
    const repeated = layoutFor(cells);
    if (repeated !== undefined) {
      // Repeated column titles on a following page or of a following table
      // (`chmed16a/README.md:1731`).
      activeLayout = repeated;
      continue;
    }
    const medicament = parseMedicamentCells(cells, activeLayout, medicaments.length, errors);
    if (medicament !== undefined) {
      medicaments.push(medicament);
      // The `Prescribed by` cell is not an Rx medicament field; it is collected
      // only to infer the document author (`uniquePrescriber`).
      const prescriber = readCell(cells, activeLayout.prescribedBy);
      if (!isBlankCell(prescriber)) {
        prescribers.push(prescriber);
      }
    }
  }

  return { medicaments, errors, prescribers };
}

/* -------------------------------------------------------------------------- */
/* Tolerant single-spaced table                                               */
/* -------------------------------------------------------------------------- */

/** One whitespace-delimited token of a row, with its offset in the line. */
interface RowToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function tokenizeRow(line: string): RowToken[] {
  const tokens: RowToken[] = [];
  for (const match of line.matchAll(/\S+/gu)) {
    const start = match.index ?? 0;
    tokens.push({ text: match[0], start, end: start + match[0].length });
  }
  return tokens;
}

/** Titles printed as two words, which no single-token matcher can see. */
const TOLERANT_TITLE_PAIRS: ReadonlyArray<
  readonly [RegExp, RegExp, ColumnKey]
> = [
  [/^up$/i, /^to(?=$|[\s(])/i, 'upTo'],
  [/^prescribed$/i, /^by$/i, 'prescribedBy'],
];

/**
 * Recognized column titles of a single-spaced header line.
 *
 * Single-token titles are read through the shared {@link COLUMN_MATCHERS}
 * vocabulary, so every title it knows — including the 2023 German
 * `Anwendungsinstruktion` / `Anwendungsgrund` — is recognized here as well;
 * `TOLERANT_TITLE_PAIRS` only adds the titles printed as two words.
 */
function tolerantTitles(line: string): Set<ColumnKey> {
  const titles = new Set<ColumnKey>();
  const tokens = line.split(/\s+/).filter((token) => token !== '');
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    for (const [key, pattern] of COLUMN_MATCHERS) {
      if (titles.has(key)) {
        continue;
      }
      if (pattern.test(token)) {
        titles.add(key);
        break;
      }
    }
    const next = tokens[index + 1] ?? '';
    for (const [first, second, key] of TOLERANT_TITLE_PAIRS) {
      if (!titles.has(key) && first.test(token) && second.test(next)) {
        titles.add(key);
      }
    }
  }
  return titles;
}

/**
 * True when `line` is a single-spaced header row: it starts with a medication
 * title and carries at least four recognized titles, including all four dose
 * columns the token window relies on. Requiring the four dose titles is what
 * keeps a stray line such as `Medication Morning Noon Evening` from being
 * treated as a table.
 */
function isTolerantHeaderLine(line: string): boolean {
  const first = line.trim().split(/\s+/, 1)[0] ?? '';
  if (!MEDICATION_TITLE_START.test(first)) {
    return false;
  }
  const titles = tolerantTitles(line);
  return (
    titles.size >= 4 &&
    titles.has('medication') &&
    titles.has('morning') &&
    titles.has('noon') &&
    titles.has('evening') &&
    titles.has('night')
  );
}

/**
 * Finds the single-spaced header of the medication table. Only consulted when
 * the strict detector found nothing, so a properly separated layout always
 * keeps priority.
 */
function findTolerantHeader(
  lines: readonly string[],
): { index: number; layout: TolerantLayout } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '' || !isTolerantHeaderLine(line)) {
      continue;
    }
    const titles = tolerantTitles(line);
    return {
      index,
      layout: {
        hasFrom: titles.has('from'),
        hasReason: titles.has('reason'),
        hasPrescribedBy: titles.has('prescribedBy'),
      },
    };
  }
  return undefined;
}

/** First run of four consecutive dose tokens: the Morning..Night window. */
function doseWindow(tokens: readonly RowToken[]): number | undefined {
  for (let index = 0; index + 3 < tokens.length; index += 1) {
    if (
      DOSE_TOKEN_PATTERN.test(tokens[index]?.text ?? '') &&
      DOSE_TOKEN_PATTERN.test(tokens[index + 1]?.text ?? '') &&
      DOSE_TOKEN_PATTERN.test(tokens[index + 2]?.text ?? '') &&
      DOSE_TOKEN_PATTERN.test(tokens[index + 3]?.text ?? '')
    ) {
      return index;
    }
  }
  return undefined;
}

/**
 * Peels the free-text columns from a single-spaced trailing run.
 *
 * `Reason` and `Prescribed by` have no Rx `MedicamentRx` field. With the column
 * gaps gone their only remaining signal is position, so an honorific token
 * starts `Prescribed by`, the last word before it is the short printed `Reason`
 * label, and the rest is `Instructions`. Without an honorific the last word is
 * the printed `Prescribed by` label itself (e.g. `Selbstmedikation`), which the
 * strict path reads as a cell. Text is never invented; at worst a multi-word
 * `Reason` shortens the instruction by the same number of words, which is why an
 * OCR result is always reported as low confidence.
 *
 * The peeled `Prescribed by` run is returned as well because the author
 * inference (`uniquePrescriber`) must see exactly the same evidence on the
 * tolerant path as the strict path feeds it from a cell.
 */
function tailFields(
  tokens: readonly string[],
  layout: TolerantLayout,
): { instructions: string; prescriber: string } {
  let end = tokens.length;
  let prescriber = '';
  const honorific = tokens.findIndex((token) => HONORIFIC_TOKEN_PATTERN.test(token));
  if (honorific >= 0) {
    end = honorific;
    prescriber = tokens.slice(honorific).join(' ');
  } else if (layout.hasPrescribedBy && end > 0) {
    // No honorific: `Prescribed by` printed a short label ("Self-medication").
    end -= 1;
    prescriber = tokens[end] ?? '';
  }
  if (layout.hasReason && end > 0) {
    end -= 1;
  }
  return { instructions: tokens.slice(0, end).join(' '), prescriber };
}

/**
 * One single-spaced row → medicament (and the peeled `Prescribed by` run), or
 * `undefined` when the line is not a medication row. Mirrors
 * `parseMedicamentCells`: identity, unit, instructions, end date and the dose
 * vector, with the same typed errors for unreadable values.
 */
function parseTolerantRow(
  line: string,
  layout: TolerantLayout,
  rowIndex: number,
  errors: ParseError[],
): { medicament: MedicamentRx; prescriber: string } | undefined {
  const tokens = tokenizeRow(line);
  const window = doseWindow(tokens);

  let description: string;
  let rest: string;
  let doses: number[] | undefined;
  let invalidDose: string | undefined;

  if (window !== undefined) {
    const first = tokens[window];
    const last = tokens[window + 3];
    if (first === undefined || last === undefined) {
      return undefined;
    }
    description = line.slice(0, first.start).trim();
    rest = line.slice(last.end).trim();

    const parsed: number[] = [];
    for (const token of tokens.slice(window, window + 4)) {
      const dose = parseDose(token.text);
      if (dose === undefined) {
        invalidDose = token.text;
      } else {
        parsed.push(dose);
      }
    }
    if (invalidDose === undefined && !parsed.every((dose) => dose === 0)) {
      doses = parsed;
    }
  } else {
    // A row whose dose cells say "See instructions": the phrase ends the
    // medication description and there is no dose vector to read.
    const see = SEE_INSTRUCTIONS_PATTERN.exec(line);
    if (see === null) {
      return undefined;
    }
    description = line.slice(0, see.index).trim();
    rest = line.slice(see.index + see[0].length).trim();
  }

  const identity = parseMedicamentId(description);
  if (identity === undefined) {
    return undefined;
  }

  const medicament: MedicamentRx = { Id: identity.id, IdType: identity.idType };

  const tail = tokenizeRow(rest);
  let cursor = 0;
  const quantity = tail[cursor];
  if (quantity !== undefined && !DATE_TOKEN_PATTERN.test(quantity.text)) {
    // A printed dash in the unit cell means "no unit" (same as an empty cell).
    if (!DASH_CELL_PATTERN.test(quantity.text)) {
      medicament.Unit = quantity.text;
    }
    cursor += 1;
  }
  if (layout.hasFrom) {
    const from = tail[cursor];
    if (
      from !== undefined &&
      (DATE_TOKEN_PATTERN.test(from.text) || DASH_CELL_PATTERN.test(from.text))
    ) {
      // The printed `From` column has no Rx field: consume it, never `DtTo`.
      cursor += 1;
    }
  }
  let endRaw = '';
  const upTo = tail[cursor];
  if (upTo !== undefined && DATE_TOKEN_PATTERN.test(upTo.text)) {
    endRaw = upTo.text;
    cursor += 1;
  } else if (upTo !== undefined && DASH_CELL_PATTERN.test(upTo.text)) {
    cursor += 1;
  }

  const fields = tailFields(
    tail.slice(cursor).map((token) => token.text),
    layout,
  );
  if (!isBlankCell(fields.instructions)) {
    medicament.AppInstr = fields.instructions;
  }

  let endDate: string | undefined;
  if (endRaw !== '') {
    endDate = extractDate(endRaw);
    if (endDate === undefined) {
      errors.push({
        code: 'invalid-value',
        path: `/Medicaments/${rowIndex}/Pos/0/DtTo`,
        message: `Cannot read the end date "${clip(endRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    }
  }
  if (invalidDose !== undefined) {
    errors.push({
      code: 'invalid-value',
      path: `/Medicaments/${rowIndex}/Pos/0/D`,
      message: `Cannot read the dose "${clip(invalidDose, 40)}"; expected a number or one of ½, 1/3, ¼, 2/3, ¾, 1/8.`,
    });
  }

  if (endDate !== undefined || doses !== undefined) {
    const posology: PosologyRx = {};
    if (endDate !== undefined) {
      posology.DtTo = endDate;
    }
    if (doses !== undefined) {
      posology.D = doses;
    }
    medicament.Pos = [posology];
  }

  return { medicament, prescriber: fields.prescriber };
}

/** Reads the rows below a tolerant header, skipping repeated header lines. */
function parseTolerantMedicamentRows(
  lines: readonly string[],
  headerIndex: number,
  layout: TolerantLayout,
): { medicaments: MedicamentRx[]; errors: ParseError[]; prescribers: string[] } {
  const medicaments: MedicamentRx[] = [];
  const errors: ParseError[] = [];
  const prescribers: string[] = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') {
      continue;
    }
    if (
      COMMENT_STOP_PATTERN.test(line) ||
      PAGE_MARKER_PATTERN.test(line) ||
      FOOTER_GENERATOR_PATTERN.test(line)
    ) {
      break;
    }
    if (RESERVE_TITLE_PATTERN.test(line)) {
      continue;
    }
    if (isTolerantHeaderLine(line)) {
      // Repeated column titles on a following page (`chmed16a/README.md:1731`).
      continue;
    }
    const parsedRow = parseTolerantRow(line, layout, medicaments.length, errors);
    if (parsedRow !== undefined) {
      medicaments.push(parsedRow.medicament);
      if (!isBlankCell(parsedRow.prescriber)) {
        prescribers.push(parsedRow.prescriber);
      }
    }
  }

  return { medicaments, errors, prescribers };
}

/* -------------------------------------------------------------------------- */
/* Entries                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Finds the medication column header and its layout. Requires `Medication` plus
 * at least three other known titles, which makes the layout requirement an
 * explicit, fail-closed detection step (`unsupported-layout` otherwise).
 */
function findMedicationHeader(
  lines: readonly string[],
): { index: number; layout: ColumnLayout } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') {
      continue;
    }
    const layout = layoutFor(splitColumns(line));
    if (layout !== undefined) {
      return { index, layout };
    }
  }
  return undefined;
}

function unsupported(message: string): PrescriptionParseResult {
  return {
    ok: false,
    errors: [{ code: 'unsupported-layout', path: '', message }],
  };
}

/**
 * UUID v4 from the platform CSPRNG.
 *
 * Fails closed (`undefined`) when the environment offers neither
 * `crypto.randomUUID` nor `crypto.getRandomValues`: a prescription id must not
 * be predicted from `Math.random`, so the caller turns this into an
 * `invalid-value` parse error instead.
 */
function newUuid(): string | undefined {
  const source = globalThis.crypto;
  if (source === undefined) {
    return undefined;
  }
  if (typeof source.randomUUID === 'function') {
    return source.randomUUID();
  }
  if (typeof source.getRandomValues !== 'function') {
    return undefined;
  }
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  const version = bytes[6];
  if (version !== undefined) {
    bytes[6] = (version & 0x0f) | 0x40;
  }
  const variant = bytes[8];
  if (variant !== undefined) {
    bytes[8] = (variant & 0x3f) | 0x80;
  }
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseInternal(text: string): PrescriptionParseResult {
  if (typeof text !== 'string' || text.trim() === '') {
    return unsupported('The text is empty; no eMediplan paper layout was found.');
  }

  const lines = normalizeLines(text);
  const strictHeader = findMedicationHeader(lines);
  const tolerantHeader =
    strictHeader === undefined ? findTolerantHeader(lines) : undefined;

  let headerIndex: number;
  let rows: { medicaments: MedicamentRx[]; errors: ParseError[]; prescribers: string[] };
  if (strictHeader !== undefined) {
    headerIndex = strictHeader.index;
    rows = parseMedicamentRows(lines, headerIndex, strictHeader.layout);
  } else if (tolerantHeader !== undefined) {
    headerIndex = tolerantHeader.index;
    rows = parseTolerantMedicamentRows(lines, headerIndex, tolerantHeader.layout);
  } else {
    return unsupported(
      'No medication column header ("Medication", "Morning", ...) was found; the text is not a printed eMediplan paper layout.',
    );
  }

  const scan = scanHeader(lines.slice(0, headerIndex));
  const errors: ParseError[] = [];

  const fName = scan.patient.fName;
  const lName = scan.patient.lName;
  const bDt = scan.patient.bDt;
  if (fName === undefined) {
    errors.push({
      code: 'missing-field',
      path: '/Patient/FName',
      message: 'The patient block has no first name.',
    });
  }
  if (lName === undefined) {
    errors.push({
      code: 'missing-field',
      path: '/Patient/LName',
      message: 'The patient block has no last name.',
    });
  }
  if (bDt === undefined) {
    if (scan.patient.bDtRaw !== undefined) {
      errors.push({
        code: 'invalid-value',
        path: '/Patient/BDt',
        message: `Cannot read the birth date "${clip(scan.patient.bDtRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    } else {
      errors.push({
        code: 'missing-field',
        path: '/Patient/BDt',
        message: 'The patient block has no "Born on:" date.',
      });
    }
  }

  const { medicaments, errors: rowErrors } = rows;
  errors.push(...rowErrors);
  if (medicaments.length === 0) {
    errors.push({
      code: 'missing-field',
      path: '/Medicaments',
      message: 'No medication row was found below the column header.',
    });
  }

  const issueDate = scan.issueDate;
  if (issueDate === undefined) {
    errors.push({
      code: 'missing-field',
      path: '/Dt',
      message: 'The document has no readable "Issue date:".',
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  // The checks above guarantee these values; the guard keeps the types honest
  // without an assertion or a non-null assertion.
  if (fName === undefined || lName === undefined || bDt === undefined || issueDate === undefined) {
    return {
      ok: false,
      errors: [{ code: 'missing-field', path: '', message: 'The prescription is incomplete.' }],
    };
  }

  const patient: PatientRx = { FName: fName, LName: lName, BDt: bDt };
  if (scan.patient.gender !== undefined) {
    patient.Gender = scan.patient.gender;
  }
  if (scan.patient.street !== undefined) {
    patient.Street = scan.patient.street;
  }
  if (scan.patient.zip !== undefined) {
    patient.Zip = scan.patient.zip;
  }
  if (scan.patient.city !== undefined) {
    patient.City = scan.patient.city;
  }
  if (scan.patient.phone !== undefined) {
    patient.Phone = scan.patient.phone;
  }
  if (scan.patient.email !== undefined) {
    patient.Email = scan.patient.email;
  }

  const provider = buildProvider(scan.provider);

  let id = scan.id;
  if (id === undefined) {
    id = newUuid();
    if (id === undefined) {
      return {
        ok: false,
        errors: [
          {
            code: 'invalid-value',
            path: '/Id',
            message:
              'Cannot generate a prescription id: this browser provides neither crypto.randomUUID nor crypto.getRandomValues.',
          },
        ],
      };
    }
  }

  const value: MedicationRx = {
    rev: 3,
    MedType: 3,
    Id: id,
    Auth: provider.auth,
    Dt: issueDate,
    Patient: patient,
    Medicaments: medicaments,
  };
  if (provider.hcPerson !== undefined) {
    value.HcPerson = provider.hcPerson;
  } else {
    // Fix round 3: the document-level author block is unnamed, but exactly one
    // prescriber is printed on the medication rows. `HcPerson.Gln` is required
    // by revision 2+ (`chmed16a/prescription.md:761-788`), so the inference
    // borrows only an explicitly printed GLN; without one no `HcPerson` is
    // created and the validator keeps reporting the gap.
    const author = uniquePrescriber(rows.prescribers);
    if (author !== undefined && scan.provider.gln !== undefined) {
      const hcPerson: HealthcarePerson = {
        Gln: scan.provider.gln,
        FName: author.fName,
        LName: author.lName,
      };
      if (scan.provider.zsr !== undefined) {
        hcPerson.Zsr = scan.provider.zsr;
      }
      value.HcPerson = hcPerson;
    }
  }
  if (provider.hcOrg !== undefined) {
    value.HcOrg = provider.hcOrg;
  }

  const warnings: ValidationWarning[] = [];
  if (provider.auth === '') {
    warnings.push({
      code: 'empty-string',
      path: '/Auth',
      message:
        'No provider GLN was detected; "Auth" is empty and the validator reports it as a non-blocking warning.',
    });
  }

  return { ok: true, value, warnings };
}

/**
 * Parses normalized eMediplan paper-layout text into a rev-3 ePrescription.
 *
 * Never throws: malformed, hostile or non-layout input is reported as
 * `{ ok: false, errors }`. The success result always carries `rev: 3`,
 * `MedType: 3`, an `Id` (printed UUID when one is detected, otherwise a fresh
 * cryptographic UUID v4) and an `Auth` string derived from the provider GLN. If
 * the environment has no CSPRNG at all, the parse fails closed with
 * `invalid-value` at `/Id` rather than inventing a predictable id.
 *
 * `HcPerson` comes from the provider block when it names a person next to a
 * printed GLN; otherwise a single distinct printed prescriber supplies the name
 * (`uniquePrescriber`) while the GLN still has to be printed. An ambiguous
 * document yields no `HcPerson` at all, so revision-3 validation surfaces the
 * gap instead of the parser choosing an author.
 */
export function parsePrescriptionText(text: string): PrescriptionParseResult {
  try {
    return parseInternal(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [
        {
          code: 'invalid-value',
          path: '',
          message: `The eMediplan text could not be read: ${clip(detail, 160)}`,
        },
      ],
    };
  }
}
