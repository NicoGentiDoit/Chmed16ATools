/**
 * Normalized eMediplan paper-layout text → CHMED16A Medication Plan (MP).
 *
 * This module is a **pure decision layer**: it performs no I/O, has no
 * dependency on a PDF/OCR adapter and never touches the DOM. It consumes the
 * text produced by the Phase 2 normalizer (`pdf-extract.ts` /
 * `pdf-to-prescription.ts`) and returns either a `MedicationMp` object or a
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
 * Both paths produce the same `MedicationMp` (or typed `ParseError[]`), and both
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
 *    cannot be separated without their gaps, so trailing columns are peeled
 *    from the right: a `Dr.`/`Prof.`/`med.` honorific starts `Prescribed by`,
 *    the last word before it is the printed `Reason` label, and the rest is
 *    `Instructions`. That heuristic is why an OCR result is always reported
 *    with the low-confidence warning; it never invents text.
 *
 * Spec anchors:
 * - `chmed16a/README.md:1664-1723` — patient and service-provider blocks.
 * - `chmed16a/README.md:1735-1745` — medication columns.
 * - `chmed16a/README.md:1753` — issue date.
 * - `chmed16a/README.md:207-400` — MP root object (`MedType: 1`).
 * - `chmed16a/README.md:925-1086` — `MedicamentMp`.
 * - `chmed16a/README.md:1087-1186` — `PosologyMp` (`DtFrom` is required).
 *
 * ## Column mapping (`chmed16a/README.md:1735-1745`)
 *
 * | Printed column            | Target                                    |
 * | ------------------------- | ----------------------------------------- |
 * | Medication                | `MedicamentMp.Id` / `.IdType`              |
 * | Morning/Noon/Evening/Night| `Pos[0].D` (4 slots, fractions → decimal) |
 * | Quantity                  | `MedicamentMp.Unit` (normalized)           |
 * | From                      | `Pos[0].DtFrom` (`DD.MM.YYYY` → ISO)       |
 * | Up to and including       | `Pos[0].DtTo`                              |
 * | Instructions              | `MedicamentMp.AppInstr`                    |
 * | Reason                    | `MedicamentMp.TkgRsn`                      |
 * | Prescribed by             | `MedicamentMp.PrscbBy` / `AutoMed`          |
 * | Reserve medication        | `Pos[0].InRes` (reserve band or `(#)` name) |
 *
 * `Rep`, `Subs`, `NbPack` and `IndC` are Rx-only fields: MP has no counterpart,
 * so explicit `Rep: 3`-style cells are deliberately ignored.
 *
 * ## Swissmedic identity from link annotations (phase 4)
 *
 * The reference PDF carries the Swissmedic product ids *only* in the Link
 * annotations of the medication names, not in the text layer. The extraction
 * adapter (`pdf-extract.ts`) harvests those annotations and the pipeline passes
 * them, together with the tabulated row geometry, as an optional
 * {@link PdfAnnotationContext}. `mapAnnotationsToRows` binds an annotation to a
 * row by geometry (vertical row band + first-column x band); a unique match
 * emits `Id: "<product id>", IdType: 4`. A row without an unambiguous match
 * keeps the printed-text id (`IdType: 1`, or 2/3 for a printed GTIN/pharmacode).
 * Annotations exist only when a text layer exists, so the OCR fallback is
 * text-only by construction and this is not reported as a warning.
 *
 * ## Medicament heuristics (phase 2)
 *
 * - **`Unit`**: the printed quantity cell is normalized through a small
 *   dictionary. The *first token* decides, because the geometry tabulator can
 *   leak the substance line into the unit cell (`Milligramm Atorvastatin` must
 *   become `mg`); trailing text is discarded. `Milligramm`→`mg`,
 *   `Stück`→`Stk`, `Milliliter`/`ml`→`ml`. A printed dash stays the literal
 *   `-` (the reference document keeps `"Unit":"-"` for a wrap). A cell that is
 *   genuinely blank stays `''` (schema-required placeholder). Recognized
 *   identity units (e.g. `Tablet`, `Capsule`) are kept verbatim; any other text
 *   is kept verbatim with a warning rather than being guessed.
 * - **`Roa`**: a printed `i.m.` (also `i.m./i.v.`) means `IM`; a printed oral
 *   form (`Filmtabl`, `Tabl`, `Tablette`, `Tabletten`, capsules) means `PO`;
 *   with no counter-evidence the default is `PO` (the reference's oral rows).
 *   A row whose description names a non-oral form (`Wickel`, `Salbe`,
 *   `Tropfen`, `Spray`, `Inj`, …) has no derivable route: `Roa` is omitted and
 *   a warning is surfaced instead of guessing. This never invents a route.
 * - **`AutoMed` / `PrscbBy`**: a `Prescribed by` cell that starts with a
 *   self-medication marker (`Selbstmedikation`, `Self-medication`, …) sets
 *   `AutoMed: 1` and omits `PrscbBy`; any other non-empty cell becomes
 *   `PrscbBy` verbatim. `PrscbBy` is never set to the marker itself.
 * - **`InRes`**: set on the row's posology for the whole `Reservemedikation`
 *   band. The band is detected by a literal reserve title when present, or by
 *   a repeated column header that follows data rows *on the same page* (the
 *   geometry tabulator drops the title but re-emits the header). A `(#)` in the
 *   medication name also marks the row as reserve medication.
 *
 * ## Header heuristics
 *
 * - Patient: `First name:` / `Last name:` labels, or the unlabelled name line
 *   directly above `Born on: DD.MM.YYYY (M|F)`; the address line directly below
 *   it is read as `Street, Zip City / Phone` (`README.md:1672`).
 * - Provider: `GLN:` (13 digits) becomes `Auth`; `Created by:`, `Organisation:`
 *   / `Praxis:` / `Apotheke:` and the provider address block are still consumed
 *   so their labels cannot leak into the patient block, but MP has no
 *   provider-identity field to store them in. With no printed GLN, `Auth` is
 *   the locked literal `"patient"`; a GLN is never fabricated.
 * - Issue date: `Issue date: DD.MM.YYYY [hh:mm[:ss]]` (`README.md:1753`). A
 *   printed time is emitted as an ISO date-time with the Swiss local offset
 *   (see below); a date-only value stays date-only because the MP schema
 *   accepts a string and no midnight is invented.
 * - Medical block: `Körpergrösse / Gewicht:` is read from one line (weight =
 *   Type 1/Unit 2 first, height = Type 2/Unit 1) and the printed risk lines
 *   become `Patient.Med.Rc` (renal stage, diabetes type, allergy group).
 * - Language: `Patient.Lng` comes from the vocabulary actually matched (German
 *   and the English base vocabulary); an unsupported language keeps `''` plus
 *   a warning (French/Italian detection is deferred to the i18n plan).
 * - Remark: `Bemerkung:` (and its wrapped lines up to the footer) becomes the
 *   root `Rmk`, verbatim. The geometry tabulator stops at that header by design,
 *   so the pipeline also supplies the flat rendering as a remark-only fallback.
 * - Medication: the `Medication`-anchored header row plus at least three other
 *   known titles. Unknown or absent columns are skipped and optional fields are
 *   omitted instead of being emitted as empty strings.
 *
 * ## Risk mapping (phase 3)
 *
 * `Rc` entries are only emitted for printed items whose id is derivable:
 * - renal insufficiency `leicht` / `mittelschwer` / `schwer` / `terminal` →
 *   RC 1 with 577 / 576 / 575 / 597 (`README.md:819-848`);
 * - diabetes `Typ 1` / `Typ 2` → RC 7 with 779 / 780; `Unbekannt` has no
 *   specified code and is surfaced as a warning (`README.md:911-922`);
 * - a penicillin-group allergy → RC 6 (`README.md:793`). The README delegates
 *   allergy ids to the external CDSCODE `CHA` list (`README.md:809,906`); its
 *   allergy example carries 571 (`README.md:1524-1528`) and the probe reference
 *   carries `{Id:6,R:[571]}`, so the penicillin group emits that one code.
 *
 * Risk categories the reference carries without a printed source are never
 * filled in: an unprinted category is "unknown" by specification
 * (`README.md:807`), not an invented exclusion.
 *
 * ## Deliberate parsing policy
 *
 * - Missing patient/issue-date/medication data is a blocking `missing-field`.
 * - An unreadable date or dose is a blocking `invalid-value` (fail closed).
 * - `MedType` is always `1`; the PDF path never emits the Rx-only `rev`,
 *   `HcPerson` or `HcOrg` (`chmed16a/README.md:207-400`).
 * - MP makes `Patient.Lng`, `MedicamentMp.Unit` and `PosologyMp.DtFrom`
 *   required. Values the printed page genuinely does not provide are emitted
 *   as an empty string, never invented: the validator reports them as
 *   non-blocking `empty-string` warnings. `DtFrom` is filled from the printed
 *   `Von` column; a row that genuinely has no printed start date keeps the `''`
 *   placeholder plus a parser warning. Dropping the dose vector just because
 *   its start date is missing would lose printed data, so the placeholder is
 *   the honest form.
 * - A printed dash in a dose cell is the printed form of zero; a row whose four
 *   dose cells are all dashes keeps `D: [0,0,0,0]` because the printed columns
 *   exist (a row with four genuinely blank cells keeps no `D`).
 * - The provider GLN becomes `Auth`; when nothing is printed, `Auth` is the
 *   literal `"patient"` (locked policy) and no warning is raised.
 *
 * ## Swiss local offset
 *
 * A printed date-time is emitted as `YYYY-MM-DDThh:mm:ss+01:00` (CET) or
 * `+02:00` (CEST). Switzerland follows the EU DST rule: last Sunday of March
 * 01:00 UTC through last Sunday of October 01:00 UTC. The offset is resolved
 * with a two-candidate test: the wall time is read once as CET (`T − 60 min`)
 * and once as CEST (`T − 120 min`), and a candidate is accepted only when that
 * UTC instant really falls in its own window. When both candidates are valid
 * (the autumn overlap) `+01:00` is chosen; when neither is valid (the spring
 * gap) the historical "wall time as UTC" convention is kept.
 */

