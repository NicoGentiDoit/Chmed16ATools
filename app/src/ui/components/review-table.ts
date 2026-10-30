/**
 * Review table for the extracted prescription: read-only (phase 7b),
 * inline-editable scalar fields (phase 7c).
 *
 * The table mirrors the object the pipeline already returned — a Medication
 * Plan (`MedicationMp`, `core/types.ts`), not a re-parse:
 * - `Patient`: `Lng` (the one MP-required patient scalar) plus `FName`,
 *   `LName`, `BDt`, `Gender`;
 * - one row per `Medicaments[]` entry: `Id` (GTIN/pharmacode/product text),
 *   `IdType`, `Unit` and `AppInstr`.
 *
 * A Medication Plan has no prescriber/organisation block, so the table has no
 * group for one: `HcPerson`/`HcOrg` belong to the retired Rx document only.
 *
 * ## Mapping of the plan's "medication" rows
 *
 * The plan speaks of `Medication.Taking` entries. This object model has no
 * `Taking` array: the parser appends exactly one `MedicamentMp` per printed
 * medication row, so one row here is one printed medication line, in document
 * order (no sorting). The row number is that entry's 1-based index.
 *
 * Deliberately not rendered:
 * - `MedicamentMp.Pos` (posology): an array of objects (`DtFrom`, `D`, `TT`),
 *   not scalars — editing it needs a structured editor, not a text input. The
 *   posology's own required `DtFrom` is therefore recap/findings territory and
 *   is never counted by the review counter;
 * - the MP root's own required scalars (`MedType`, `Id`, `Auth`, `Dt`): document
 *   identity, not reviewable data; the findings/task list reports them;
 * - `Patient.Ids`: an array of `{ Type, Val }` objects, so there is no single
 *   scalar patient id to show (the root `Id` is the prescription UUID, not a
 *   patient id).
 *
 * ## Editable fields (phase 7c whitelist)
 *
 * Only the scalars listed above get an `<input>`. They are the fields the PDF
 * extractor can misread without invalidating the document's shape, so they are
 * the ones a reviewer can repair without touching posology or identifiers.
 * `Patient.Gender` is the single exception to "scalar string": the schema types
 * it `integer` with `enum: [1, 2]` (`core/schema.ts`), so its cell shows the
 * encoded number, the row label spells out what the numbers mean, and the panel
 * writes a numeric entry back as a number to keep the document's own type. No
 * value is checked here — the core validator is the only judge, and a wrong
 * number is reported exactly like a wrong word.
 *
 * ## Editing contract
 *
 * An edit is emitted from the input's `change` event — blur, or Enter — not from
 * `input`: a re-validation on every keystroke would rewrite the findings list
 * (and the JSON area) while the user is still typing a value, and would make
 * every intermediate state look like a failure. `value` is the raw input text:
 * this module never trims, parses or rewrites it for the edit. Only the advisory
 * hint reads it between keystrokes, and it changes nothing but its own line.
 *
 * The table owns no prescription data of its own. `render` binds every reader to
 * the object it is given, so after the panel writes an edit into that same
 * object, `updateFindings` re-derives each status from the live values.
 * `updateFindings` deliberately does not rebuild the cells: the focused input,
 * its text and the caret survive, which a full re-render would destroy on the
 * very blur that triggered the re-validation.
 *
 * ## Status derivation (UI only, no validation logic)
 *
 * Every field is `Recognized`, `To verify` or `Absent`, computed from the
 * findings the panel already holds — this module never validates anything:
 * - `To verify`: a finding implicates the field. Implicated means either an
 *   `instancePath` at or below the field's JSON Pointer (`/Patient/BDt`,
 *   `/Medicaments/0/Id/...`), or a missing-required finding whose parent
 *   `instancePath` plus `params.missingProperty` name the field (`''` +
 *   `Patient`, `/Patient` + `BDt`). Ajv reports a missing required property on
 *   the *parent*, so the second form is what catches an absent section;
 * - `Absent`: the key is missing (or holds an empty/blank string) and no finding
 *   implicates it — the validator accepted the omission;
 * - `Recognized`: the value is present and nothing implicates it.
 *
 * A medication row's status column summarises the row: `To verify` when any
 * rendered cell is implicated (the affected field names are appended to the
 * label), otherwise `Recognized`. `Absent` never summarises a row, because a
 * missing optional cell is normal in a valid prescription.
 *
 * Colour is never the only signal: every status is an icon plus a word.
 *
 * ## Guided tasks (plan 005, phase 1 — opt-in)
 *
 * With `guidedTasks: true` the table also:
 * - shows an honest required-field counter above the tables (see the comment on
 *   `refreshRequiredCount` for what it counts and what it deliberately omits);
 * - points every implicated editable input at the finding item that names it
 *   (`aria-describedby`), preferring the visible task row over the prose item
 *   hidden in the findings' "Technical details" disclosure. The association is
 *   recomputed on every `updateFindings` and removed when the finding clears.
 *
 * ## Advisory hints (plan 005, phase 2)
 *
 * An editable input may carry one quiet hint line under it, recomputed on every
 * keystroke (`input` event) and on every `updateFindings`:
 * - a birthdate that is not `YYYY-MM-DD` gets a format hint;
 * - a required field left blank gets a quiet "required" mark.
 *
 * This layer is guidance only. It never writes to the findings list, the
 * required counter, the recap, the verdict or the export gate: the core
 * validator stays the sole judge, and a value an advisory dislikes is still
 * exported if the core accepts it. It is also de-duplicated against the core:
 * when a finding already implicates the field, the format hint is suppressed
 * (its message is the finding's), while the required mark stays — it is a
 * passive statement about the field, not a second opinion on the finding. The
 * hint is associated through `aria-describedby` (additively, next to the
 * finding id) and is a static description, not a live region: announcing every
 * keystroke would be noise. `aria-invalid` is set only while a format hint is
 * visible, i.e. about the text being typed, never about the export decision.
 *
 * ## Locale refresh (i18n plan 007, phase 5)
 *
 * Every label of this component — captions, column/row/group headers, each
 * input's accessible name, status chips, advisory hints, the required counter —
 * is resolved through the catalogue when it is written, never stored as English
 * text. `relabel()` re-runs exactly those writes in place, so switching language
 * while a reviewer has an edit in progress re-words the table without rebuilding
 * it: values (including text typed but not committed), focus, caret, the
 * `disabled` state and the findings-derived statuses all survive.
 */