import type {
  MedicalData,
  Measurement,
  MedicationMp,
  MedicamentMp,
  PatientMp,
  PosologyMp,
  RiskCategory,
} from './types';
import type { ValidationWarning } from './validate';

/**
 * Values a localized finding template interpolates (i18n plan 007, phase 8).
 *
 * Only values the document itself printed are ever passed here: a template
 * echoes them inside quotes, it never re-words them. Bounding (`clip`) and
 * escaping stay with the core and the renderer that already owned them.
 */
export type ParseFindingParams = Readonly<Record<string, string | number>>;

/**
 * Stable sub-code of a blocking parse finding.
 *
 * `code` stays the coarse taxonomy the UI narrows on (`unsupported-layout`
 * decides the stage headline, `invalid-value` vs `missing-field` the wording);
 * the detail names the exact message so the UI can localize it without reading
 * the English prose. One code covers many messages, so the detail is what makes
 * the mapping total. Never renumber, rename or remove an entry: the UI keys are
 * keyed by it.
 */
export type ParseErrorDetail =
  | 'empty-text'
  | 'no-layout'
  | 'bad-start-date'
  | 'bad-end-date'
  | 'bad-dose'
  | 'bad-birth-date'
  | 'missing-first-name'
  | 'missing-last-name'
  | 'missing-birth-date'
  | 'no-rows'
  | 'missing-issue-date'
  | 'incomplete'
  | 'no-crypto'
  | 'unreadable-text';

/**
 * Stable sub-code of a non-blocking parse warning.
 *
 * Same discipline as {@link ParseErrorDetail}: `unknown-field` and
 * `empty-string` are shared with the validator's taxonomy, so a warning that
 * carries a detail is the parser's own and becomes localizable, while a
 * validator warning (no detail) keeps its English text.
 */
export type ParserWarningDetail =
  | 'missing-weight'
  | 'missing-height'
  | 'renal-unknown'
  | 'diabetes-unknown'
  | 'diabetes-unmatched'
  | 'allergy-unknown'
  | 'unit-unknown'
  | 'unit-identity-leak'
  | 'missing-dtfrom'
  | 'route-undetermined'
  | 'annotation-desync'
  | 'language-undetected';

/** A single reason why the text could not be turned into a prescription. */
export interface ParseError {
  code: 'missing-field' | 'invalid-value' | 'unsupported-layout';
  /** JSON Pointer into the would-be result, e.g. `/Patient/BDt`. */
  path: string;
  /**
   * The English wording, kept verbatim: it is the fallback the UI shows when a
   * locale has no template for `detail` (i18n plan 007, phase 8).
   */
  message: string;
  /** Exact message identity; see {@link ParseErrorDetail}. */
  detail?: ParseErrorDetail;
  /** Document-printed values only; see {@link ParseFindingParams}. */
  params?: ParseFindingParams;
}

/**
 * Non-blocking finding produced by this parser.
 *
 * Structurally a `ValidationWarning` (the result type is unchanged for its
 * consumers) with the additive fields the localized rendering needs. A warning
 * without them is a validator finding and keeps its English text.
 */
export interface ParserWarning extends ValidationWarning {
  /** Exact message identity; see {@link ParserWarningDetail}. */
  detail?: ParserWarningDetail;
  /** Document-printed values only; see {@link ParseFindingParams}. */
  params?: ParseFindingParams;
}

/** A warning's wording plus the stable sub-code and template values. */
interface WarningDraft {
  readonly detail: ParserWarningDetail;
  readonly params?: ParseFindingParams;
  /** English wording, byte-identical to the pre-i18n message. */
  readonly message: string;
}

/** Parsed prescription plus non-blocking findings, or the blocking errors. */
export type PrescriptionParseResult =
  | { ok: true; value: MedicationMp; warnings: ParserWarning[] }
  | { ok: false; errors: ParseError[] };

/**
 * One PDF link annotation, resolved by the extraction adapter.
 *
 * `rect` is normalized to `[min x, min y, max x, max y]` in the same page space
 * the text items are read in (PDF user space, `y` upwards — see
 * `pdf-extract.ts`'s `readBox`). No viewport scaling is applied, because both
 * sources use the same unscaled page space; this is what makes the rect
 * comparable with the tabulated row geometry.
 */
export interface PdfLinkAnnotation {
  /** 1-based page number the annotation belongs to. */
  readonly page: number;
  /** Annotation rectangle in points, normalized to min/max order. */
  readonly rect: readonly [number, number, number, number];
  /** Swissmedic product id parsed from the annotation URI (digits only). */
  readonly productId: string;
}

/**
 * Geometry of one tabulated medication row, in points.
 *
 * `top`/`bottom` are the highest and lowest text baselines of the printed row
 * (the same band `pdf-extract.ts` clusters); `medicationLeft`/`medicationRight`
 * bound the first (Medication) column. The x band is used to keep a link on any
 * other column from matching a medication row.
 */
export interface PdfRowGeometry {
  readonly page: number;
  readonly top: number;
  readonly bottom: number;
  readonly medicationLeft: number;
  readonly medicationRight: number;
}

/**
 * Optional annotation context passed with a tabulated text.
 *
 * `rows` is the geometry of the tabulated row *bands* in document order. The
 * strict parser emits one medicament per printed row band, but a band that
 * yields no medicament (empty description or unreadable identity) would shift
 * every later index — so the consumer verifies `rows.length` equals the
 * produced medicament count and, when it does not, drops every `IdType 4`
 * binding (printed-text identities remain) and surfaces a warning. An OCR-only
 * pipeline has no geometry and never passes this.
 */
export interface PdfAnnotationContext {
  readonly annotations: readonly PdfLinkAnnotation[];
  readonly rows: readonly PdfRowGeometry[];
}

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

/**
 * Printed medical/risk labels of the patient block (`chmed16a/README.md:1685-1703`).
 * The German HCI sample uses the first spelling of each line; the other paper
 * languages are listed because the same vocabulary is recognised by the table
 * titles (`README.md:1786`). Only the items the sample prints are mapped.
 */
const RENAL_LABELS = [
  'niereninsuffizienz',
  'renal insufficiency',
  'insuffisance rénale',
  'insufficienza renale',
];
const DIABETES_LABELS = ['diabetes', 'diabetes mellitus', 'diabète', 'diabete'];
const ALLERGY_LABELS = [
  'allergie',
  'allergie(n)',
  'allergien',
  'allergie(s)',
  'allergy',
  'allergy(ies)',
  'allergies',
];

/**
 * `Height / Weight:` line. The German 2023 sample glues it to the provider
 * city (`9288 Berg Körpergrösse / Gewicht: 180 cm / 81 kg`), so the label is
 * matched anywhere in the line, not only as a `Label: value` prefix.
 */
const MEASUREMENT_LINE_PATTERN =
  /(?:körpergr(?:össe|öße)|height|taille|altezza|grösse|größe)\s*\/\s*(?:gewicht|weight|poids|peso)\s*:\s*(.*)$/iu;
const HEIGHT_VALUE_PATTERN = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:cm|zentimeter)\b/iu;
const WEIGHT_VALUE_PATTERN = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|kilogramm|kilo)\b/iu;

/** The printed risk status words of the patient block (`README.md:1685-1703`). */
const RENAL_STAGE_PATTERNS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(?:leicht|leichte|light|mild|légère|legère|leggera)\b/iu, 577],
  [/\b(?:mittelschwer|mittelschwere|moderate|modérée|moderata)\b/iu, 576],
  [/\b(?:schwer|schwere|severe|sévère|grave)\b/iu, 575],
  [/\bterminal(?:e|es)?\b/iu, 597],
];
const NEGATIVE_STATUS_PATTERN = /^(?:keine|kein|nein|none|no|aucune|nessuna)\b/iu;
const DIABETES_TYPE1_PATTERN = /\b(?:typ|type|diabète de type)\s*1\b/iu;
const DIABETES_TYPE2_PATTERN = /\b(?:typ|type|diabète de type)\s*2\b/iu;
const DIABETES_UNKNOWN_PATTERN = /^(?:unbekannt|unknown|inconnu|sconosciuto|unklar)\b/iu;
/**
 * The allergy text names a penicillin-group drug (the sample prints
 * `Penicillin-Allergie, z.B. Amoxicillin, Flucloxacillin, Piperacillin`).
 * `chmed16a/README.md:809,906` delegates allergy ids to the external CDSCODE
 * (`CHA`) list; the README's own allergy example carries 571, and the probe
 * reference for this PDF carries `{Id:6,R:[571]}`. One group code is emitted,
 * never one code per printed brand (`README.md:1524-1528`).
 */
const PENICILLIN_GROUP_PATTERN =
  /\b(?:penicillin(?:e|s)?|amoxicillin|amoxicilline|flucloxacillin|piperacillin|ampicillin|oxacillin|dicloxacillin|benzylpenicillin|phenoxymethylpenicillin)\b/iu;
const PENICILLIN_GROUP_RISK_ID = 571;

const PROVIDER_SECTION_PATTERN =
  /^(?:service provider|provider|author|created by|printed by|drawn up by)\b/i;
const PATIENT_SECTION_PATTERN =
  /^(?:patient(?:in)?|personal data|patient data|stammdaten|header)\b/i;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const GLN_INLINE_PATTERN = /\bgln\s*[:=]?\s*(\d{13})(?=$|\s|\D)/i;
const HONORIFIC_TOKEN_PATTERN = /^(?:dr|prof|med|dipl|phil|nat|sc|mr|mrs|ms|frau|herr)\.?$/i;

const DATE_INLINE_PATTERN = /\b(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/;
const DMY_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_DATE_PREFIX = /^(\d{1,2}\.\d{1,2}\.\d{4})/;
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
/** Printed issue date with an optional `hh:mm[:ss]` time (`README.md:1753`). */
const ISSUE_DATE_TIME_PATTERN =
  /^(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
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

/**
 * The printed `Prescribed by` values that name no prescriber: self-medication
 * (`chmed16a/README.md:1735-1745`) in the four paper languages.
 *
 * The token is matched as a *prefix* of the cell, with a word boundary after
 * it, because a real layout can glue the printed `Reason` into the same band
 * cell (`Selbstmedikation Fieber`). The anchor at the start stays strict: text
 * that merely contains the word is still read as a value.
 */
const SELF_MEDICATION_PATTERN =
  /^(?:selbstmedikation|self[\s-]?medication|automédication|automedicazione)\b/i;

/** `(#)` in the medication name marks the row as reserve medication. */
const RESERVE_NAME_PATTERN = /\(#\)/;

/**
 * Route-of-administration evidence (`chmed16a/README.md:1032-1043`; the values
 * are CDTYP 26 codes). `IM` wins over the oral forms because the German sample
 * prints `i.m./i.v.` in the medication description.
 */
const IM_ROUTE_PATTERN = /\bi\.\s*m\./i;
const ORAL_FORM_PATTERN =
  /\b(?:filmtabl(?:ette|etten)?|tabl(?:ette|etten)?|tablet(?:te|ten)?|tbl|kapsel(?:n)?|capsule(?:s)?|dragee|dragée)\b/i;
/**
 * Printed forms that are explicitly *not* oral, or whose route cannot be
 * derived from the form word alone. A row that names one of these has no
 * derivable route, so `Roa` is omitted with a warning (never guessed as
 * `PO`): a topical wrap, a solution, an ampoule or a suspension is not an oral
 * tablet. An explicit `i.m.`/`i.v.` token is checked first and still decides
 * (the printed `VALIUM Inj Lös … i.m./i.v.` row stays `IM`).
 */
const NON_ORAL_FORM_PATTERN =
  /(?:tropfen|tropf|drop(?:s)?|spray|salbe|creme|crème|gel|wickel|pflaster|supp(?:ositor(?:ien)?)?|zäpfchen|zaepfchen|inhal(?:ation|ier)?|augen|ohr|inj(?:ektion)?|infusion|infus|lös(?:ung)?|amp(?:ulle)?|emulsion(?:en)?|suspension(?:en)?|i\.\s*v\.)\b/iu;

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
  /**
   * The printed provider GLN. MP has no provider-identity block, so this is the
   * only provider value the document keeps (as the root `Auth`); the provider's
   * name, organisation and address labels are still consumed by the scanner so
   * they cannot be assigned to the patient block.
   */
  gln?: string;
}

interface HeaderScan {
  patient: PatientScan;
  provider: ProviderScan;
  id?: string;
  issueDate?: string;
  /** Parsed `Height / Weight:` members, weight first (reference order). */
  measurements: Measurement[];
  /** Parsed risk categories, in printed order (renal, diabetes, allergy). */
  risks: RiskCategory[];
  /** Non-blocking findings produced while scanning the medical block. */
  warnings: ParserWarning[];
}

interface ColumnLayout {
  medication: number;
  morning?: number;
  noon?: number;
  evening?: number;
  night?: number;
  quantity?: number;
  from?: number;
  upTo?: number;
  instructions?: number;
  /** `Reason` / `Grund` / `Anwendungsgrund` → `TkgRsn`. */
  reason?: number;
  /** `Prescribed by` / `Verordnet durch` → `PrscbBy` or `AutoMed`. */
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

/**
 * Page number of every line returned by {@link normalizeLines}.
 *
 * The pipeline joins tabulated pages with `\f`; the reserve-table detection
 * needs to know whether a repeated column header belongs to the same page as
 * the preceding data row (the dropped `Reservemedikation` title) or opens a new
 * page (a normal table continuation). The line count of each page is preserved
 * by `normalizeLines`, so the two arrays line up index for index.
 */
function linePageIndex(text: string): number[] {
  const pages = text.split('\r\n').join('\n').split('\r').join('\n').split('\f');
  const indices: number[] = [];
  pages.forEach((page, pageIndex) => {
    const lineCount = page.split('\n').length;
    for (let line = 0; line < lineCount; line += 1) {
      indices.push(pageIndex);
    }
  });
  return indices;
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

/** Day number of the last Sunday of a month (`month` is 1-based). */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - weekday;
}

/**
 * Swiss local offset for a printed wall-clock date-time.
 *
 * Switzerland follows the EU rule: CEST starts on the last Sunday of March at
 * 01:00 UTC and ends on the last Sunday of October at 01:00 UTC. A printed wall
 * time maps to two candidate UTC instants, `wall − 1h` (CET) and `wall − 2h`
 * (CEST); a candidate is valid only when that instant actually lies in its own
 * window. Exactly one valid candidate is the answer. Both valid is the autumn
 * overlap and resolves to `+01:00`; neither valid is the spring gap, where the
 * historical wall-as-UTC convention is kept (`+02:00` after the jump).
 */
function swissOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const startsAt = Date.UTC(year, 2, lastSunday(year, 3), 1, 0, 0);
  const endsAt = Date.UTC(year, 9, lastSunday(year, 10), 1, 0, 0);
  const inCest = (instant: number): boolean => instant >= startsAt && instant < endsAt;
  const cetCandidate = wallAsUtc - 60 * 60 * 1000;
  const cestCandidate = wallAsUtc - 120 * 60 * 1000;
  const cetValid = !inCest(cetCandidate);
  const cestValid = inCest(cestCandidate);
  if (cetValid && !cestValid) {
    return '+01:00';
  }
  if (!cetValid && cestValid) {
    return '+02:00';
  }
  if (cetValid && cestValid) {
    // Autumn overlap: the printed hour exists twice. Pick CET deterministically.
    return '+01:00';
  }
  // Spring gap: the printed hour does not exist. Preserve the previous
  // convention, which classifies the wall time as if it were UTC.
  return inCest(wallAsUtc) ? '+02:00' : '+01:00';
}

/**
 * Printed issue date → ISO date, or ISO date-time when the time is printed and
 * valid (`chmed16a/README.md:1753`). A date-only value stays date-only: the MP
 * schema accepts a string, so no midnight is invented.
 */
function parseIssueDate(raw: string): string | undefined {
  const match = ISSUE_DATE_TIME_PATTERN.exec(raw.trim());
  if (match === null) {
    return undefined;
  }
  const date = normalizeDate(match[1] ?? '');
  if (date === undefined) {
    return undefined;
  }
  const hourRaw = match[2];
  const minuteRaw = match[3];
  if (hourRaw === undefined || minuteRaw === undefined) {
    return date;
  }
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = match[4] === undefined ? 0 : Number(match[4]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    // A valid printed date with an unreadable time keeps the date-only form.
    return date;
  }
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return date;
  }
  const offset = swissOffset(year, month, day, hour, minute, second);
  return `${date}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${offset}`;
}

/** `81` / `81,5` → the string the specification stores in `Measurement.Val`. */
function measurementValue(raw: string): string {
  return raw.replace(',', '.');
}

/**
 * One printed `Height / Weight:` line → measurements.
 *
 * Both members are read from the same line because the paper prints them
 * together (`README.md:1696-1697`). The reference order is weight (Type 1,
 * Unit 2 = kg) first, then height (Type 2, Unit 1 = cm), regardless of the
 * printed order. A single printed member is emitted alone; the caller surfaces
 * the missing member as a warning. Text without a unit is not guessed.
 */
function parseMeasurements(raw: string): { measurements: Measurement[]; missing: string[] } {
  const height = HEIGHT_VALUE_PATTERN.exec(raw)?.[1];
  const weight = WEIGHT_VALUE_PATTERN.exec(raw)?.[1];
  const measurements: Measurement[] = [];
  const missing: string[] = [];
  if (weight !== undefined) {
    measurements.push({
      Type: 1,
      Val: measurementValue(weight),
      Unit: 2,
    });
  } else {
    missing.push('weight ("kg")');
  }
  if (height !== undefined) {
    measurements.push({
      Type: 2,
      Val: measurementValue(height),
      Unit: 1,
    });
  } else {
    missing.push('height ("cm")');
  }
  return { measurements, missing };
}

/* -------------------------------------------------------------------------- */
/* Patient medical data (`chmed16a/README.md:759-923`)                       */
/* -------------------------------------------------------------------------- */

/**
 * `Niereninsuffizienz: leicht` → `{Id:1,R:[577]}`.
 *
 * Derivation (README):
 * - RC 1 is renal insufficiency (`README.md:783`, `README.md:819-848`);
 * - light = 577, moderate = 576, severe = 575, terminal = 597
 *   (`README.md:819-848`).
 *
 * An unrecognised stage is omitted with a warning; no code is invented.
 */
function parseRenalRisk(
  value: string,
): { risk?: RiskCategory; warning?: WarningDraft } {
  if (NEGATIVE_STATUS_PATTERN.test(value.trim())) {
    // Explicitly excluded category: `Id` without `R` (`README.md:807`).
    return { risk: { Id: 1 } };
  }
  for (const [pattern, id] of RENAL_STAGE_PATTERNS) {
    if (pattern.test(value)) {
      return { risk: { Id: 1, R: [id] } };
    }
  }
  return {
    warning: {
      detail: 'renal-unknown',
      params: { value: clip(value, 60) },
      message: `The printed renal stage "${clip(value, 60)}" does not match a stage of chmed16a/README.md:819-848; no risk entry was invented.`,
    },
  };
}

/**
 * `Diabetes:` → RC 7 (`README.md:911-922`).
 *
 * Only type 1 (779) and type 2 (780) are specified. `Unbekannt` / `unknown`
 * is not a type and has no risk id, so it is surfaced as a warning and never
 * converted into a measurement or an invented type.
 */
function parseDiabetesRisk(
  value: string,
): { risk?: RiskCategory; warning?: WarningDraft } {
  if (DIABETES_UNKNOWN_PATTERN.test(value.trim())) {
    return {
      warning: {
        detail: 'diabetes-unknown',
        params: { value: clip(value, 40) },
        message: `The printed diabetes status "${clip(value, 40)}" is not one of the specified types (779 = type 1, 780 = type 2, chmed16a/README.md:911-922); no risk entry was invented.`,
      },
    };
  }
  if (NEGATIVE_STATUS_PATTERN.test(value.trim())) {
    return { risk: { Id: 7 } };
  }
  if (DIABETES_TYPE1_PATTERN.test(value)) {
    return { risk: { Id: 7, R: [779] } };
  }
  if (DIABETES_TYPE2_PATTERN.test(value)) {
    return { risk: { Id: 7, R: [780] } };
  }
  return {
    warning: {
      detail: 'diabetes-unmatched',
      params: { value: clip(value, 60) },
      message: `The printed diabetes status "${clip(value, 60)}" does not match a specified type (779/780, chmed16a/README.md:911-922); no risk entry was invented.`,
    },
  };
}

/**
 * `Allergie(n): Penicillin-Allergie, z.B. Amoxicillin, ...` → RC 6.
 *
 * RC 6 is allergies (`README.md:793`). The README does not enumerate allergy
 * ids (they are external CDSCODE `CHA` codes, `README.md:809,906`); its own
 * allergy example carries 571 (`README.md:1524-1528`) and the probe reference
 * for this PDF carries `{Id:6,R:[571]}`. A penicillin-group line therefore
 * emits that ONE group code, never one code per brand. A line with no known
 * group is omitted with a warning.
 */
function parseAllergyRisk(
  value: string,
): { risk?: RiskCategory; warning?: WarningDraft } {
  if (NEGATIVE_STATUS_PATTERN.test(value.trim())) {
    return { risk: { Id: 6 } };
  }
  if (PENICILLIN_GROUP_PATTERN.test(value)) {
    return { risk: { Id: 6, R: [PENICILLIN_GROUP_RISK_ID] } };
  }
  return {
    warning: {
      detail: 'allergy-unknown',
      params: { value: clip(value, 80) },
      message: `The printed allergy "${clip(value, 80)}" has no match in the repository's allergy ids (external CDSCODE list, chmed16a/README.md:809,906); it was omitted.`,
    },
  };
}

/**
 * Printed vocabulary language.
 *
 * The table/field vocabulary is the strongest signal (a German title on an
 * otherwise English sample does not decide the document language). German and
 * English are detected from the vocabulary this parser already understands;
 * French/Italian vocabulary is deliberately left for the i18n plan, so an
 * undetected language keeps the `''` placeholder and a warning.
 */
const LANGUAGE_EVIDENCE: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'de',
    /(?:ausstellungsdatum|geburtsdatum|erstellt von|verordnet|körpergr|niereninsuffizienz|allergie|bemerkung|medikament|morgen|mittag|abend|nacht|einheit|anleitung|anwendungsgrund|der schweizer medikationsplan)/iu,
  ],
  [
    'en',
    /(?:issue date|born on|created by|prescribed by|height \/ weight|renal insufficiency|allergy|medication|morning|noon|evening|night|quantity|reason|reserve medication|up to and including)/iu,
  ],
];