import type { MedicationMp } from '../../core/types';
import { format, text } from '../strings';
import type { UiStringKey } from '../strings';
import { el } from './dom';
import { findingItemId, isTaskFinding, taskRowId } from './findings';
import type { FindingLevel } from './findings';

/** Per-field review state. */
export type ReviewStatus = 'recognized' | 'to-verify' | 'absent';

/**
 * The part of a finding the status derivation needs.
 *
 * `path` is the validator's `instancePath` (a JSON Pointer, e.g.
 * `/Patient/BDt`) or a warning's `path` (same format). `missingProperty` is
 * Ajv's `params.missingProperty` for a `required` failure, which is reported on
 * the parent object rather than on the missing field.
 *
 * `keyword`, `level` and `index` are additive (plan 005): the PDF panel fills
 * them so the table can derive the matching finding item id. A caller that
 * omits them keeps the previous behaviour (status derivation only).
 */
export interface ReviewFinding {
  readonly path: string;
  readonly missingProperty?: string;
  readonly keyword?: string;
  /** Level of the finding item the panel rendered for this finding. */
  readonly level?: FindingLevel;
  /** 0-based position of the finding within its level. */
  readonly index?: number;
}

/** Prescription section an edit targets. */
export type ReviewSection = 'Patient' | 'Medicaments';

/**
 * The document the review table renders: exactly the object the PDF pipeline
 * produced, a Medication Plan (`MedicationMp`, `MedType: 1`).
 *
 * It is deliberately the pipeline type itself rather than a widened copy: the
 * table renders what the document holds, so an Rx-only key (`HcPerson`,
 * `HcOrg`) cannot appear here and the table cannot offer an edit the pipeline
 * could never emit.
 */
export type ReviewPrescription = MedicationMp;

/** One committed inline edit. */
export interface ReviewEdit {
  readonly section: ReviewSection;
  /** Medicament row index; `undefined` for the object sections. */
  readonly index?: number;
  /** Object key of the edited scalar (`FName`, `BDt`, `Id`, ...). */
  readonly key: string;
  /** JSON Pointer of the edited scalar (used by tests and diagnostics). */
  readonly pointer: string;
  /** A blank value means the field was cleared; the panel then removes it. */
  readonly value: string;
}

export interface ReviewTableOptions {
  /**
   * Renders every whitelisted scalar as an `<input type="text">` (phase 7c).
   * Needs `onEdit`: without a listener the cells stay read-only, which is
   * exactly the phase-7b behaviour.
   */
  readonly editable?: boolean;
  /** Receives one edit per committed cell. */
  readonly onEdit?: (edit: ReviewEdit) => void;
  /**
   * Enables the required-field counter and the `aria-describedby` links from an
   * implicated input to its finding/task item. Off by default, so a caller that
   * does not opt in (there is none today) keeps the pre-005 DOM.
   */
  readonly guidedTasks?: boolean;
}

export interface ReviewTableHandle {
  /** Renders the table for `prescription`, or hides it when there is none. */
  render(prescription: ReviewPrescription, findings: readonly ReviewFinding[]): void;
  /**
   * Re-derives every status in place after the panel re-validated an edited
   * object. Values and inputs are left untouched, so focus and caret survive.
   */
  updateFindings(findings: readonly ReviewFinding[]): void;
  /**
   * Re-resolves every label for the current locale, in place.
   *
   * Label-only by contract (i18n plan 007, phase 5): text nodes and accessible
   * names are rewritten, nothing is rebuilt. Input values (including text typed
   * but not yet committed), focus, caret and `disabled` state survive — a
   * `render` would drop all of them, which is exactly why this exists.
   */
  relabel(): void;
  /** Disables the inputs (the pipeline is running); re-enables them otherwise. */
  setDisabled(disabled: boolean): void;
  /** The editable input for a JSON Pointer, or `null` when it is not rendered. */
  getFieldElement(pointer: string): HTMLElement | null;
  /** Hides the table and drops its DOM. */
  clear(): void;
}

/**
 * Id of the editable input for a JSON Pointer (`/Patient/BDt` →
 * `review-input-Patient-BDt`). Exported so a panel can link to a field without
 * reaching into the table's DOM; the guided-task anchors resolve to the same
 * element returned by {@link ReviewTableHandle.getFieldElement}.
 */
export function reviewInputId(pointer: string): string {
  const path = pointer.replace(/^\/+/, '');
  return `review-input-${path === '' ? 'root' : path.replace(/\//g, '-')}`;
}

/**
 * Id of the advisory hint element of one field (`/Patient/BDt` →
 * `review-advisory-Patient-BDt`).
 *
 * Its own namespace, deliberately distinct from `finding-*` and `task-row-*`:
 * the same input carries both ids at once, and an advisory must never shadow
 * the core finding's association.
 */
export function advisoryHintId(pointer: string): string {
  const path = pointer.replace(/^\/+/, '');
  return `review-advisory-${path === '' ? 'root' : path.replace(/\//g, '-')}`;
}

const CAPTION_ID_SUMMARY = 'pdf-review-caption-summary';
const CAPTION_ID_MEDICAMENTS = 'pdf-review-caption-medicaments';

/**
 * Section names fed into the one caption template (`pdfReviewCaption`).
 *
 * Keys, not literals: the caption is prose and follows the locale, so phase 5 of
 * the i18n plan promoted the three nouns it slots in. The template itself is
 * unchanged — a translation supplies the noun in its own grammatical form.
 */
const SECTION_NAME_KEYS = {
  heading: 'pdfReviewSectionHeading',
  summary: 'pdfReviewSectionSummary',
  medicaments: 'pdfReviewSectionMedicaments',
} as const satisfies Record<'heading' | 'summary' | 'medicaments', UiStringKey>;