function detectLanguage(lines: readonly string[]): 'de' | 'en' | undefined {
  const scores = new Map<string, number>();
  for (const line of lines) {
    for (const [language, pattern] of LANGUAGE_EVIDENCE) {
      if (pattern.test(line)) {
        scores.set(language, (scores.get(language) ?? 0) + 1);
      }
    }
  }
  let best: string | undefined;
  let bestScore = 0;
  for (const [language, score] of scores) {
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  if (best === 'de' || best === 'en') {
    return best;
  }
  return undefined;
}

/** `Bemerkung: text` / `Bemerkung :` (+ wrapped lines) → root `Rmk`. */
const COMMENT_LABEL_PATTERN =
  /^(?:comment|comments|bemerkung|kommentar|remark|remarks|footer)\s*:\s*(.*)$/i;

/** Stored remark length; the same bound `clip` has always applied. */
const REMARK_LIMIT = 1000;

/**
 * Drops C0 controls that are never part of a printed remark. Tab and line
 * breaks are legitimate whitespace; the rest (NUL, BEL, ESC, DEL, …) are not.
 * A code-point loop avoids a control-character regex (which the lint policy
 * forbids) and is still linear in the line length.
 */
function sanitizeRemarkLine(line: string): string {
  let clean = '';
  for (const char of line) {
    const code = char.codePointAt(0) ?? 0;
    const disallowed =
      code <= 0x08 || (code >= 0x0b && code <= 0x0c) || (code >= 0x0e && code <= 0x1f) || code === 0x7f;
    if (!disallowed) {
      clean += char;
    }
  }
  return clean.trim();
}

function captureRemark(lines: readonly string[]): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = COMMENT_LABEL_PATTERN.exec(lines[index]?.trim() ?? '');
    if (match === null) {
      continue;
    }
    const parts: string[] = [];
    // Bounded accumulation: stop once the projected stored length reaches the
    // clip bound, so a hostile comment cannot grow `parts` without limit. A
    // normal remark is well under the bound and keeps its verbatim text.
    let stored = 0;
    const append = (raw: string): void => {
      if (stored >= REMARK_LIMIT) {
        return;
      }
      const clean = sanitizeRemarkLine(raw);
      if (clean === '') {
        return;
      }
      const separator = parts.length === 0 ? 0 : 1;
      const available = REMARK_LIMIT - stored - separator;
      if (available <= 0) {
        return;
      }
      const kept = clean.slice(0, available);
      if (kept === '') {
        return;
      }
      parts.push(kept);
      stored += separator + kept.length;
    };
    append(match[1] ?? '');
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]?.trim() ?? '';
      if (line === '') {
        continue;
      }
      // The footer follows the comment on the paper; it is pagination, not text.
      if (PAGE_MARKER_PATTERN.test(line) || FOOTER_GENERATOR_PATTERN.test(line)) {
        break;
      }
      // A new labelled field starts the next block, not a comment paragraph.
      if (parseLabel(line) !== undefined) {
        break;
      }
      append(line);
      if (stored >= REMARK_LIMIT) {
        break;
      }
    }
    const text = parts.join('\n').trim();
    return text === '' ? undefined : clip(text, REMARK_LIMIT);
  }
  return undefined;
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
  const scan: HeaderScan = {
    patient: {},
    provider: {},
    measurements: [],
    risks: [],
    warnings: [],
  };
  let state: BlockState = 'other';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') {
      continue;
    }

    // The height/weight line can be glued to the provider address (2023
    // sample), so it is detected before the `Label: value` splitter.
    const measurementLine = MEASUREMENT_LINE_PATTERN.exec(line);
    if (measurementLine !== null) {
      const parsed = parseMeasurements(measurementLine[1] ?? '');
      scan.measurements.push(...parsed.measurements);
      for (const missing of parsed.missing) {
        scan.warnings.push({
          code: 'unknown-field',
          path: '/Patient/Med/Meas',
          // One detail per member: the noun is printed vocabulary-adjacent
          // (`weight`/`height` name the two measurements), so a localized
          // template spells it out instead of interpolating an English word.
          // `missing` carries the unit too (`weight ("kg")`), hence the prefix.
          detail: missing.startsWith('weight') ? 'missing-weight' : 'missing-height',
          message: `The printed height/weight line has no readable ${missing} member; it is omitted instead of being invented.`,
        });
      }
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
      // MP has no provider identity, so the printed `Zsr:` is consumed as a
      // block marker only. Keeping the branch is what makes the following
      // provider address labels land in the provider block.
      state = 'provider';
      continue;
    }
    if (CREATED_BY_LABELS.includes(key)) {
      // The printed author is Rx-only (`HcPerson`); MP has no such field. The
      // branch still marks the provider block for the address labels below.
      state = 'provider';
      continue;
    }
    if (ORG_LABELS.includes(key)) {
      state = 'provider';
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
        scan.issueDate = parseIssueDate(value) ?? clip(value, 40);
      }
      continue;
    }
    if (RENAL_LABELS.includes(key)) {
      const renal = parseRenalRisk(value);
      if (renal.risk !== undefined) {
        scan.risks.push(renal.risk);
      } else if (renal.warning !== undefined) {
        scan.warnings.push({
          code: 'unknown-field',
          path: '/Patient/Med/Rc',
          ...renal.warning,
        });
      }
      continue;
    }
    if (DIABETES_LABELS.includes(key)) {
      const diabetes = parseDiabetesRisk(value);
      if (diabetes.risk !== undefined) {
        scan.risks.push(diabetes.risk);
      } else if (diabetes.warning !== undefined) {
        scan.warnings.push({
          code: 'unknown-field',
          path: '/Patient/Med/Rc',
          ...diabetes.warning,
        });
      }
      continue;
    }
    if (ALLERGY_LABELS.includes(key)) {
      const allergy = parseAllergyRisk(value);
      if (allergy.risk !== undefined) {
        scan.risks.push(allergy.risk);
      } else if (allergy.warning !== undefined) {
        scan.warnings.push({
          code: 'unknown-field',
          path: '/Patient/Med/Rc',
          ...allergy.warning,
        });
      }
      continue;
    }
    if (isAddressLabel(key)) {
      assignAddressField(state === 'provider' ? scan.provider : scan.patient, key, value);
    }
  }

  return scan;
}