/**
 * The caption of one table (`Review extracted <section>`), resolved now.
 *
 * Every call site re-resolves it, which is what makes the locale refresh
 * label-only: the caption text and its `aria-labelledby` target stay the same
 * node.
 */
function captionFor(section: UiStringKey): string {
  return format(text('pdfReviewCaption'), { section: text(section) });
}

/**
 * Column header and row label of the `IdType` cell.
 *
 * It is the JSON key itself: the field is an encoding enum (1 = none, 2 = GTIN,
 * 3 = pharmacode, 4 = product number), not translated prose — the same
 * documented exception as the `Prescription` type names and `Rx` acronyms.
 * {@link reviewFieldLabel} falls back to the raw key for any field without a
 * catalogue entry, which is exactly this case.
 */
const ID_TYPE_HEADER = 'IdType';

/**
 * Catalogue keys of the whitelisted scalar labels.
 *
 * Keyed by `section.key`, so the table derives a label from the field instead of
 * storing a snapshot of the English wording: the label is re-resolved on every
 * write, so a locale change needs no rebuild and touches no value.
 */
const FIELD_LABEL_KEYS: Readonly<Partial<Record<string, UiStringKey>>> = {
  'Patient.Lng': 'pdfReviewFieldLanguage',
  'Patient.FName': 'pdfReviewFieldFirstName',
  'Patient.LName': 'pdfReviewFieldLastName',
  'Patient.BDt': 'pdfReviewFieldBirthdate',
  'Patient.Gender': 'pdfReviewFieldGender',
  'Medicaments.Id': 'pdfReviewIdHeader',
  'Medicaments.Unit': 'pdfReviewUnitHeader',
  'Medicaments.AppInstr': 'pdfReviewInstructionsHeader',
};

/**
 * The label of one whitelisted field: its catalogue entry, or the raw JSON key
 * when the field has none (`IdType`).
 *
 * Pure apart from the locale lookup (`text()`), and exported so the mapping —
 * including the deliberate `IdType` fallback — is coverable without a DOM.
 */
export function reviewFieldLabel(section: ReviewSection, key: string): string {
  const labelKey = FIELD_LABEL_KEYS[`${section}.${key}`];
  return labelKey === undefined ? key : text(labelKey);
}

/** Status → text key, class and icon. Text always carries the meaning. */
const STATUS_TEXT_KEYS = {
  recognized: 'statusRecognized',
  'to-verify': 'statusToVerify',
  absent: 'statusAbsent',
} as const satisfies Record<ReviewStatus, UiStringKey>;

const STATUS_CLASSES = {
  recognized: 'is-success',
  'to-verify': 'is-warning',
  absent: 'is-neutral',
} as const satisfies Record<ReviewStatus, string>;

const STATUS_ICONS = {
  recognized: 'circle-check',
  'to-verify': 'triangle-alert',
  absent: 'circle-minus',
} as const satisfies Record<ReviewStatus, string>;

/**
 * Which advisory pattern applies to a field, if any.
 *
 * `Patient.Gender` and `Medicament.IdType` deliberately have none: they are
 * numeric enums the core checks, and a free-text hint ("1 or 2") would restate a
 * rule core already reports better. Advisory coverage is intentionally limited
 * to the shapes a reviewer types by hand.
 */
type AdvisoryKind = 'date';

/**
 * Advisory pattern — guidance, never a verdict.
 *
 * `DATE_PATTERN` mirrors what the parser writes into `Patient.BDt`, an ISO
 * `YYYY-MM-DD` date; the schema types `BDt` as a plain string, so core may still
 * accept something this hint discourages — the core validator remains the only
 * judge.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One editable scalar rendered as a row.
 *
 * `raw` is a reader, not a snapshot: it re-reads the value from the live
 * prescription object, so a status refresh after an edit sees the new value
 * without rebuilding the row.
 */
interface FieldSpec {
  readonly section: ReviewSection;
  readonly index?: number;
  /** JSON key, also used for the parent-chain (missing-required) match. */
  readonly key: string;
  /**
   * Row header, column name in the `aria-label`, and row-summary detail.
   *
   * A provider, not a snapshot: every writer resolves it afresh, so a locale
   * change re-words a label that is already on screen without rebuilding a row.
   */
  readonly label: () => string;
  /** JSON Pointer of the value in the prescription object. */
  readonly pointer: string;
  /** Current text of the field: the stored string/number, else `''`. */
  readonly raw: () => string;
  readonly mono?: boolean;
  /**
   * Counted in the guided required-field counter. Set only for the surfaced
   * fields the MP schema itself requires: `Patient.Lng`, and each medicament's
   * `Id`, `IdType` and `Unit` (`makeField`'s `required` argument).
   */
  readonly required?: boolean;
  /** Advisory pattern applied while the reviewer types; see `AdvisoryKind`. */
  readonly advisory?: AdvisoryKind;
}

/** Everything a table builder needs for one render pass. */
interface RenderContext {
  readonly prescription: ReviewPrescription;
  readonly findings: readonly ReviewFinding[];
  /** `null` while the table is read-only. */
  readonly edit: EditContext | null;
  /** True while the pipeline runs: new inputs must start disabled. */
  readonly disabled: boolean;
  /** True when the panel opted into the guided layer (counter + describedby). */
  readonly guided: boolean;
  /** One closure per status cell/row; see `updateFindings`. */
  readonly refreshers: Array<(findings: readonly ReviewFinding[]) => void>;
  /**
   * One closure per label-bearing node of this render (caption, headers, group
   * and row labels, input accessible names).
   *
   * `relabel` re-runs them, which is the whole locale-refresh mechanism: the
   * nodes and their values are never re-authored, only their words.
   */
  readonly labelWriters: Array<() => void>;
  /** Required specs of the current render, in DOM order, for the counter. */
  readonly requiredFields: FieldSpec[];
  /** JSON Pointer → editable input, for anchors and `getFieldElement`. */
  readonly fieldInputs: Map<string, HTMLInputElement>;
  /**
   * Findings of the current render/last update. Read by the advisory layer from
   * an `input` listener, which fires long after the render closure returned.
   */
  readonly findingsRef: { current: readonly ReviewFinding[] };
}

/** Edit sink plus the inputs it must disable during a run. */
interface EditContext {
  readonly emit: (edit: ReviewEdit) => void;
  readonly inputs: HTMLInputElement[];
}

/** True for a plain object value (never `null`, never an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads one scalar as raw editable text.
 *
 * Numbers are stringified so a numeric scalar (`Patient.Gender`) is editable
 * too; anything that is not a string/number reads as `''`, i.e. absent. The
 * value is *not* trimmed: an input must show what the document actually holds.
 */
function readRaw(record: Record<string, unknown> | undefined, key: string): string {
  if (record === undefined) {
    return '';
  }
  const value = record[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

/** The display text for a raw value: the placeholder when blank. */
function displayValue(raw: string): string {
  const trimmed = raw.trim();
  return trimmed === '' ? text('reviewValuePlaceholder') : trimmed;
}

/** JSON Pointer of one field. */
function pointerFor(section: ReviewSection, index: number | undefined, key: string): string {
  return index === undefined ? `/${section}/${key}` : `/${section}/${index}/${key}`;
}

/** One `FieldSpec`, with its pointer derived from section/index/key. */
function makeField(
  section: ReviewSection,
  index: number | undefined,
  key: string,
  raw: () => string,
  mono = false,
  required = false,
  advisory?: AdvisoryKind,
): FieldSpec {
  return {
    section,
    index,
    key,
    label: () => reviewFieldLabel(section, key),
    pointer: pointerFor(section, index, key),
    raw,
    mono,
    required,
    ...(advisory === undefined ? {} : { advisory }),
  };
}

/**
 * True when `findings` implicate the field at `pointer` / `key`.
 *
 * Two forms are matched: a finding at or below the field's own pointer, and a
 * missing-required finding on any ancestor (Ajv reports `required` on the
 * parent object, naming the missing child in `params.missingProperty`).
 */
function matchesFinding(finding: ReviewFinding, pointer: string, key: string): boolean {
  if (finding.path === pointer || finding.path.startsWith(`${pointer}/`)) {
    return true;
  }
  let child = key;
  let parent = pointer.slice(0, pointer.lastIndexOf('/'));
  for (;;) {
    if (finding.path === parent && finding.missingProperty === child) {
      return true;
    }
    if (parent === '') {
      break;
    }
    const slash = parent.lastIndexOf('/');
    child = parent.slice(slash + 1);
    parent = parent.slice(0, slash);
  }
  return false;
}

/** The first finding that implicates the field, or `null`. */
function implicatedBy(
  findings: readonly ReviewFinding[],
  pointer: string,
  key: string,
): ReviewFinding | null {
  for (const finding of findings) {
    if (matchesFinding(finding, pointer, key)) {
      return finding;
    }
  }
  return null;
}

/**
 * Id of the finding item an implicated input should describe.
 *
 * A missing-required error is rendered as a task row (`task-row-N`) ahead of the
 * prose disclosure, so a field points at the visible task when one implicates
 * it. Otherwise it points at its level item (`finding-error-N`,
 * `finding-warning-N`). The task ordinal is recomputed over the same list, in
 * the same order, as `findings.ts` uses — one formula, no shared mutable state.
 */
function describedByIdFor(
  findings: readonly ReviewFinding[],
  pointer: string,
  key: string,
): string | null {
  let taskOrdinal = 0;
  let firstMatchId: string | null = null;
  for (const finding of findings) {
    const isTask = finding.level === 'error' && isTaskFinding(finding);
    const id = isTask
      ? taskRowId(taskOrdinal)
      : findingItemId(finding.level ?? 'error', finding.index ?? 0);
    if (isTask) {
      taskOrdinal += 1;
    }
    if (matchesFinding(finding, pointer, key)) {
      // A visible task row is the best description; the prose item may sit
      // inside a closed disclosure, so it is only a fallback.
      if (isTask) {
        return id;
      }
      if (firstMatchId === null) {
        firstMatchId = id;
      }
    }
  }
  return firstMatchId;
}

/** Remembers the id this table put on an input, so a refresh can replace it. */
const findingDescribedBy = new WeakMap<HTMLInputElement, string>();

/** Same bookkeeping for the advisory hint id, kept apart from the finding id. */
const advisoryDescribedBy = new WeakMap<HTMLInputElement, string>();

/**
 * Appends (or removes) one id on an input's `aria-describedby`.
 *
 * Always additive: an association from another registry (the core finding id,
 * an advisory hint, a static hint a caller set earlier) is preserved; only the
 * id this registry added earlier is swapped out. An empty result removes the
 * attribute, so a cleared association leaves no dangling reference behind.
 *
 * At most one finding id is associated with an input: the first finding that
 * implicates it (task row first by construction). A field can be named by
 * several findings, but describing it with all of them would read as a wall of
 * prose; the visible task/level item still lists every finding.
 */
function applyDescribedBy(
  input: HTMLInputElement | null,
  id: string | null,
  registry: WeakMap<HTMLInputElement, string>,
): void {
  if (input === null) {
    return;
  }
  const previous = registry.get(input);
  if (previous === id) {
    return;
  }
  const tokens = new Set(
    (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((token) => token !== ''),
  );
  if (previous !== undefined) {
    tokens.delete(previous);
  }
  if (id !== null) {
    tokens.add(id);
  }
  if (tokens.size === 0) {
    input.removeAttribute('aria-describedby');
  } else {
    input.setAttribute('aria-describedby', [...tokens].join(' '));
  }
  if (id === null) {
    registry.delete(input);
  } else {
    registry.set(input, id);
  }
}

/** Refreshes the describedby link of one field after a findings update. */
function refreshDescribedBy(
  input: HTMLInputElement | null,
  findings: readonly ReviewFinding[],
  pointer: string,
  key: string,
): void {
  applyDescribedBy(input, describedByIdFor(findings, pointer, key), findingDescribedBy);
}

/**
 * The advisory message for one input, or `null` when there is nothing to say.
 *
 * De-dup with the core: a field the core already implicates gets no format
 * hint. Its finding (rendered by the findings view) is the message, and a
 * second, differently worded line under the input would only compete with it.
 * The required mark is the exception the plan calls for: it is a quiet
 * statement about the field's own required-ness, so it stays even while a
 * missing-required task row already names the field. It never claims the export
 * is blocked — the counter and the findings say that.
 *
 * Emptiness is judged on the trimmed text (the panel deletes a whitespace-only
 * value), while the patterns run on the text as typed, because that is what the
 * panel would store and what the core would see.
 */
function advisoryMessage(
  field: FieldSpec,
  value: string,
  findings: readonly ReviewFinding[],
): UiStringKey | null {
  if (value.trim() === '') {
    return field.required === true ? 'advisoryRequiredHint' : null;
  }
  if (implicatedBy(findings, field.pointer, field.key) !== null) {
    return null;
  }
  if (field.advisory === 'date' && !DATE_PATTERN.test(value)) {
    return 'advisoryDateFormatHint';
  }
  return null;
}

/** Status of one field: implicated first, then presence. */
function fieldStatus(field: FieldSpec, findings: readonly ReviewFinding[]): ReviewStatus {
  if (implicatedBy(findings, field.pointer, field.key) !== null) {
    return 'to-verify';
  }
  return field.raw().trim() === '' ? 'absent' : 'recognized';
}

/** Status chip: icon + word, so the state never relies on colour. */
function createStatusChip(status: ReviewStatus): HTMLElement {
  const chip = el('span', `review-status ${STATUS_CLASSES[status]}`);
  const icon = el('i', 'review-status-icon');
  icon.setAttribute('data-lucide', STATUS_ICONS[status]);
  icon.setAttribute('aria-hidden', 'true');
  const label = el('span', 'review-status-label');
  label.textContent = text(STATUS_TEXT_KEYS[status]);
  chip.append(icon, label);
  return chip;
}

/** A `<th scope="col">` header cell. */
function createColumnHeader(label: () => string, context: RenderContext): HTMLTableCellElement {
  const cell = el('th');
  cell.setAttribute('scope', 'col');
  trackText(cell, label, context);
  return cell;
}

/**
 * Writes `label()` into a node's text now, and registers the same write for the
 * next locale refresh.
 *
 * The one mechanism behind every static label of the table: a locale change
 * re-runs the writers in place, so no header, caption or row label is ever
 * rebuilt (which is what would drop input values, focus and the caret).
 */
function trackText(node: HTMLElement, label: () => string, context: RenderContext): void {
  node.textContent = label();
  context.labelWriters.push(() => {
    node.textContent = label();
  });
}

/** The same for one attribute (`aria-label`), e.g. a cell's accessible name. */
function trackAttribute(
  node: Element,
  name: string,
  label: () => string,
  context: RenderContext,
): void {
  node.setAttribute(name, label());
  context.labelWriters.push(() => {
    node.setAttribute(name, label());
  });
}

/**
 * Status cell whose content can be recomputed in place.
 *
 * `details` names the implicated fields of a medication row; an empty list
 * leaves just the chip.
 */
function createStatusCell(): {
  readonly cell: HTMLTableCellElement;
  update: (status: ReviewStatus, details?: readonly string[]) => void;
} {
  const cell = el('td', 'review-status-cell');
  const update = (status: ReviewStatus, details: readonly string[] = []): void => {
    cell.replaceChildren(createStatusChip(status));
    if (details.length > 0) {
      const extra = el('span', 'review-status-details');
      extra.textContent = details.join(', ');
      cell.append(extra);
    }
  };
  return { cell, update };
}

/**
 * Value cell: read-only text, or a text input bound to one whitelisted scalar.
 *
 * `rowLabel` is the group ("Patient", "Medicament 2") and completes the
 * per-cell accessible name: a table of same-named inputs ("First name" appears
 * twice) would otherwise be unusable with a screen reader.
 *
 * The input also carries a stable id ({@link reviewInputId}) so anchors and the
 * guided task links can address it, and is registered in the render context for
 * `getFieldElement`.
 *
 * When the field can show an advisory (a pattern or a required-ness) the cell
 * also holds one hidden hint line. `refreshAdvisory` is called on render, on
 * every `updateFindings` and on every keystroke; it swaps the text and the
 * `aria-describedby`/`aria-invalid` wiring only, never the input's value,
 * focus or selection.
 */
function createValueCell(
  field: FieldSpec,
  rowLabel: () => string,
  context: RenderContext,
): {
  readonly cell: HTMLTableCellElement;
  readonly input: HTMLInputElement | null;
  readonly refreshAdvisory: (findings: readonly ReviewFinding[]) => void;
} {
  const cell = el('td', field.mono === true ? 'review-value review-mono' : 'review-value');

  const edit = context.edit;
  if (edit === null) {
    // Read-only cell: the placeholder is a catalogue string, so it takes the same
    // label path as every other text of the table.
    trackText(cell, () => displayValue(field.raw()), context);
    return { cell, input: null, refreshAdvisory: () => undefined };
  }

  cell.classList.add('review-cell-input');
  const input = el('input', 'review-input');
  input.type = 'text';
  input.value = field.raw();
  input.disabled = context.disabled;
  input.id = reviewInputId(field.pointer);
  // A name or an id is not prose: the browser's spell checker would underline
  // every extracted surname.
  input.setAttribute('spellcheck', 'false');
  // Resolved afresh, so `relabel` can re-word the accessible name in place: a
  // name built once at mount would stay English after a locale change.
  trackAttribute(
    input,
    'aria-label',
    () => format(text('reviewCellAriaLabel'), { field: field.label(), row: rowLabel() }),
    context,
  );
  // `change`, not `input`: the value is committed when the user leaves the
  // field (blur or Enter), so a re-validation never runs mid-word.
  input.addEventListener('change', () => {
    edit.emit({
      section: field.section,
      index: field.index,
      key: field.key,
      pointer: field.pointer,
      value: input.value,
    });
  });

  const advisory =
    field.advisory !== undefined || field.required === true ? el('p', 'review-advisory') : null;
  if (advisory !== null) {
    advisory.id = advisoryHintId(field.pointer);
    // Hidden is the resting state: no hint, no stale text, no describedby ref.
    advisory.hidden = true;
  }

  const refreshAdvisory = (findings: readonly ReviewFinding[]): void => {
    if (advisory === null) {
      return;
    }
    const message = advisoryMessage(field, input.value, findings);
    const visible = message !== null;
    advisory.textContent = visible ? text(message) : '';
    advisory.hidden = !visible;
    applyDescribedBy(input, visible ? advisory.id : null, advisoryDescribedBy);
    // The advisory is about the text being typed, so it is the one place that
    // may flag the control as invalid while a format hint shows. A required
    // mark is not an invalid input, and the core finding keeps its own
    // describedby id; the export verdict never changes here.
    if (visible && message !== 'advisoryRequiredHint') {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  };
  input.addEventListener('input', () => refreshAdvisory(context.findingsRef.current));

  edit.inputs.push(input);
  context.fieldInputs.set(field.pointer, input);
  cell.append(input);
  if (advisory !== null) {
    cell.append(advisory);
  }
  return { cell, input, refreshAdvisory };
}

/**
 * The patient table: one `<tbody>` group, one row per editable scalar.
 *
 * A Medication Plan has no prescriber/organisation section, so there is no
 * second group: those rows were the retired Rx document's only.
 */
function createSummaryTable(context: RenderContext): HTMLTableElement {
  const { prescription } = context;
  const table = el('table', 'review-table');

  const caption = el('caption', 'review-table-caption');
  caption.id = CAPTION_ID_SUMMARY;
  trackText(caption, () => captionFor(SECTION_NAME_KEYS.summary), context);

  const head = el('thead');
  const headRow = el('tr');
  headRow.append(
    createColumnHeader(() => text('pdfReviewFieldHeader'), context),
    createColumnHeader(() => text('pdfReviewValueHeader'), context),
    createColumnHeader(() => text('pdfReviewStatusHeader'), context),
  );
  head.append(headRow);

  // Readers go through the live root object, so a section the extractor omitted
  // entirely becomes readable the moment the panel creates it for an edit.
  const readPatient = (key: string): string =>
    readRaw(isRecord(prescription.Patient) ? prescription.Patient : undefined, key);

  /**
   * MP-required Patient fields first, then the optional ones the pipeline
   * fills.
   *
   * Only `Lng` is required by the MP patient schema (`core/schema.ts`), so only
   * `Lng` is counted by the required counter. `FName`/`LName`/`BDt` are surfaced
   * because they are the printable identity a reviewer corrects most often, but
   * the MP schema accepts their absence and the counter must not claim
   * otherwise.
   *
   * The labels come from `FIELD_LABEL_KEYS`, never from this table: `Gender`'s
   * entry spells out the encoded integers (1 = male, 2 = female) because the
   * schema stores that number and the row is where a reviewer reads what it
   * means.
   */
  const patientRows: readonly FieldSpec[] = [
    makeField('Patient', undefined, 'Lng', () => readPatient('Lng'), false, true),
    makeField('Patient', undefined, 'FName', () => readPatient('FName')),
    makeField('Patient', undefined, 'LName', () => readPatient('LName')),
    // `BDt` is a plain string in the schema (no format keyword), so the printed
    // value is edited as-is and a malformed date is reported by the core. The
    // advisory merely reminds the reviewer of the `YYYY-MM-DD` shape the parser
    // writes; it decides nothing.
    makeField('Patient', undefined, 'BDt', () => readPatient('BDt'), false, false, 'date'),
    makeField('Patient', undefined, 'Gender', () => readPatient('Gender')),
  ];

  table.append(
    caption,
    head,
    createFieldGroup(() => text('recapPatientLabel'), patientRows, context),
  );
  return table;
}

/** One `<tbody>`: a spanning group header row, then one row per field. */
function createFieldGroup(
  label: () => string,
  fields: readonly FieldSpec[],
  context: RenderContext,
): HTMLTableSectionElement {
  const body = el('tbody');

  const groupRow = el('tr', 'review-table-group');
  const groupHeader = el('th');
  groupHeader.setAttribute('scope', 'rowgroup');
  groupHeader.colSpan = 3;
  // The recap's row label is the same noun, so it is reused rather than added
  // twice: one word, one translation.
  trackText(groupHeader, label, context);
  groupRow.append(groupHeader);
  body.append(groupRow);

  for (const field of fields) {
    const status = createStatusCell();
    status.update(fieldStatus(field, context.findings));

    if (field.required === true) {
      context.requiredFields.push(field);
    }

    const value = createValueCell(field, label, context);
    if (context.guided) {
      // Initial wiring: the first render must already describe an implicated
      // input, not wait for the first edit to refresh it.
      refreshDescribedBy(value.input, context.findings, field.pointer, field.key);
    }
    // Advisory is not part of the guided layer: it belongs to the editable
    // input itself and is computed from the value that is already on screen.
    value.refreshAdvisory(context.findings);
    const row = el('tr');
    const header = el('th');
    header.setAttribute('scope', 'row');
    trackText(header, field.label, context);
    row.append(header, value.cell, status.cell);
    body.append(row);

    context.refreshers.push((findings) => {
      status.update(fieldStatus(field, findings));
      if (context.guided) {
        refreshDescribedBy(value.input, findings, field.pointer, field.key);
      }
      // Re-applies the de-dup rule against the findings the panel just rendered.
      value.refreshAdvisory(findings);
    });
  }
  return body;
}

/** The medicaments table: one row per `Medicaments[]` entry. */
function createMedicamentsTable(context: RenderContext): HTMLTableElement {
  const { prescription } = context;
  const table = el('table', 'review-table');

  const caption = el('caption', 'review-table-caption');
  caption.id = CAPTION_ID_MEDICAMENTS;
  trackText(caption, () => captionFor(SECTION_NAME_KEYS.medicaments), context);

  const head = el('thead');
  const headRow = el('tr');
  headRow.append(
    createColumnHeader(() => text('pdfReviewPositionHeader'), context),
    createColumnHeader(() => text('pdfReviewIdHeader'), context),
    createColumnHeader(() => ID_TYPE_HEADER, context),
    createColumnHeader(() => text('pdfReviewUnitHeader'), context),
    createColumnHeader(() => text('pdfReviewInstructionsHeader'), context),
    createColumnHeader(() => text('pdfReviewStatusHeader'), context),
  );
  head.append(headRow);

  const body = el('tbody');
  const medicaments = Array.isArray(prescription.Medicaments) ? prescription.Medicaments : [];

  medicaments.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }
    // Re-read the row from the live array: an edit can only change values, so
    // the index stays valid for the lifetime of this table.
    const readEntry = (key: string): string => {
      const list = prescription.Medicaments;
      const live = Array.isArray(list) ? list[index] : undefined;
      return isRecord(live) ? readRaw(live, key) : '';
    };

    // MP requires `Id`, `IdType` and `Unit` on every medicament
    // (`core/schema.ts`). All three are surfaced, so all three are counted; the
    // posology's own required `DtFrom` is an array entry and stays findable only
    // through the findings list, exactly as the header comment says.
    const identityField = makeField(
      'Medicaments',
      index,
      'Id',
      () => readEntry('Id'),
      true,
      true,
    );
    const idTypeField = makeField(
      'Medicaments',
      index,
      'IdType',
      () => readEntry('IdType'),
      false,
      true,
    );
    const unitField = makeField(
      'Medicaments',
      index,
      'Unit',
      () => readEntry('Unit'),
      false,
      true,
    );
    const instructionsField = makeField(
      'Medicaments',
      index,
      'AppInstr',
      () => readEntry('AppInstr'),
    );
    const cells: readonly FieldSpec[] = [
      identityField,
      idTypeField,
      unitField,
      instructionsField,
    ];

    const rowLabel = (): string => format(text('reviewMedicamentRow'), { position: index + 1 });
    const status = createStatusCell();

    const rowCells = cells.map((cell) => createValueCell(cell, rowLabel, context));

    const refreshRow = (findings: readonly ReviewFinding[]): void => {
      const flagged = cells.filter((cell) => fieldStatus(cell, findings) === 'to-verify');
      status.update(
        flagged.length > 0 ? 'to-verify' : 'recognized',
        flagged.map((cell) => cell.label()),
      );
      cells.forEach((cell, cellIndex) => {
        const value = rowCells[cellIndex];
        if (context.guided) {
          refreshDescribedBy(value?.input ?? null, findings, cell.pointer, cell.key);
        }
        value?.refreshAdvisory(findings);
      });
    };
    refreshRow(context.findings);

    for (const cell of cells) {
      if (cell.required === true) {
        context.requiredFields.push(cell);
      }
    }

    const row = el('tr');
    const position = el('td', 'review-pos');
    position.textContent = String(index + 1);
    row.append(
      position,
      ...rowCells.map((cell) => cell.cell),
      status.cell,
    );
    body.append(row);
    context.refreshers.push(refreshRow);
  });

  if (medicaments.length === 0) {
    // No medication row at all: keep the table and say so instead of rendering
    // a header with no body (plan 004, phase 7b manual check).
    const row = el('tr');
    const empty = el('td', 'review-value');
    empty.colSpan = 6;
    trackText(empty, () => text('reviewValuePlaceholder'), context);
    row.append(empty);
    body.append(row);
  }

  table.append(caption, head, body);
  return table;
}

/**
 * Horizontal scroll container for a narrow viewport.
 *
 * `role="region"` + `tabindex="0"` make the overflow area keyboard scrollable
 * (WCAG 2.1.1); it is labelled by the caption it wraps, so the two never drift
 * apart and no extra string is needed.
 *
 * `capped` adds the vertical ceiling (plan 005, phase 4) — only the medicaments
 * table passes it, because only that table grows with the document while the
 * summary has a fixed five rows. The cap is a CSS `max-height`: a table shorter
 * than it does not scroll, so short prescriptions are unchanged, and the region
 * stays the ONE scroll container (no nested scroll trap). The sticky `thead`
 * lives in the stylesheet, not here: `position: sticky` resolves against this
 * element's scrollport, so the header only ever sticks inside its own table.
 */
function createScrollRegion(captionId: string, capped = false): HTMLElement {
  const scroll = el('div', capped ? 'review-table-scroll is-capped' : 'review-table-scroll');
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('tabindex', '0');
  scroll.setAttribute('aria-labelledby', captionId);
  return scroll;
}

/**
 * Renders Lucide's inline SVGs for the icons just added. A missing script only
 * leaves empty placeholders, which the CSS hides — the word still carries the
 * status.
 */
function refreshIcons(): void {
  const lucide = (window as unknown as Record<string, unknown>).lucide as
    | { createIcons: () => void }
    | undefined;
  if (typeof lucide?.createIcons === 'function') {
    lucide.createIcons();
  }
}

/**
 * Mounts the review section inside `parent` and returns its handle.
 *
 * The section starts hidden: before a prescription exists there is nothing to
 * review, and the findings above already tell the story.
 */
export function createReviewTable(
  parent: HTMLElement,
  options: ReviewTableOptions = {},
): ReviewTableHandle {
  const section = el('section', 'panel-section review-table-section');
  section.hidden = true;

  const heading = el('h3');
  heading.textContent = captionFor(SECTION_NAME_KEYS.heading);

  // Editable only with a listener: a cell whose edit would go nowhere is a trap.
  const onEdit = options.editable === true ? options.onEdit : undefined;
  const editable = onEdit !== undefined;
  const guided = options.guidedTasks === true;

  const hint = el('p', 'field-hint review-hint');
  hint.textContent = text('reviewEditableHint');
  hint.hidden = !editable;

  /**
   * Required-field counter (guided layer only).
   *
   * Two spans in one line: the progress and, only while the export is gated, the
   * blocking count. Text, not colour, carries both numbers.
   */
  const requiredCount = el('p', 'review-required-count');
  requiredCount.setAttribute('aria-live', 'polite');
  const requiredProgress = el('span', 'review-required-progress');
  const requiredBlocked = el('span', 'review-required-blocked');
  requiredCount.append(requiredProgress, requiredBlocked);

  const summaryScroll = createScrollRegion(CAPTION_ID_SUMMARY);
  const medicamentsScroll = createScrollRegion(CAPTION_ID_MEDICAMENTS, true);

  section.append(heading, hint);
  if (guided) {
    section.append(requiredCount);
  }
  section.append(summaryScroll, medicamentsScroll);
  parent.append(section);

  /** Live inputs of the current render, for `setDisabled`. */
  const inputs: HTMLInputElement[] = [];
  /** One status refresher per cell/row of the current render. */
  const refreshers: Array<(findings: readonly ReviewFinding[]) => void> = [];
  /** One label writer per label-bearing node of the current render. */
  const labelWriters: Array<() => void> = [];
  /** Required specs of the current render, in DOM order. */
  const requiredFields: FieldSpec[] = [];
  /** JSON Pointer → editable input of the current render. */
  const fieldInputs = new Map<string, HTMLInputElement>();
  /**
   * Findings the inputs should de-dup against. A keystroke listener outlives the
   * render closure, so it reads the latest list through this holder rather than
   * a captured snapshot.
   */
  const findingsRef: { current: readonly ReviewFinding[] } = { current: [] };
  let disabled = false;

  const edit: EditContext | null =
    onEdit === undefined ? null : { emit: onEdit, inputs };

  /**
   * Rewrites the counter from the findings of this pass.
   *
   * HONEST DERIVATION — the denominator is what this table can actually surface
   * *and* the MP schema actually requires: `Patient.Lng` (1) plus one
   * medicament's `Id`, `IdType` and `Unit` per rendered row (`3 × rows`).
   * `FName`/`LName`/`BDt` stay visible but are optional in a Medication Plan, so
   * counting them would overstate the requirement; conversely `Patient.Gender`
   * is optional and never counted. The root's own required scalars (`MedType`,
   * `Id`, `Auth`, `Dt`) and the posology's `DtFrom` have no editable row here,
   * so they are deliberately excluded and covered exclusively by the guided task
   * list, which derives from the core findings.
   *
   * `done` reuses the same `fieldStatus` the cells show: a value only counts
   * when it is present AND no finding implicates it. While any error finding is
   * on screen the second line keeps the counter from ever reading as complete.
   */
  const refreshRequiredCount = (findings: readonly ReviewFinding[]): void => {
    if (!guided) {
      return;
    }
    const done = requiredFields.filter((field) => fieldStatus(field, findings) === 'recognized')
      .length;
    // Guarded writes, like the findings view: an identical sentence must not be
    // rewritten, or the live region re-announces it on every refresh.
    const progress = format(text('reviewRequiredCount'), {
      done,
      total: requiredFields.length,
    });
    if (requiredProgress.textContent !== progress) {
      requiredProgress.textContent = progress;
    }
    const blocking = findings.filter((finding) => finding.level === 'error').length;
    const blocked =
      blocking === 0 ? '' : format(text('reviewRequiredBlocked'), { n: blocking });
    if (requiredBlocked.textContent !== blocked) {
      requiredBlocked.textContent = blocked;
    }
    requiredBlocked.hidden = blocking === 0;
  };

  const context = (prescription: ReviewPrescription, findings: readonly ReviewFinding[]): RenderContext => ({
    prescription,
    findings,
    edit,
    refreshers,
    disabled,
    guided,
    labelWriters,
    requiredFields,
    fieldInputs,
    findingsRef,
  });

  const render = (prescription: ReviewPrescription, findings: readonly ReviewFinding[]): void => {
    refreshers.length = 0;
    labelWriters.length = 0;
    inputs.length = 0;
    requiredFields.length = 0;
    fieldInputs.clear();
    findingsRef.current = findings;
    summaryScroll.replaceChildren(createSummaryTable(context(prescription, findings)));
    medicamentsScroll.replaceChildren(createMedicamentsTable(context(prescription, findings)));
    refreshRequiredCount(findings);
    section.hidden = false;
    refreshIcons();
  };

  const updateFindings = (findings: readonly ReviewFinding[]): void => {
    if (section.hidden) {
      return;
    }
    findingsRef.current = findings;
    for (const refresh of refreshers) {
      refresh(findings);
    }
    refreshRequiredCount(findings);
    refreshIcons();
  };

  /**
   * Re-resolves every label of the built tables for the current locale.
   *
   * LABEL-ONLY (i18n plan 007, phase 5). Two mechanisms, both value-safe:
   * - the label writers rewrite the caption, headers, group/row labels and each
   *   input's `aria-label` — text and attributes only;
   * - `updateFindings` re-runs the status refreshers, which re-word a status chip,
   *   a row summary, an advisory hint and their `aria-describedby` from the
   *   findings already in hand.
   *
   * Nothing here reads a value into a cell, rebuilds a table or re-validates, so
   * every input keeps its value (including text typed but not yet committed),
   * caret, selection and `disabled` state. Status derivation is pure, so running
   * it again cannot change a verdict — only the words that state it.
   */
  const relabel = (): void => {
    heading.textContent = captionFor(SECTION_NAME_KEYS.heading);
    hint.textContent = text('reviewEditableHint');
    for (const write of labelWriters) {
      write();
    }
    updateFindings(findingsRef.current);
  };

  const setDisabled = (value: boolean): void => {
    disabled = value;
    for (const input of inputs) {
      input.disabled = value;
    }
  };

  const getFieldElement = (pointer: string): HTMLElement | null => fieldInputs.get(pointer) ?? null;

  const clear = (): void => {
    // Dropping the nodes (not just hiding them) keeps a stale table out of the
    // accessibility tree after a reset or a failed run.
    refreshers.length = 0;
    labelWriters.length = 0;
    inputs.length = 0;
    requiredFields.length = 0;
    fieldInputs.clear();
    findingsRef.current = [];
    requiredProgress.textContent = '';
    requiredBlocked.textContent = '';
    requiredBlocked.hidden = true;
    summaryScroll.replaceChildren();
    medicamentsScroll.replaceChildren();
    section.hidden = true;
  };

  return { render, updateFindings, relabel, setDisabled, getFieldElement, clear };
}