/**
 * The provider GLN printed on the document becomes the root `Auth`
 * (`chmed16a/README.md:207-400`).
 *
 * Locked policy (plan 006 phase 3): a printed GLN wins; with no printed GLN the
 * literal `"patient"` is used. MP has no `HcPerson`/`HcOrg`, so the rest of the
 * provider block is consumed by `scanHeader` for block bookkeeping only. A GLN
 * is never fabricated: `"patient"` is the explicit "no provider GLN" marker.
 */
function providerAuth(provider: ProviderScan): string {
  return provider.gln ?? 'patient';
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
    from: indices.get('from'),
    upTo: indices.get('upTo'),
    instructions: indices.get('instructions'),
    reason: indices.get('reason'),
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

/**
 * Printed unit vocabulary → the CDTYP 9 unit the reference document uses.
 *
 * The *first token* of the cell decides: the geometry tabulator can leak the
 * substance line into the unit band (`Milligramm Atorvastatin`), and the
 * reference document normalizes that to `mg`. Trailing leaked text is
 * therefore discarded for a known first token.
 */
const UNIT_TRANSLATIONS: ReadonlyMap<string, string> = new Map([
  ['milligramm', 'mg'],
  ['milligram', 'mg'],
  ['milligrams', 'mg'],
  ['mg', 'mg'],
  ['stück', 'Stk'],
  ['stueck', 'Stk'],
  ['stk', 'Stk'],
  ['milliliter', 'ml'],
  ['ml', 'ml'],
]);

/** Recognized units that are already in their printed form (kept verbatim). */
const IDENTITY_UNITS: ReadonlySet<string> = new Set([
  'tablet',
  'tablets',
  'tablette',
  'tabletten',
  'tbl',
  'capsule',
  'capsules',
  'kapsel',
  'kapseln',
  'tropfen',
  'tropf',
  'drop',
  'drops',
]);

/**
 * The printed quantity cell → `MedicamentMp.Unit`.
 *
 * `Unit` is required by the MP schema (`chmed16a/README.md:925-1086`):
 * - a printed dash stays the literal `-` (the reference keeps `"Unit":"-"` for
 *   a wrap; it is the printed form of an explicit "no unit" cell);
 * - a genuinely blank/absent cell stays `''`, the schema-required placeholder;
 * - a known first token is translated (see `UNIT_TRANSLATIONS`);
 * - a recognized identity unit keeps its printed spelling, but a leaked cell
 *   (`Tabletten Atorvastatin`) keeps only the recognized token: the remainder
 *   is reported as `leaked` so the caller can warn about the stripped text
 *   (same normalization as the `Milligramm` mapping);
 * - any other text is kept verbatim and reported by the caller as a warning,
 *   never guessed.
 */
function unitFor(raw: string): { unit: string; unknown?: string; leaked?: string } {
  const value = raw.trim();
  if (value === '') {
    return { unit: '' };
  }
  if (DASH_CELL_PATTERN.test(value)) {
    return { unit: '-' };
  }
  const firstToken = (value.split(/\s+/)[0] ?? '').replace(/[.,;:]+$/u, '');
  const key = firstToken.toLowerCase();
  const translated = UNIT_TRANSLATIONS.get(key);
  if (translated !== undefined) {
    return { unit: translated };
  }
  if (IDENTITY_UNITS.has(key)) {
    const remainder = value.slice(firstToken.length).trim();
    if (remainder !== '') {
      return { unit: firstToken, leaked: value };
    }
    return { unit: value };
  }
  return { unit: value, unknown: value };
}

/**
 * The two unit advisories of one medication row.
 *
 * The strict cell reader and the tolerant token reader both normalize through
 * `unitFor`, so the findings (and their `detail`/`params`) are authored once
 * here instead of being duplicated with two indentation levels. i18n plan 007,
 * phase 8: wording unchanged, only the stable sub-code and the echoed values
 * were added.
 */
function pushUnitWarnings(
  warnings: ParserWarning[],
  rowIndex: number,
  unit: { readonly unit: string; readonly unknown?: string; readonly leaked?: string },
): void {
  if (unit.unknown !== undefined) {
    warnings.push({
      code: 'unknown-field',
      path: `/Medicaments/${rowIndex}/Unit`,
      detail: 'unit-unknown',
      params: { value: clip(unit.unknown, 40) },
      message: `The printed unit "${clip(unit.unknown, 40)}" is not in the unit dictionary; it is kept verbatim.`,
    });
  }
  if (unit.leaked !== undefined) {
    warnings.push({
      code: 'unknown-field',
      path: `/Medicaments/${rowIndex}/Unit`,
      detail: 'unit-identity-leak',
      params: { value: clip(unit.leaked, 40), unit: unit.unit },
      message: `The printed unit "${clip(unit.leaked, 40)}" carries extra text after the recognized unit; only "${unit.unit}" is kept.`,
    });
  }
}

/**
 * Derives the route of administration from the printed description and
 * instructions (`chmed16a/README.md:1032-1043`, CDTYP 26 values).
 *
 * Rule (documented because it is a heuristic):
 * 1. printed `i.m.` (also `i.m./i.v.`) → `IM`;
 * 2. a printed oral form (`Filmtabl`, `Tabl`, `Tablette`, `Tabletten`, capsule)
 *    → `PO`;
 * 3. a printed non-oral/ambiguous form (`Wickel`, `Salbe`, `Tropfen`, `Spray`,
 *    `Inj`, `Lösung`, `Ampulle`, `Emulsion`, `Suspension`, …) → no route: omit
 *    `Roa` and surface a warning;
 * 4. no counter-evidence → `PO` (the reference document's oral rows).
 *
 * Step 1 runs before everything else, so an explicit route token keeps
 * precedence over an ambiguous form word. Step 3 is what keeps a topical wrap,
 * a solution or a suspension from being mislabelled as oral. A wrong guess is
 * worse than a missing optional field, so any ambiguity is surfaced instead of
 * invented.
 */
function routeFor(text: string): { roa?: 'IM' | 'PO'; warning?: WarningDraft } {
  if (IM_ROUTE_PATTERN.test(text)) {
    return { roa: 'IM' };
  }
  if (ORAL_FORM_PATTERN.test(text)) {
    return { roa: 'PO' };
  }
  if (NON_ORAL_FORM_PATTERN.test(text)) {
    return {
      warning: {
        detail: 'route-undetermined',
        message:
          'No route of administration could be derived from the printed text; "Roa" is omitted.',
      },
    };
  }
  return { roa: 'PO' };
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

/**
 * Identity of one medication row.
 *
 * A Swissmedic product id harvested from a link annotation (`IdType: 4`) wins
 * over the printed description. Without one the printed-text identity is kept
 * exactly as before (`GTIN` = 2, pharmacode = 3, otherwise printed text = 1),
 * which is the graceful text-only fallback.
 */
function parseMedicamentIdentity(
  description: string,
  productId: string | undefined,
): { id: string; idType: 1 | 2 | 3 | 4 } | undefined {
  const identity = parseMedicamentId(description);
  if (identity === undefined) {
    return undefined;
  }
  return productId === undefined ? identity : { id: productId, idType: 4 };
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
    // Four printed dashes are the printed form of an all-zero schedule and
    // keep `D: [0,0,0,0]`. Four genuinely blank cells mean "no dose data" and
    // were already returned above; a mixed blank/dash row stays out as well.
    return raw.every((value) => value !== '') ? { doses } : {};
  }
  return { doses };
}

function parseMedicamentCells(
  cells: readonly string[],
  layout: ColumnLayout,
  rowIndex: number,
  errors: ParseError[],
  warnings: ParserWarning[],
  inReserve: boolean,
  productId: string | undefined,
): MedicamentMp | undefined {
  const description = readCell(cells, layout.medication);
  if (description === '') {
    return undefined;
  }
  const identity = parseMedicamentIdentity(description, productId);
  if (identity === undefined) {
    return undefined;
  }

  const unit = unitFor(readCell(cells, layout.quantity));
  const medicament: MedicamentMp = {
    Id: identity.id,
    IdType: identity.idType,
    Unit: unit.unit,
  };
  pushUnitWarnings(warnings, rowIndex, unit);

  const instructions = readCell(cells, layout.instructions);
  if (!isBlankCell(instructions)) {
    medicament.AppInstr = instructions;
  }

  const reason = readCell(cells, layout.reason);
  if (!isBlankCell(reason)) {
    medicament.TkgRsn = clip(reason, 200);
  }

  const prescriber = readCell(cells, layout.prescribedBy);
  let autoMed = false;
  if (!isBlankCell(prescriber)) {
    const marker = SELF_MEDICATION_PATTERN.exec(prescriber);
    if (marker !== null) {
      // Self-medication: the cell names no prescriber. A glued cell can carry
      // the reason after the marker; use it only when the Reason cell is empty.
      autoMed = true;
      const trailing = prescriber.slice(marker[0].length).trim();
      if (trailing !== '' && medicament.TkgRsn === undefined) {
        medicament.TkgRsn = clip(trailing, 200);
      }
    } else {
      // Preserve the printed designation verbatim (the reference keeps the
      // city: "Dr. Example Karl, Wängi"); never invent or re-split it.
      medicament.PrscbBy = clip(prescriber, 120);
    }
  }
  if (autoMed) {
    medicament.AutoMed = 1;
  }

  const fromRaw = readCell(cells, layout.from);
  let fromDate: string | undefined;
  let missingFrom = false;
  if (!isBlankCell(fromRaw)) {
    fromDate = extractDate(fromRaw);
    if (fromDate === undefined) {
      errors.push({
        code: 'invalid-value',
        path: `/Medicaments/${rowIndex}/Pos/0/DtFrom`,
        detail: 'bad-start-date',
        params: { value: clip(fromRaw, 40) },
        message: `Cannot read the start date "${clip(fromRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    }
  } else {
    // No printed `Von` cell for this row: keep the required empty placeholder
    // and surface a non-blocking warning instead of inventing a date.
    missingFrom = true;
  }

  const endRaw = readCell(cells, layout.upTo);
  let endDate: string | undefined;
  // A blank or printed-dash end cell means "no end date": the row keeps no
  // `DtTo` instead of failing on an `invalid-value`.
  if (!isBlankCell(endRaw)) {
    endDate = extractDate(endRaw);
    if (endDate === undefined) {
      errors.push({
        code: 'invalid-value',
        path: `/Medicaments/${rowIndex}/Pos/0/DtTo`,
        detail: 'bad-end-date',
        params: { value: clip(endRaw, 40) },
        message: `Cannot read the end date "${clip(endRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    }
  }

  const dosage = dosageVector(cells, layout);
  if (dosage.invalid !== undefined) {
    errors.push({
      code: 'invalid-value',
      path: `/Medicaments/${rowIndex}/Pos/0/D`,
      detail: 'bad-dose',
      params: { value: clip(dosage.invalid, 40) },
      message: `Cannot read the dose "${clip(dosage.invalid, 40)}"; expected a number or one of ½, 1/3, ¼, 2/3, ¾, 1/8.`,
    });
  }

  const inReserveRow = inReserve || RESERVE_NAME_PATTERN.test(description);
  if (
    fromDate !== undefined ||
    endDate !== undefined ||
    dosage.doses !== undefined ||
    inReserveRow
  ) {
    const posology: PosologyMp = { DtFrom: fromDate ?? '' };
    if (missingFrom) {
      warnings.push({
        code: 'empty-string',
        path: `/Medicaments/${rowIndex}/Pos/0/DtFrom`,
        // Placeholder advisories use one detail per placeholder situation and
        // spell the field names inside the template (`"Von"` is the printed
        // title, `"DtFrom"` the JSON key): both must survive verbatim in every
        // locale, so a `{field}` parameter would only leak English into it.
        detail: 'missing-dtfrom',
        message:
          'No printed start date ("Von") was found for this medication row; "DtFrom" keeps the required empty placeholder.',
      });
    }
    if (inReserveRow) {
      posology.InRes = 1;
    }
    if (endDate !== undefined) {
      posology.DtTo = endDate;
    }
    if (dosage.doses !== undefined) {
      posology.D = dosage.doses;
    }
    medicament.Pos = [posology];
  }

  const route = routeFor(`${description} ${instructions}`);
  if (route.roa !== undefined) {
    medicament.Roa = route.roa;
  } else if (route.warning !== undefined) {
    warnings.push({
      code: 'unknown-field',
      path: `/Medicaments/${rowIndex}/Roa`,
      ...route.warning,
    });
  }

  return medicament;
}

/**
 * Reads the strict medication table.
 *
 * `productIds` is indexed by *printed row band*, not by medicament: the caller
 * only passes it when the geometry row count and the produced medicament count
 * are proven 1:1 (see `parseInternal`), so a band that yields no medicament
 * can never shift a binding onto the next row.
 */
function parseMedicamentRows(
  lines: readonly string[],
  headerIndex: number,
  layout: ColumnLayout,
  pageIndex: readonly number[],
  productIds: readonly (string | undefined)[] | undefined,
): { medicaments: MedicamentMp[]; errors: ParseError[]; warnings: ParserWarning[] } {
  const medicaments: MedicamentMp[] = [];
  const errors: ParseError[] = [];
  const warnings: ParserWarning[] = [];
  // A second table (`Reservemedikation`) re-prints the column titles, possibly
  // at different x positions but in the same order; re-deriving the layout from
  // its own header keeps index-based reads honest across tables.
  let activeLayout = layout;
  /**
   * The geometry tabulator drops the `Reservemedikation` title but re-emits the
   * column header. A repeated header that follows data rows on the *same page*
   * therefore opens the reserve table. A header at the top of a new page is a
   * continuation of the main table and must not flip the band.
   */
  let inReserve = false;
  let sawRow = false;
  let lastRowPage = pageIndex[headerIndex] ?? 0;

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
      inReserve = true;
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
      if (sawRow && (pageIndex[index] ?? lastRowPage) === lastRowPage) {
        inReserve = true;
      }
      continue;
    }
    const medicament = parseMedicamentCells(
      cells,
      activeLayout,
      medicaments.length,
      errors,
      warnings,
      inReserve,
      productIds?.[medicaments.length],
    );
    if (medicament !== undefined) {
      medicaments.push(medicament);
      sawRow = true;
      lastRowPage = pageIndex[index] ?? lastRowPage;
    }
  }

  return { medicaments, errors, warnings };
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
 * Peels the trailing columns from a single-spaced row.
 *
 * `Reason` and `Prescribed by` are mapped in phase 2. With the column gaps gone
 * their only remaining signal is position, so an honorific token starts
 * `Prescribed by`, the last word before it is the short printed `Reason` label,
 * and the rest is `Instructions`. Without an honorific the last word is the
 * printed `Prescribed by` label itself (e.g. `Selbstmedikation`), which the
 * strict path reads as a cell; the caller then applies the same self-medication
 * rule as that strict path. Text is never invented; at worst a multi-word
 * `Reason` shortens the instruction by the same number of words, which is why an
 * OCR result is always reported as low confidence.
 */
function tailFields(
  tokens: readonly string[],
  layout: TolerantLayout,
): { instructions: string; reason?: string; prescribedBy?: string } {
  let end = tokens.length;
  let prescribedBy: string | undefined;
  let reason: string | undefined;
  const honorific = tokens.findIndex((token) => HONORIFIC_TOKEN_PATTERN.test(token));
  if (honorific >= 0) {
    end = honorific;
    prescribedBy = tokens.slice(honorific).join(' ').trim();
  } else if (layout.hasPrescribedBy && end > 0) {
    // No honorific: `Prescribed by` printed a short label ("Self-medication").
    end -= 1;
    prescribedBy = tokens[end];
  }
  if (layout.hasReason && end > 0) {
    end -= 1;
    reason = tokens[end];
  }
  return {
    instructions: tokens.slice(0, end).join(' '),
    reason,
    prescribedBy,
  };
}

/**
 * True when the run after the dose window still looks like the printed
 * `Quantity/From/Up to` columns rather than the instruction text.
 *
 * This matters for a single-spaced row whose dose cells print `See
 * instructions`: the collapsed empty unit/from/up-to cells disappear, so the
 * next visible word can be the start of the instruction (`bis zu max. ...`).
 * Peeling that word as a unit would invent data. We only peel when the run is
 * anchored by a date/dash, a recognized unit, or an unknown token that is
 * immediately followed by a date/dash (a genuinely printed unit).
 */
function looksStructuredTail(tail: readonly RowToken[]): boolean {
  const first = tail[0];
  if (first === undefined) {
    return false;
  }
  if (DATE_TOKEN_PATTERN.test(first.text) || DASH_CELL_PATTERN.test(first.text)) {
    return true;
  }
  const unit = unitFor(first.text);
  if (unit.unknown === undefined) {
    return true;
  }
  const second = tail[1];
  return (
    second !== undefined &&
    (DATE_TOKEN_PATTERN.test(second.text) || DASH_CELL_PATTERN.test(second.text))
  );
}

/**
 * One single-spaced row → medicament, or `undefined` when the line is not a
 * medication row. Mirrors `parseMedicamentCells`: identity, unit, instructions,
 * reason, prescriber, start/end date, reserve flag and the dose vector, with
 * the same typed errors for unreadable values.
 */
function parseTolerantRow(
  line: string,
  layout: TolerantLayout,
  rowIndex: number,
  errors: ParseError[],
  warnings: ParserWarning[],
  inReserve: boolean,
): MedicamentMp | undefined {
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
    if (invalidDose === undefined) {
      // Four printed dose tokens are a real schedule, including an all-zero
      // one (`- - - -` / `0 0 0 0`); mirrors the strict path.
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

  const medicament: MedicamentMp = { Id: identity.id, IdType: identity.idType, Unit: '' };

  const tail = tokenizeRow(rest);
  let cursor = 0;
  let fromRaw = '';
  let endRaw = '';
  // A dose window always anchors the printed Quantity/From/Up-to columns. For a
  // "See instructions" row the collapsed cells can make the instruction text
  // look like those columns, so only peel when the run is still structured.
  const structured = window !== undefined || looksStructuredTail(tail);
  if (structured) {
    const quantity = tail[cursor];
    if (quantity !== undefined && !DATE_TOKEN_PATTERN.test(quantity.text)) {
      // A printed dash stays the literal `-` (the reference's explicit "no
      // unit" cell); a genuinely blank cell keeps the `''` placeholder.
      const unit = unitFor(quantity.text);
      medicament.Unit = unit.unit;
      pushUnitWarnings(warnings, rowIndex, unit);
      cursor += 1;
    }

    if (layout.hasFrom) {
      const from = tail[cursor];
      if (
        from !== undefined &&
        (DATE_TOKEN_PATTERN.test(from.text) || DASH_CELL_PATTERN.test(from.text))
      ) {
        fromRaw = DASH_CELL_PATTERN.test(from.text) ? '' : from.text;
        cursor += 1;
      }
    }
    const upTo = tail[cursor];
    if (upTo !== undefined && DATE_TOKEN_PATTERN.test(upTo.text)) {
      endRaw = upTo.text;
      cursor += 1;
    } else if (upTo !== undefined && DASH_CELL_PATTERN.test(upTo.text)) {
      cursor += 1;
    }
  }

  const fields = tailFields(
    tail.slice(cursor).map((token) => token.text),
    layout,
  );
  if (!isBlankCell(fields.instructions)) {
    medicament.AppInstr = fields.instructions;
  }

  let reason = fields.reason;
  let prescriber = fields.prescribedBy;
  let autoMed = false;
  if (reason !== undefined && SELF_MEDICATION_PATTERN.test(reason)) {
    // Glued/reordered cells: the marker landed in the Reason slot. The other
    // peeled value is the printed reason when it is not another marker.
    autoMed = true;
    if (
      prescriber !== undefined &&
      !SELF_MEDICATION_PATTERN.test(prescriber) &&
      !isBlankCell(prescriber)
    ) {
      reason = prescriber;
    } else {
      reason = undefined;
    }
    prescriber = undefined;
  }
  if (prescriber !== undefined && SELF_MEDICATION_PATTERN.test(prescriber)) {
    autoMed = true;
    const marker = SELF_MEDICATION_PATTERN.exec(prescriber);
    const trailing = prescriber.slice(marker?.[0]?.length ?? 0).trim();
    if (trailing !== '' && reason === undefined) {
      reason = trailing;
    }
    prescriber = undefined;
  }
  if (reason !== undefined && !isBlankCell(reason)) {
    medicament.TkgRsn = clip(reason, 200);
  }
  if (prescriber !== undefined && !isBlankCell(prescriber)) {
    medicament.PrscbBy = clip(prescriber, 120);
  }
  if (autoMed) {
    medicament.AutoMed = 1;
  }

  let fromDate: string | undefined;
  let missingFrom = false;
  if (fromRaw !== '') {
    fromDate = extractDate(fromRaw);
    if (fromDate === undefined) {
      errors.push({
        code: 'invalid-value',
        path: `/Medicaments/${rowIndex}/Pos/0/DtFrom`,
        detail: 'bad-start-date',
        params: { value: clip(fromRaw, 40) },
        message: `Cannot read the start date "${clip(fromRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    }
  } else {
    missingFrom = true;
  }

  let endDate: string | undefined;
  if (endRaw !== '') {
    endDate = extractDate(endRaw);
    if (endDate === undefined) {
      errors.push({
        code: 'invalid-value',
        path: `/Medicaments/${rowIndex}/Pos/0/DtTo`,
        detail: 'bad-end-date',
        params: { value: clip(endRaw, 40) },
        message: `Cannot read the end date "${clip(endRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    }
  }
  if (invalidDose !== undefined) {
    errors.push({
      code: 'invalid-value',
      path: `/Medicaments/${rowIndex}/Pos/0/D`,
      detail: 'bad-dose',
      params: { value: clip(invalidDose, 40) },
      message: `Cannot read the dose "${clip(invalidDose, 40)}"; expected a number or one of ½, 1/3, ¼, 2/3, ¾, 1/8.`,
    });
  }

  const inReserveRow = inReserve || RESERVE_NAME_PATTERN.test(description);
  if (
    fromDate !== undefined ||
    endDate !== undefined ||
    doses !== undefined ||
    inReserveRow
  ) {
    const posology: PosologyMp = { DtFrom: fromDate ?? '' };
    if (missingFrom) {
      warnings.push({
        code: 'empty-string',
        path: `/Medicaments/${rowIndex}/Pos/0/DtFrom`,
        // Placeholder advisories use one detail per placeholder situation and
        // spell the field names inside the template (`"Von"` is the printed
        // title, `"DtFrom"` the JSON key): both must survive verbatim in every
        // locale, so a `{field}` parameter would only leak English into it.
        detail: 'missing-dtfrom',
        message:
          'No printed start date ("Von") was found for this medication row; "DtFrom" keeps the required empty placeholder.',
      });
    }
    if (inReserveRow) {
      posology.InRes = 1;
    }
    if (endDate !== undefined) {
      posology.DtTo = endDate;
    }
    if (doses !== undefined) {
      posology.D = doses;
    }
    medicament.Pos = [posology];
  }

  const route = routeFor(`${description} ${fields.instructions}`);
  if (route.roa !== undefined) {
    medicament.Roa = route.roa;
  } else if (route.warning !== undefined) {
    warnings.push({
      code: 'unknown-field',
      path: `/Medicaments/${rowIndex}/Roa`,
      ...route.warning,
    });
  }

  return medicament;
}

/** Reads the rows below a tolerant header, skipping repeated header lines. */
function parseTolerantMedicamentRows(
  lines: readonly string[],
  headerIndex: number,
  layout: TolerantLayout,
  pageIndex: readonly number[],
): { medicaments: MedicamentMp[]; errors: ParseError[]; warnings: ParserWarning[] } {
  const medicaments: MedicamentMp[] = [];
  const errors: ParseError[] = [];
  const warnings: ParserWarning[] = [];
  let inReserve = false;
  let sawRow = false;
  let lastRowPage = pageIndex[headerIndex] ?? 0;

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
      inReserve = true;
      continue;
    }
    if (isTolerantHeaderLine(line)) {
      // Repeated column titles on a following page (`chmed16a/README.md:1731`)
      // or the re-emitted header of the `Reservemedikation` table. Only a
      // header on the same page as the preceding row opens the reserve band.
      if (sawRow && (pageIndex[index] ?? lastRowPage) === lastRowPage) {
        inReserve = true;
      }
      continue;
    }
    const medicament = parseTolerantRow(
      line,
      layout,
      medicaments.length,
      errors,
      warnings,
      inReserve,
    );
    if (medicament !== undefined) {
      medicaments.push(medicament);
      sawRow = true;
      lastRowPage = pageIndex[index] ?? lastRowPage;
    }
  }

  return { medicaments, errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* Link-annotation → medication row mapping                                   */
/* -------------------------------------------------------------------------- */

/**
 * Vertical tolerance (points) when an annotation rect is matched to a row band.
 *
 * The smallest measured gap between two printed medication rows of the real
 * sample is 22.2 pt, so half of it (11.1 pt) is the theoretical safe ceiling; 6
 * pt stays well below it. The tolerance absorbs the difference between a text
 * baseline (the row band) and the clickable rect that encloses the glyphs.
 */
const ANNOTATION_Y_TOLERANCE = 6;

/**
 * Horizontal tolerance (points) for the Medication column band.
 *
 * Only a small boundary slack is needed: the link starts at the brand text,
 * which is printed at the left edge of the column.
 */
const ANNOTATION_X_TOLERANCE = 6;

/**
 * Aggregate row/annotation comparisons one mapping run may perform.
 *
 * A hostile document cannot force an unbounded cross-product: every geometry
 * row is visited through a per-page index, and the scan aborts (fail-closed)
 * once this budget is spent, leaving the remaining rows on their printed-text
 * identities. Real documents use a handful of rows per page.
 */
const MAX_ANNOTATION_ROW_CHECKS = 1_000_000;

/**
 * Maps link annotations to tabulated medication rows by geometry.
 *
 * `rows` and the returned array are parallel; an entry is the Swissmedic
 * product id of the annotation that unambiguously belongs to that row, or
 * `undefined` when the row keeps its printed-text identity.
 *
 * Rules:
 * - an annotation matches a row when it is on the same page, its vertical span
 *   overlaps the row band (tolerance `ANNOTATION_Y_TOLERANCE`) and its
 *   horizontal span overlaps the first-column band (tolerance
 *   `ANNOTATION_X_TOLERANCE`);
 * - an annotation that matches zero rows is ignored (a normal, non-product link
 *   or a link outside the medication table);
 * - an annotation that matches more than one row is ambiguous and is dropped —
 *   it is never assigned to the nearest row;
 * - several annotations with the same id on one row are deduplicated; two
 *   *different* ids on the same row are ambiguous and the row keeps its
 *   printed-text id.
 *
 * Rows are pre-indexed per page and each page's list is sorted top-down, so the
 * scan only touches the annotation's own page and stops as soon as the
 * remaining rows are provably below the annotation. An aggregate
 * `MAX_ANNOTATION_ROW_CHECKS` budget bounds a hostile run.
 *
 * Pure: no DOM, no pdfjs import, no I/O. URIs are never fetched or executed —
 * the adapter has already reduced them to a digits-only product id.
 */
export function mapAnnotationsToRows(
  rows: readonly PdfRowGeometry[],
  annotations: readonly PdfLinkAnnotation[],
): readonly (string | undefined)[] {
  const matched: (string | undefined)[] = rows.map(() => undefined);
  const idsByRow = new Map<number, Set<string>>();

  const rowsByPage = new Map<number, number[]>();
  rows.forEach((row, index) => {
    const indices = rowsByPage.get(row.page);
    if (indices === undefined) {
      rowsByPage.set(row.page, [index]);
    } else {
      indices.push(index);
    }
  });
  // Top-down order makes the "remaining rows are below this annotation" break
  // sound; candidate identity does not depend on the scan order.
  for (const indices of rowsByPage.values()) {
    indices.sort((left, right) => (rows[right]?.top ?? 0) - (rows[left]?.top ?? 0));
  }

  let budget = MAX_ANNOTATION_ROW_CHECKS;
  for (const annotation of annotations) {
    if (budget <= 0) {
      break;
    }
    if (annotation.productId === '') {
      // Defensive: an empty id must never replace the printed-text identity.
      continue;
    }
    const pageRows = rowsByPage.get(annotation.page);
    if (pageRows === undefined) {
      continue;
    }
    const [x1, y1, x2, y2] = annotation.rect;
    let candidate = -1;
    let candidateCount = 0;
    let exhausted = false;
    for (const index of pageRows) {
      if (budget <= 0) {
        exhausted = true;
        break;
      }
      budget -= 1;
      const row = rows[index];
      if (row === undefined) {
        continue;
      }
      if (row.top < y1 - ANNOTATION_Y_TOLERANCE) {
        // Rows are sorted top-down: every later row is even lower.
        break;
      }
      if (y2 < row.bottom - ANNOTATION_Y_TOLERANCE) {
        continue;
      }
      if (
        x2 < row.medicationLeft - ANNOTATION_X_TOLERANCE ||
        x1 > row.medicationRight + ANNOTATION_X_TOLERANCE
      ) {
        continue;
      }
      candidate = index;
      candidateCount += 1;
      if (candidateCount > 1) {
        // Already ambiguous; scanning more rows cannot make it unambiguous.
        break;
      }
    }
    if (exhausted) {
      // Budget spent mid-scan: never bind a partially examined annotation.
      break;
    }
    if (candidateCount !== 1) {
      // 0 = unrelated link; > 1 = ambiguous. Neither may invent a row binding.
      continue;
    }
    const ids = idsByRow.get(candidate) ?? new Set<string>();
    ids.add(annotation.productId);
    idsByRow.set(candidate, ids);
  }

  for (const [index, ids] of idsByRow) {
    if (ids.size !== 1) {
      // Two different product ids on one row: ambiguity, keep the printed text.
      continue;
    }
    const [id] = ids;
    matched[index] = id;
  }
  return matched;
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

function unsupported(
  detail: 'empty-text' | 'no-layout',
  message: string,
): PrescriptionParseResult {
  return {
    ok: false,
    errors: [{ code: 'unsupported-layout', path: '', detail, message }],
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

function parseInternal(
  text: string,
  context: PdfAnnotationContext | undefined,
  fallbackText: string | undefined,
): PrescriptionParseResult {
  if (typeof text !== 'string' || text.trim() === '') {
    return unsupported(
      'empty-text',
      'The text is empty; no eMediplan paper layout was found.',
    );
  }

  const lines = normalizeLines(text);
  const pageIndex = linePageIndex(text);
  const strictHeader = findMedicationHeader(lines);
  const tolerantHeader =
    strictHeader === undefined ? findTolerantHeader(lines) : undefined;
  // Link annotations exist only for the geometry-tabulated layout: the OCR /
  // flat-text path has no row positions, so it passes no context and keeps the
  // printed-text ids (documented limitation, not a warning).
  const productIds =
    context === undefined
      ? undefined
      : mapAnnotationsToRows(context.rows, context.annotations);

  let headerIndex: number;
  let rows: {
    medicaments: MedicamentMp[];
    errors: ParseError[];
    warnings: ParserWarning[];
  };
  if (strictHeader !== undefined) {
    headerIndex = strictHeader.index;
    rows = parseMedicamentRows(
      lines,
      headerIndex,
      strictHeader.layout,
      pageIndex,
      productIds,
    );
    if (
      productIds !== undefined &&
      context !== undefined &&
      context.rows.length !== rows.medicaments.length
    ) {
      // Fail closed. The tabulator emits one geometry entry per printed row
      // band; a band that yields no medicament would shift every later
      // `productIds[medicaments.length]` lookup onto the wrong row. When the
      // counts cannot be proven 1:1, re-parse without annotations so every row
      // keeps its printed-text identity, and say why.
      rows = parseMedicamentRows(
        lines,
        headerIndex,
        strictHeader.layout,
        pageIndex,
        undefined,
      );
      rows.warnings.push({
        code: 'unknown-field',
        path: '/Medicaments',
        detail: 'annotation-desync',
        message:
          'The link-annotation row geometry and the parsed medication rows do not correspond one-to-one; product ids (IdType 4) were dropped and printed-text identities kept.',
      });
    }
  } else if (tolerantHeader !== undefined) {
    headerIndex = tolerantHeader.index;
    rows = parseTolerantMedicamentRows(
      lines,
      headerIndex,
      tolerantHeader.layout,
      pageIndex,
    );
  } else {
    return unsupported(
      'no-layout',
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
      detail: 'missing-first-name',
      message: 'The patient block has no first name.',
    });
  }
  if (lName === undefined) {
    errors.push({
      code: 'missing-field',
      path: '/Patient/LName',
      detail: 'missing-last-name',
      message: 'The patient block has no last name.',
    });
  }
  if (bDt === undefined) {
    if (scan.patient.bDtRaw !== undefined) {
      errors.push({
        code: 'invalid-value',
        path: '/Patient/BDt',
        detail: 'bad-birth-date',
        params: { value: clip(scan.patient.bDtRaw, 40) },
        message: `Cannot read the birth date "${clip(scan.patient.bDtRaw, 40)}"; expected DD.MM.YYYY.`,
      });
    } else {
      errors.push({
        code: 'missing-field',
        path: '/Patient/BDt',
        detail: 'missing-birth-date',
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
      detail: 'no-rows',
      message: 'No medication row was found below the column header.',
    });
  }

  const issueDate = scan.issueDate;
  if (issueDate === undefined) {
    errors.push({
      code: 'missing-field',
      path: '/Dt',
      detail: 'missing-issue-date',
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
      errors: [
        { code: 'missing-field', path: '', detail: 'incomplete', message: 'The prescription is incomplete.' },
      ],
    };
  }

  const language = detectLanguage(lines.slice(0, headerIndex + 1));
  const patient: PatientMp = {
    FName: fName,
    LName: lName,
    BDt: bDt,
    // `Lng` is required by the MP schema (`chmed16a/README.md:487-496`). The
    // value comes from the vocabulary actually printed; an undetected language
    // keeps the `''` placeholder so the validator can flag it, and the parser
    // adds the explicit warning below. French/Italian detection is left to the
    // i18n plan.
    Lng: language ?? '',
  };
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
  const medical: MedicalData = {};
  if (scan.measurements.length > 0) {
    medical.Meas = scan.measurements;
  }
  if (scan.risks.length > 0) {
    medical.Rc = scan.risks;
  }
  if (medical.Meas !== undefined || medical.Rc !== undefined) {
    patient.Med = medical;
  }

  const auth = providerAuth(scan.provider);

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
            detail: 'no-crypto',
            message:
              'Cannot generate a prescription id: this browser provides neither crypto.randomUUID nor crypto.getRandomValues.',
          },
        ],
      };
    }
  }

  const value: MedicationMp = {
    MedType: 1,
    Id: id,
    Auth: auth,
    Dt: issueDate,
    Patient: patient,
    Medicaments: medicaments,
  };
  const remark =
    captureRemark(lines) ??
    (fallbackText === undefined || fallbackText.trim() === ''
      ? undefined
      : captureRemark(normalizeLines(fallbackText)));
  if (remark !== undefined) {
    value.Rmk = remark;
  }

  const warnings: ParserWarning[] = [...rows.warnings, ...scan.warnings];
  if (language === undefined) {
    warnings.push({
      code: 'unknown-field',
      path: '/Patient/Lng',
      detail: 'language-undetected',
      message:
        'The printed vocabulary does not match a language this parser maps; "Lng" keeps the required empty placeholder (French/Italian detection is deferred to the i18n plan).',
    });
  }

  return { ok: true, value, warnings };
}

/**
 * Parses normalized eMediplan paper-layout text into a CHMED16A Medication Plan.
 *
 * Never throws: malformed, hostile or non-layout input is reported as
 * `{ ok: false, errors }`. The success result always carries `MedType: 1`, an
 * `Id` (printed UUID when one is detected, otherwise a fresh cryptographic UUID
 * v4) and an `Auth` string: the printed provider GLN when present, else the
 * locked literal `"patient"`. If the environment has no CSPRNG at all, the parse
 * fails closed with `invalid-value` at `/Id` rather than inventing a predictable
 * id.
 *
 * MP has no provider-identity block: the document never carries the Rx-only
 * `rev`, `HcPerson` or `HcOrg` (`chmed16a/README.md:207-400`).
 *
 * An optional annotation context pairs the tabulated text with the link
 * annotations of the same page geometry. A row with an unambiguous product link
 * gets `IdType: 4`; every other row keeps its printed-text `Id`/`IdType`
 * (graceful text-only fallback). Because the geometry is indexed per printed
 * row band, a count mismatch between geometry rows and parsed medicaments drops
 * every `IdType 4` binding with a warning instead of risking a shifted binding.
 * The OCR path never supplies a context.
 *
 * `fallbackText` is an optional second rendering of the same pages (the flat
 * text layer). The geometry tabulator deliberately stops at the `Bemerkung :`
 * stop row so header/comment/footer text can never pollute the medication table;
 * the remark printed after the last table therefore exists only in the flat
 * rendering, and this argument is what lets `captureRemark` still emit `Rmk`.
 * It is used for the remark only.
 */
export function parsePrescriptionText(
  text: string,
  context?: PdfAnnotationContext,
  fallbackText?: string,
): PrescriptionParseResult {
  try {
    return parseInternal(text, context, fallbackText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [
        {
          code: 'invalid-value',
          path: '',
          detail: 'unreadable-text',
          params: { reason: clip(detail, 160) },
          message: `The eMediplan text could not be read: ${clip(detail, 160)}`,
        },
      ],
    };
  }
}
