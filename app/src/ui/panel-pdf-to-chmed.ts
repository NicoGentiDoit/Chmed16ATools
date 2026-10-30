/**
 * Tab 3 — eMediplan PDF → validated CHMED16A ePrescription.
 *
 * Plain DOM wiring over the Phase 3 pipeline (`pdf-to-prescription.ts`): the
 * selected file is read into bytes, the pipeline runs, and its typed result is
 * rendered as findings, read-only JSON, read-only CHMED string and a QR symbol.
 *
 * The PDF never leaves the browser: extraction, rasterization and OCR all run
 * offline from the app's own bundle, and nothing is persisted.
 *
 * ## Size limit
 *
 * `MAX_PDF_BYTES` (25 MiB) is checked on the `File` metadata *before*
 * `file.arrayBuffer()`, so an oversized file is never pulled into memory. The
 * pipeline keeps its own bounds (page/item/text caps) as defence in depth.
 *
 * ## Failure contract
 *
 * `pdfToPrescription` never throws — every PDF/OCR/parse/validation/encode
 * failure is a typed `{ ok: false, stage, errors }` — and the byte read is
 * wrapped as well, so no throw can reach a DOM handler.
 *
 * ## Draft mode
 *
 * A validate-stage failure that carries a `draft` (fix round 3) shows the parsed
 * prescription in the read-only JSON area under a draft heading and a warning
 * hint; the validation findings stay exactly as they are. Encoding stays gated
 * on validation: the CHMED textarea, its copy/download controls and the QR code
 * remain empty/disabled, because `lastChmed` is only ever set from a successful
 * encoded result.
 *
 * ## Steps (phase 7a)
 *
 * The flow is presented as three steps — 1 Upload, 2 Review, 3 Export — in one
 * linear panel (no routes, no per-step rendering): an `<ol>` above the workspace
 * marks the active step with `aria-current="step"` and names it in text
 * ("Step 2 of 3"), and every existing section keeps its id and behaviour. The
 * DOM order *is* the reading order — upload + preview + findings + review table
 * in the primary column, then the JSON/recap/CHMED/QR outputs in the secondary
 * one — so nothing is hidden or disabled that was visible before: the step
 * indicator is a caption over unchanged controls.
 *
 * ## Review table (phase 7b)
 *
 * Step 2 also shows a mirror of the prescription the pipeline returned
 * (`components/review-table.ts`): the patient data and one row per medicament,
 * each field carrying a "Recognized" / "To verify" / "Absent" status derived
 * from the findings already on screen. The table is hidden whenever no
 * prescription exists (idle, extract/OCR/parse failure, reset) and is rendered
 * again from the draft on a validate-stage failure.
 *
 * ## Inline editing (phase 7c)
 *
 * Every whitelisted scalar in the review table is an `<input type="text">` (see
 * the whitelist in `components/review-table.ts`). A committed edit — the
 * `change` event, i.e. blur or Enter, never every keystroke — is written into
 * the in-memory prescription, re-serialized, and re-checked through the same
 * public core functions every other flow uses: `validateJsonText`, then
 * `jsonToChmed` for the CHMED path. The pipeline's own encode stage is literally
 * `jsonToChmed(parsed.value)` (`core/pdf-to-prescription.ts`), so no
 * transformation is replicated here and the encoded bytes are exactly those of
 * the edited document.
 *
 * From the first edit on, the edited document is the source of truth: the JSON
 * area, the CHMED string and the QR code all describe it, and the unedited
 * pipeline output is no longer separately visible (Clear discards the edits; a
 * new run extracts afresh). Gating is unchanged and works both ways — an edit
 * that invalidates the document shows blocking findings, re-enters draft mode
 * and empties the CHMED/QR outputs; an edit that makes a draft valid exits draft
 * mode and populates them exactly like a pipeline success.
 *
 * Findings after an edit: errors and warnings are replaced by the ones for the
 * edited document. The pipeline's info lines (page count, text layer/OCR)
 * describe the original detection, so they are kept while the edited document
 * still validates — they assert exactly that — and dropped while it does not.
 *
 * A blank input removes the field: absence is what the schema calls "no value",
 * so a cleared required field becomes a blocking `required` finding (export
 * gated) and a cleared optional one disappears instead of encoding as `""`.
 *
 * ## Guided review layer (plan 005, phase 1)
 *
 * The findings view is created with `guidedTasks: true`: every missing-required
 * error is also shown as an actionable task ("Add birthdate" + a link to the
 * field) and the raw validator prose moves under a "Technical details"
 * disclosure. The review table opts in as well, so it shows the required-field
 * counter and points each implicated input at its task/finding item with
 * `aria-describedby`. The recap offers a "Fix ... data" shortcut per implicated
 * section. All of this is presentation: the export verdict stays the core
 * validator's alone, and the two JSON flows (which do not opt in) render exactly
 * as before.
 *
 * ## Structured JSON presentation (plan 005, phase 3)
 *
 * The JSON output section mirrors the CHMED16A → JSON flow's Structured / Raw
 * toggle (same `jsonView*` strings, same `aria-pressed` group, its own
 * in-memory state). The viewer receives the very object the raw textarea was
 * serialized from — `result.draft.prescription`, `result.prescription`, or the
 * edited object after an inline edit — while the textarea stays canonical for
 * copy/download, byte for byte. Marks come from the findings already rendered
 * (required-missing `missingProperty` pointers), never from a second validation,
 * so they clear as soon as an edit fixes the section. A whole absent section has
 * no `<details>` to mark, so the viewer renders a marked placeholder titled with
 * the section name the finding named. The first draft/success switches to
 * Structured unless the user already toggled; clear/reset drops the viewer
 * content and marks but keeps the chosen view.
 *
 * ## Stable recap and findings refreshes (plan 005, phase 4)
 *
 * An inline edit re-validates and refreshes three views. The findings view and
 * the recap update in place (`components/findings.ts`, `renderRecap` below):
 * their nodes are built once per *shape* and an edit then rewrites only the text
 * that changed, so the page scroll position and any focus inside those areas
 * survive the refresh. The review table's capped region keeps its header visible
 * while the medicaments body scrolls (styles.css). A full rebuild still happens
 * on a new run and on a clear/reset — the paths where the content is not "the
 * same list, edited".
 *
 * ## First-page preview
 *
 * As soon as a file passes the size guard and is read, its first page is
 * rasterized into a `<canvas>` in step 1, in parallel with the pipeline and
 * *without* being awaited by it: the preview is best-effort, so a failed or slow
 * render can never block, delay or fail the extraction. It is a second, cheap
 * read of the same bytes — `pdfToPrescription` is still called exactly once per
 * processed file.
 *
 * `renderPageToImageData` takes a `PDFPageProxy`, not bytes, and the document
 * lifecycle (`getDocument` + worker + destroy) belongs to core, not to this
 * panel. The preview therefore calls the exported default render binding
 * (`PDF_TO_PRESCRIPTION_DEPS.renderPages`) with a page count of 1: it opens the
 * document, renders page 1 and destroys it, so a 200-page file still rasterizes
 * exactly one page. No pdfjs call and no core edit is added here.
 *
 * ## Disposal
 *
 * The pipeline takes no `AbortSignal` (Phase 3), so `dispose()` cannot cancel an
 * in-flight call. It instead bumps a generation counter: the late result of a
 * run started before the tab was left is dropped and no DOM is written after
 * disposal. Disposal also drops the retained file bytes and the last CHMED
 * string and clears both output areas, so leaving the tab releases the
 * document's memory as well. The OCR worker is created and terminated *inside*
 * `runOcr`, so the panel never holds a worker of its own; it is torn down when
 * the pipeline call settles.
 *
 * ## Locale refresh (i18n plan 007, phase 5)
 *
 * `refresh()` re-applies this panel's labels for the current locale and keeps
 * every piece of state: the retained PDF bytes, the first-page preview, the JSON
 * textarea (pipeline output or the edited document), the review table's values
 * and any in-progress edit, the CHMED16A string, the QR symbol and the draft
 * banner. It calls no pipeline and no reset: it rewrites text and accessible
 * names and re-derives the four `format()`ed texts (status line, preview failure,
 * draft heading, export recap) from state the panel already tracks.
 *
 * ## Core finding wording (i18n plan 007, phases 7 and 8)
 *
 * `pdf-to-prescription.ts`, `pdf-extract.ts`, the OCR notice and
 * `prescription-parse.ts` return stable codes (with a `detail` where one code
 * covers several messages), so `ui/i18n/core-message.ts` resolves them to the
 * locale at paint time. The schema engine's own text (Ajv messages,
 * `instancePath` pointers) and the validator's placeholder advisories are
 * deliberately left English, and the pipeline's defensive `internal` finding is
 * mapped because the pipeline authors it. Findings already on screen are result
 * snapshots, so `refresh()` does not re-translate them; the next run does.
 */

import { jsonToChmed } from '../core/encode';
import { PDF_TO_PRESCRIPTION_DEPS, pdfToPrescription } from '../core/pdf-to-prescription';
import type {
  PdfPagesRenderResult,
  PdfToPrescriptionFailure,
  PdfToPrescriptionResult,
  PdfToPrescriptionSuccess,
  PdfToPrescriptionWarning,
} from '../core/pdf-to-prescription';
import { generateQr, qrToSvg } from '../core/qr-generate';
import type { QrEcLevel } from '../core/qr-generate';
import { validateJsonText } from '../core/validate';
import type { ValidationError, ValidationResult, ValidationWarning } from '../core/validate';
import { createButtonWithIcon, setButtonLabel, setLeadingIconLabel, svg } from './components/buttons';
import { copyText, downloadText } from './components/clipboard';
import { el } from './components/dom';
import { createTextareaField, setFieldLabels } from './components/fields';
import { createFindingsView, focusAnchorTarget } from './components/findings';
import type { Finding } from './components/findings';
import { createJsonViewer } from './components/json-viewer';
import { createReviewTable } from './components/review-table';
import type { ReviewEdit, ReviewFinding, ReviewPrescription } from './components/review-table';
import { coreMessageText } from './i18n/core-message';
import { format, text } from './strings';
import type { UiStringKey } from './strings';

export interface Panel {
  /** Releases resources held by the panel. */
  dispose(): void;
  /**
   * Re-applies every label of the panel for the current locale without
   * rebuilding it: the retained PDF bytes, the first-page preview, the extracted
   * or edited JSON, every review-table value and the encoded output (string and
   * QR symbol) are all kept as they are.
   */
  refresh?(): void;
}

const EC_LEVELS: readonly QrEcLevel[] = ['L', 'M', 'Q', 'H'];
const DEFAULT_EC_LEVEL: QrEcLevel = 'M';

/** Ceiling on a selected PDF (25 MiB), checked before the file is read. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const FILE_INPUT_ID = 'pdf-to-chmed-file';
const JSON_OUTPUT_ID = 'pdf-to-chmed-json';
const CHMED_OUTPUT_ID = 'pdf-to-chmed-chmed';
const EC_ID = 'pdf-to-chmed-ec';

/**
 * Where a finding links, keyed by the area the finding concerns. Extract and OCR
 * failures happen before a prescription exists, so they point back at the file
 * picker; parse/validate/encode findings point at the JSON area (which holds the
 * draft when validation produced one).
 */
const ANCHOR_TARGET_IDS = {
  file: FILE_INPUT_ID,
  json: JSON_OUTPUT_ID,
} as const;

type AnchorArea = keyof typeof ANCHOR_TARGET_IDS;

function warningFindings(warnings: readonly PdfToPrescriptionWarning[]): Finding[] {
  // Parser warnings carry a `detail` and follow the locale; schema warnings
  // carry codes no core mapping knows and keep their English text (out of
  // scope). The pipeline's own `ocr-low-confidence` notice is a mapped code.
  // The fallback chain makes all three one call.
  return warnings.map((warning) => ({ path: warning.path, message: coreMessageText(warning) }));
}

/**
 * One validator error as a display finding.
 *
 * `keyword` and `params.missingProperty` are carried through so the guided task
 * layer can tell a missing required value from any other failure. They are extra
 * optional fields on `Finding`; the message and path are untouched, so the prose
 * shown to the user is byte-identical to the pre-005 rendering.
 */
function validationFinding(error: ValidationError): Finding {
  const missingProperty = error.params.missingProperty;
  return {
    path: error.instancePath,
    message: error.message,
    keyword: error.keyword,
    ...(typeof missingProperty === 'string' ? { missingProperty } : {}),
  };
}

/**
 * Flattens a typed pipeline failure.
 *
 * Each stage owns its own error shape (Phase 1 `ParseError`, Phase 2 adapter
 * errors, validator `ValidationError`), so the path/label comes from whichever
 * field that stage actually populates.
 */
function failureFindings(failure: PdfToPrescriptionFailure): Finding[] {
  switch (failure.stage) {
    case 'extract':
    case 'ocr':
      // Extract/OCR errors carry a stable code (plus a `detail` for the reader
      // bounds), so the wording comes from the locale, not from core prose.
      return failure.errors.map((error) => ({
        path: error.code,
        message: coreMessageText(error),
      }));
    case 'parse':
      // Parser findings carry a stable `detail` sub-code (plus the printed
      // values as `params`), so the wording comes from the locale. The `path`
      // stays the parser's JSON Pointer: it is what the anchor resolver and the
      // guided tasks point at.
      return failure.errors.map((error) => ({
        path: error.path,
        message: coreMessageText(error),
      }));
    case 'validate':
    case 'encode':
      return failure.errors.map(pipelineValidationFinding);
    default:
      return [];
  }
}

/**
 * A validate/encode finding as display text.
 *
 * The schema engine's text (`required`, `type`, `enum`, ...) is out of this
 * phase's scope and stays English. The one exception is the pipeline's own
 * defensive finding (`keyword: 'internal'`, a stage that threw): it is prose
 * `pdf-to-prescription.ts` authors itself, mapped like a code. Inline edits
 * report their own failure through a different path (`errorFindings`), so this
 * mapping can never overwrite `reviewInvalidEdit`.
 */
function pipelineValidationFinding(error: ValidationError): Finding {
  if (error.keyword === 'internal') {
    return {
      path: error.instancePath,
      message: coreMessageText({ code: 'internal' }),
      keyword: error.keyword,
    };
  }
  return validationFinding(error);
}

/**
 * Flattens the validator's findings for the review table.
 *
 * The table keeps the raw `instancePath` (a JSON Pointer such as
 * `/Patient/BDt`) plus Ajv's `params.missingProperty`, because a missing
 * required property is reported on the *parent* object (`''` for a missing
 * `Patient`). `failureFindings` keeps that parameter for display too, but the
 * table also needs the finding's level and position so it can point an input at
 * the exact item id the findings view rendered.
 */
function validationReviewFindings(errors: readonly ValidationError[]): ReviewFinding[] {
  return errors.map((error, index) => {
    const missingProperty = error.params.missingProperty;
    return {
      path: error.instancePath,
      keyword: error.keyword,
      level: 'error',
      index,
      ...(typeof missingProperty === 'string' ? { missingProperty } : {}),
    };
  });
}

/** Warnings use the same JSON Pointer format in their `path`. */
function warningReviewFindings(warnings: readonly PdfToPrescriptionWarning[]): ReviewFinding[] {
  return warnings.map((warning, index) => ({
    path: warning.path,
    level: 'warning',
    index,
  }));
}

/**
 * The key of the status line for a typed pipeline failure.
 *
 * Returns a key, not resolved text: the panel repaints its status line on a
 * locale change, and the wording is derived from the failure the panel still
 * holds (`statusSource`), so re-resolving must go through the same switch.
 */
function stageMessage(failure: PdfToPrescriptionFailure): UiStringKey {
  switch (failure.stage) {
    case 'extract':
      return 'pdfStageExtract';
    case 'ocr':
      return 'pdfStageOcr';
    case 'parse':
      // The parse stage owns two different outcomes: an unrecognized layout
      // (nothing that looks like a printed eMediplan table) and a recognized
      // table whose printed values could not be read (a typed `invalid-value`
      // or `missing-field`). Only the first deserves the "no prescription"
      // wording; the second must stay truthful about what was found.
      return failure.errors.some((error) => error.code === 'unsupported-layout')
        ? 'pdfStageParse'
        : 'pdfStageParseValues';
    case 'validate':
      return 'pdfStageValidate';
    case 'encode':
      return 'pdfStageEncode';
    default:
      return 'pdfUnexpected';
  }
}

/** The positive counterpart of the warning list: what the pipeline did. */
function successFindings(result: PdfToPrescriptionSuccess): Finding[] {
  const pages = String(result.pageCount);
  const source = result.confidence === 'low' ? text('pdfSuccessOcr') : text('pdfSuccessTextLayer');
  return [
    { path: '', message: format(source, { pages }) },
    { path: '', message: text('pdfSuccessValidated') },
  ];
}

/** True for a plain object value (never `null`, never an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One scalar as recap text: trimmed and rendered, or `''` when absent.
 *
 * Mirrors the review table's reader (strings and finite numbers only) without
 * reusing its module: the recap must never invent a value the table would show
 * as absent, and it must not mutate anything.
 */
function scalarText(record: unknown, key: string): string {
  if (!isRecord(record)) {
    return '';
  }
  const value = record[key];
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

/** `FName LName`, or `''` when the section has neither name part. */
function fullName(record: unknown): string {
  return [scalarText(record, 'FName'), scalarText(record, 'LName')]
    .filter((part) => part !== '')
    .join(' ');
}

/** Which presentation of the extracted JSON is visible (phase 3). */
type JsonOutputView = 'structured' | 'raw';

/**
 * Toggle button: a plain secondary button with the pressed state in ARIA.
 *
 * Mirrors the CHMED16A → JSON flow's control (that module is out of this
 * phase's scope); the two panels share the `jsonView*` strings but keep
 * independent state.
 */
function createViewToggleButton(parent: HTMLElement, label: string): HTMLButtonElement {
  const button = el('button', 'secondary view-toggle-button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  parent.append(button);
  return button;
}

/**
 * Top-level sections implicated by required-missing findings.
 *
 * Pure derivation from findings already in hand — the viewer never re-validates.
 * Ajv reports a missing required property on its parent, so `''` + `Patient`
 * names a whole absent section while `/Patient` + `Lng` and
 * `/Medicaments/0` + `Id` name a field of an existing section (first segment).
 */
function requiredMissingSections(errors: readonly ValidationError[]): Set<string> {
  const sections = new Set<string>();
  for (const error of errors) {
    if (error.keyword !== 'required') {
      continue;
    }
    const missing = error.params.missingProperty;
    if (typeof missing !== 'string') {
      continue;
    }
    if (error.instancePath === '') {
      sections.add(missing);
      continue;
    }
    const [root] = error.instancePath.replace(/^\/+/, '').split('/');
    if (root !== undefined && root !== '') {
      sections.add(root);
    }
  }
  return sections;
}

/** Flattens blocking findings for the findings view (path + message + task data). */
function errorFindings(errors: readonly ValidationError[]): Finding[] {
  return errors.map(validationFinding);
}

/**
 * The synthetic blocking finding of an unexpected re-validation throw.
 *
 * Shaped like a validator error so the two lists can be rendered by the same
 * code; the wording says plainly that the edit was not checked.
 */
function editFailure(): ValidationError {
  return {
    instancePath: '',
    keyword: 'internal',
    message: text('reviewInvalidEdit'),
    params: {},
  };
}

/**
 * The one whitelist field the schema types as a number (`core/schema.ts`).
 *
 * Keyed by section+key rather than by the current value, so it also works while
 * the field is still absent — a reviewer must be able to supply a missing one.
 * `Patient.Gender` is an enum (1|2); `Medicaments.IdType` is an enum (1..4).
 */
const NUMERIC_EDIT_FIELDS: ReadonlySet<string> = new Set([
  'Patient.Gender',
  'Medicaments.IdType',
]);

/**
 * The value to store for one non-blank edit.
 *
 * An `<input>` yields text only. `Patient.Gender` and `Medicaments.IdType` are
 * the numeric whitelist fields (`integer` enums), so a numeric entry is written
 * back as a number to keep the document's own type; every other value is stored
 * exactly as typed. Nothing is coerced beyond that, and nothing is validated
 * here: whether a value is acceptable is the core validator's call, and `3` or
 * `X` in a gender cell is reported by core exactly like any other bad value.
 */
function storedValue(edit: ReviewEdit, typed: string): string | number {
  if (!NUMERIC_EDIT_FIELDS.has(`${edit.section}.${edit.key}`)) {
    return typed;
  }
  const numeric = Number(typed);
  return Number.isFinite(numeric) ? numeric : typed;
}

/**
 * The section object of an edit target, created when the extractor omitted it.
 *
 * A missing `Patient` is one of the drafts this phase exists to fix, and the
 * data model declares a whole section rather than a partial, so an empty
 * placeholder object is the only way to grow one. `Object.assign` keeps the
 * write off a cast; core validates the result, so a half-filled section is
 * reported, never accepted. A Medication Plan has no other object section: the
 * medicaments are rows of an array and are written through `writeEdit` directly.
 */
function sectionObject(
  prescription: ReviewPrescription,
  section: 'Patient',
): Record<string, unknown> {
  const existing: unknown = prescription[section];
  if (isRecord(existing)) {
    return existing;
  }
  const created: Record<string, unknown> = {};
  Object.assign(prescription, { [section]: created });
  return created;
}

/**
 * Writes one inline edit into the prescription object the table renders.
 *
 * The table only ever emits whitelisted scalars (section + key + raw text), so
 * this writer cannot reach `Pos`, `Patient.Ids` or any other object or array
 * (`IdType` is a whitelisted scalar and therefore editable). A blank input
 * removes the key: an empty `<input>` means "no value", and
 * absence is what the schema calls it — a required field then fails its
 * `required` rule (blocking, export gated), while an optional one simply
 * disappears instead of turning into an empty string.
 *
 * @returns `false` when the target row no longer exists (stale table).
 */
function writeEdit(prescription: ReviewPrescription, edit: ReviewEdit): boolean {
  let target: Record<string, unknown>;
  if (edit.section === 'Medicaments') {
    const list = prescription.Medicaments;
    const entry =
      Array.isArray(list) && edit.index !== undefined ? list[edit.index] : undefined;
    if (!isRecord(entry)) {
      return false;
    }
    target = entry;
  } else {
    target = sectionObject(prescription, edit.section);
  }

  if (edit.value.trim() === '') {
    delete target[edit.key];
    return true;
  }
  target[edit.key] = storedValue(edit, edit.value);
  return true;
}

/**
 * Recap shortcuts offered when a section is implicated (plan 005, phase 1).
 *
 * A Medication Plan has no provider block, so the only object section the review
 * table renders — and therefore the only shortcut that can resolve — is
 * `Patient`. The label is passed through `recapFixField`; the pointer is the
 * same target the guided task link focuses, so both affordances land on one
 * control. The section noun is a key (`recapFixSectionPatient`) because it is
 * read, not because it is structural: the three templates inflect it
 * differently, so each locale supplies the form its sentence needs.
 */
const RECAP_FIX_SECTIONS = [
  { section: 'Patient', labelKey: 'recapFixSectionPatient', pointer: '/Patient/FName' },
] as const satisfies readonly {
  readonly section: string;
  readonly labelKey: UiStringKey;
  readonly pointer: string;
}[];

/** True when any finding concerns the section or names it as missing. */
function sectionImplicated(findings: readonly ReviewFinding[], section: string): boolean {
  const pointer = `/${section}`;
  return findings.some(
    (finding) =>
      finding.path === pointer ||
      finding.path.startsWith(`${pointer}/`) ||
      finding.missingProperty === section,
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function mountPdfToChmed(container: HTMLElement): Panel {
  container.replaceChildren();

  const heading = el('h2');
  heading.textContent = text('tabPdfToChmed');
  container.append(heading);

  // Presentation of the flow as 1 Upload → 2 Review → 3 Export. This is a
  // caption over unchanged sections, not a second navigation model: the active
  // item is the only thing that changes, and the step name is always text.
  // Both texts are re-resolved by `refreshLabels`, so the nodes are kept.
  const STEP_LABEL_KEYS = ['pdfStep1Label', 'pdfStep2Label', 'pdfStep3Label'] as const;
  const stepList = el('ol', 'flow-steps');
  stepList.setAttribute('aria-label', text('pdfStepIndicatorLabel'));
  /** Step name nodes, in step order (`refreshLabels` rewrites them in place). */
  const stepNames: HTMLElement[] = [];
  /** "Step N of 3" nodes, in step order. */
  const stepPositions: HTMLElement[] = [];
  const stepItems = STEP_LABEL_KEYS.map((key, index) => {
    const item = el('li', 'flow-step');
    // The disc repeats the position the "Step N of 3" text already states.
    const number = el('span', 'flow-step-number');
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1);
    const body = el('span', 'flow-step-text');
    const position = el('span', 'flow-step-of');
    position.textContent = format(text('pdfStepOf'), { current: index + 1 });
    const name = el('span', 'flow-step-label');
    name.textContent = text(key);
    stepNames.push(name);
    stepPositions.push(position);
    body.append(position, name);
    item.append(number, body);
    return item;
  });
  stepList.append(...stepItems);
  container.append(stepList);

  // Primary column first in the DOM (keyboard order = visual order at every
  // breakpoint): the loaded file, its first page, then what was read from it —
  // findings and the reviewable data mirror. The secondary column holds only
  // the outputs (JSON, recap, CHMED, QR), so the DOM order reads as the step
  // order both stacked and in the desktop grid.
  const workspace = el('div', 'workspace');
  const primaryColumn = el('div', 'workspace-primary');
  const secondaryColumn = el('div', 'workspace-secondary');
  workspace.append(primaryColumn, secondaryColumn);
  container.append(workspace);

  const inputSection = el('section', 'panel-section');
  primaryColumn.append(inputSection);

  const fileField = el('div', 'field');
  const fileLabel = el('label', 'field-label');
  fileLabel.htmlFor = FILE_INPUT_ID;
  fileLabel.textContent = text('pdfFileLabel');
  fileLabel.insertAdjacentHTML('afterbegin', svg('upload'));

  const fileInput = el('input', 'field-input');
  fileInput.type = 'file';
  fileInput.accept = 'application/pdf';
  fileInput.id = FILE_INPUT_ID;

  const fileHint = el('p', 'field-hint');
  fileHint.id = `${FILE_INPUT_ID}-hint`;
  fileHint.textContent = text('pdfFileHint');
  fileInput.setAttribute('aria-describedby', fileHint.id);

  fileField.append(fileLabel, fileInput, fileHint);
  inputSection.append(fileField);

  const inputActions = el('div', 'actions');
  inputSection.append(inputActions);
  const processButton = createButtonWithIcon(inputActions, text('pdfProcess'), 'search');
  processButton.disabled = true;

  const scanStatus = el('p', 'scan-status');
  scanStatus.setAttribute('aria-live', 'polite');
  inputSection.append(scanStatus);

  // Step 1's preview: a bordered card that stays `hidden` (no layout shift)
  // until a page has actually been rasterized.
  const previewSection = el('section', 'panel-section');
  const previewHeading = el('h3');
  previewHeading.textContent = text('pdfPreviewHeading');
  const previewFrame = el('div', 'pdf-preview-frame');
  previewFrame.hidden = true;
  const previewCanvas = el('canvas', 'pdf-preview-canvas');
  previewCanvas.setAttribute('role', 'img');
  previewCanvas.setAttribute('aria-label', text('pdfPreviewAriaLabel'));
  previewFrame.append(previewCanvas);
  const previewStatus = el('p', 'pdf-preview-status');
  previewStatus.setAttribute('aria-live', 'polite');
  previewSection.append(previewHeading, previewFrame, previewStatus);
  primaryColumn.append(previewSection);

  /** Which output area the current findings belong to; see `ANCHOR_TARGET_IDS`. */
  let anchorArea: AnchorArea = 'json';

  const findings = createFindingsView(primaryColumn, text('pdfFindingsHeading'), {
    getAnchorTarget: resolveFindingTarget,
    // Plan 005, phase 1: the PDF panel is the only flow with the guided task
    // layer, item ids and describedby wiring; flows 1 and 2 keep the pre-005
    // rendering byte-for-byte.
    guidedTasks: true,
  });

  // Step 2's reviewable data mirror, directly after the findings: check the
  // state first, then see — and fix — the values it talks about. It lives in
  // the primary column with the findings (both describe the document that was
  // read) and stays hidden until a prescription exists (success or draft), so a
  // parse failure shows no table.
  const reviewTable = createReviewTable(primaryColumn, {
    editable: true,
    guidedTasks: true,
    onEdit: (edit) => applyEdit(edit),
  });

  /**
   * First rendered field of each object section: a missing whole section points
   * here rather than at a field that does not exist yet. A Medication Plan's only
   * object section is `Patient`; the medicaments are array rows, handled below.
   */
  const SECTION_FIRST_FIELD = { Patient: 'FName' } as const;

  /**
   * The JSON Pointer a missing-required finding points at.
   *
   * Ajv reports a missing required property on its *parent*: `''` + `Patient`
   * names a whole absent section, `/Patient` + `Lng` names one absent field, and
   * `/Medicaments/0` + `Id` names an absent cell of the first medicament row.
   */
  function missingTargetPointer(finding: Finding): string | null {
    const missing = finding.missingProperty;
    if (missing === undefined) {
      return null;
    }
    if (finding.path !== '') {
      return `${finding.path}/${missing}`;
    }
    const first = SECTION_FIRST_FIELD[missing as keyof typeof SECTION_FIRST_FIELD];
    return first === undefined ? `/${missing}` : `/${missing}/${first}`;
  }

  /**
   * Best-effort field for a finding whose exact pointer is not rendered.
   *
   * A Medication Plan's object sections are `Patient` and the medicaments array.
   * A finding that names a root scalar (`MedType`, `Auth`, ...) or an optional
   * array entry the table does not surface has no editable row, so it resolves
   * to the output area instead of dead-ending. A medicament finding lands on its
   * row's `Id` cell, and a missing patient section on its first row.
   */
  function sectionFallbackPointer(finding: Finding): string | null {
    const section =
      finding.path === ''
        ? finding.missingProperty
        : finding.path.replace(/^\/+/, '').split('/')[0];
    switch (section) {
      case 'Patient':
        return '/Patient/FName';
      case 'Medicaments': {
        const match = /^\/Medicaments\/(\d+)/.exec(finding.path);
        return match?.[1] === undefined ? null : `/Medicaments/${match[1]}/Id`;
      }
      default:
        return null;
    }
  }

  /**
   * Anchor resolver for both the findings items and the guided task links.
   *
   * A missing-required finding resolves to the review-table input it names, so
   * "Go to field" and the recap shortcut share one target. Every other finding
   * keeps the pre-005 behaviour: the output area its stage belongs to.
   */
  function resolveFindingTarget(finding: Finding): HTMLElement | null {
    if (finding.missingProperty !== undefined) {
      const pointer = missingTargetPointer(finding);
      const exact = pointer === null ? null : reviewTable.getFieldElement(pointer);
      if (exact !== null) {
        return exact;
      }
      const fallback = sectionFallbackPointer(finding);
      const sectionField = fallback === null ? null : reviewTable.getFieldElement(fallback);
      if (sectionField !== null) {
        return sectionField;
      }
    }
    return document.getElementById(ANCHOR_TARGET_IDS[anchorArea]);
  }

  const jsonSection = el('section', 'panel-section');
  const jsonHeading = el('h3');
  jsonHeading.textContent = text('pdfJsonOutputHeading');
  jsonSection.append(jsonHeading);

  /**
   * Draft banner. Shown only when a validate-stage failure carries a parsed
   * prescription: it explains that the JSON below is a draft and that the
   * blocking findings must be fixed before anything is encoded.
   */
  const draftHint = el('p', 'field-hint draft-banner');
  draftHint.textContent = text('pdfDraftHint');
  draftHint.hidden = true;
  jsonSection.append(draftHint);

  // View toggle (plan 005, phase 3): its own row above the output, outside the
  // copy/download `.actions` row, exactly like the CHMED16A → JSON flow. The
  // strings are reused; state, handlers and the viewer instance are this
  // panel's own. `aria-pressed` carries the state for assistive technology.
  const jsonViewToggle = el('div', 'view-toggle');
  jsonViewToggle.setAttribute('role', 'group');
  jsonViewToggle.setAttribute('aria-label', text('jsonViewGroupLabel'));
  const structuredJsonButton = createViewToggleButton(
    jsonViewToggle,
    text('jsonViewStructured'),
  );
  const rawJsonButton = createViewToggleButton(jsonViewToggle, text('jsonViewRaw'));
  jsonSection.append(jsonViewToggle);

  // Two hosts, only one visible at a time. The raw host keeps the textarea (and
  // its copy/download data source) untouched; the structured host holds the
  // presentation-only viewer.
  const jsonRawView = el('div', 'json-view-raw');
  jsonSection.append(jsonRawView);

  const jsonOutput = createTextareaField(jsonRawView, {
    id: JSON_OUTPUT_ID,
    label: text('pdfJsonOutputLabel'),
    hint: text('jsonOutputHint'),
    rows: 14,
    readOnly: true,
  });

  const jsonStructuredView = el('div', 'json-view-structured');
  jsonSection.append(jsonStructuredView);
  const jsonViewer = createJsonViewer(jsonStructuredView);

  const jsonActions = el('div', 'actions');
  jsonSection.append(jsonActions);
  const jsonClearButton = createButtonWithIcon(jsonActions, text('clear'), 'eraser', {
    className: 'secondary',
    accessibleName: text('clearJsonOutputAccessibleName'),
  });
  const jsonCopyButton = createButtonWithIcon(jsonActions, text('copy'), 'copy', {
    className: 'secondary',
    accessibleName: text('copyJsonAccessibleName'),
  });
  const jsonDownloadButton = createButtonWithIcon(jsonActions, text('download'), 'download', {
    className: 'secondary',
    accessibleName: text('downloadJsonAccessibleName'),
  });
  jsonCopyButton.disabled = true;
  jsonDownloadButton.disabled = true;

  const jsonStatus = el('p', 'copy-status');
  jsonStatus.setAttribute('aria-live', 'polite');
  jsonSection.append(jsonStatus);
  // First in the secondary column: JSON → recap → CHMED → QR (plan 004 order).
  secondaryColumn.append(jsonSection);

  // Step 3's recap, above the CHMED output it describes: a definition list of
  // what will actually be exported. The rows are STABLE (plan 005, phase 4): the
  // `<dl>` is built once per row *shape* and a refresh only rewrites the `dd`
  // whose content actually changed, so an edit cannot move the page scroll or
  // drop a focus that sits inside the recap. A full rebuild happens only when
  // the row set changes — the conditional extraction row — i.e. on a run result
  // or a reset, never on an edit. `aria-live="polite"` announces the new summary
  // without interrupting the user; unchanged rows are not touched at all, so a
  // quiet edit does not re-announce the whole list.
  const recapSection = el('section', 'panel-section export-recap');
  recapSection.hidden = true;
  const recapHeading = el('h3');
  recapHeading.textContent = text('exportRecapHeading');
  const recapList = el('dl', 'recap-list');
  recapList.setAttribute('aria-live', 'polite');
  // Contextual shortcuts to the review table (plan 005, phase 1), created once
  // and toggled with `hidden` so a refresh never recreates a focused button.
  const recapActions = el('div', 'recap-actions');
  recapSection.append(recapHeading, recapList, recapActions);
  secondaryColumn.append(recapSection);

  /** Stable rows of the recap; see `renderRecap` for the rebuild contract. */
  type RecapRowKey =
    | 'patient'
    | 'medicaments'
    | 'extraction'
    | 'edits'
    | 'verdict';

  /** One `dt`/`dd` pair. Both nodes are stable for the lifetime of their shape. */
  interface RecapRow {
    readonly term: HTMLElement;
    readonly value: HTMLElement;
  }

  /** One run of a `dd`: plain text, a mono identifier, or the "Edited" badge. */
  type RecapPart = { readonly text: string; readonly mono?: boolean } | { readonly badge: string };

  const recapRows = new Map<RecapRowKey, RecapRow>();
  /** Content signature per row, so an unchanged row is not written at all. */
  const recapSignatures = new Map<RecapRowKey, string>();
  /** Keys of the currently built shape, `null` while nothing is built. */
  let recapShape: string | null = null;

  /**
   * Sets a row's `<dt>`. The label of a key never changes; the write is skipped
   * when it is already correct (every refresh after the first).
   */
  function setRecapTerm(key: RecapRowKey, label: string): void {
    const term = recapRows.get(key)?.term;
    if (term !== undefined && term.textContent !== label) {
      term.textContent = label;
    }
  }

  /**
   * Signature of the DOM a value would produce; equal ⇒ nothing to write.
   *
   * The absent branch renders `reviewValuePlaceholder`, so that text is part of
   * the signature: without it, a locale whose placeholder differs would keep the
   * stale placeholder after a locale switch (the row would look unchanged).
   */
  function recapContentSignature(
    parts: readonly RecapPart[],
    absent: boolean,
    tone: string,
  ): string {
    const body = parts
      .map((part) =>
        'badge' in part ? `b:${part.badge}` : `${part.mono === true ? 'm' : 't'}:${part.text}`,
      )
      .join('\u0000');
    const content = absent ? `a:${text('reviewValuePlaceholder')}` : `p:${body}`;
    return `${content}|${tone}`;
  }

  /**
   * Writes one recap value, and only when it changed.
   *
   * `parts` describes the `dd` content exactly as a rebuild would author it: a
   * single plain run becomes one text node (`textContent`), several runs are
   * joined with " · ", a mono part is a `span.recap-mono` and a badge part is a
   * `span.recap-badge`. The `dd` node itself is never replaced, so the row keeps
   * its position in the grid and its place in the reading order.
   */
  function writeRecapValue(
    key: RecapRowKey,
    parts: readonly RecapPart[],
    options: {
      readonly absent?: boolean;
      readonly tone?: 'is-warning' | 'is-success' | 'is-error';
    } = {},
  ): void {
    const row = recapRows.get(key);
    if (row === undefined) {
      return;
    }
    const absent = options.absent === true;
    const tone = options.tone ?? '';
    row.value.classList.toggle('recap-absent', absent);
    row.value.classList.toggle('is-warning', tone === 'is-warning');
    row.value.classList.toggle('is-success', tone === 'is-success');
    row.value.classList.toggle('is-error', tone === 'is-error');

    const signature = recapContentSignature(parts, absent, tone);
    if (recapSignatures.get(key) === signature) {
      return;
    }
    recapSignatures.set(key, signature);

    if (absent) {
      row.value.textContent = text('reviewValuePlaceholder');
      return;
    }
    const single = parts.length === 1 ? parts[0] : undefined;
    if (single !== undefined && 'text' in single && single.mono !== true) {
      row.value.textContent = single.text;
      return;
    }
    row.value.replaceChildren();
    parts.forEach((part, index) => {
      if (index > 0) {
        row.value.append(document.createTextNode(' · '));
      }
      if ('badge' in part) {
        const badge = el('span', 'recap-badge');
        badge.textContent = part.badge;
        row.value.append(badge);
      } else if (part.mono === true) {
        const mono = el('span', 'recap-mono');
        mono.textContent = part.text;
        row.value.append(mono);
      } else {
        row.value.append(document.createTextNode(part.text));
      }
    });
  }

  /** Builds the `<dt>`/`<dd>` pairs of a new row set; the only rebuild path. */
  function rebuildRecap(keys: readonly RecapRowKey[]): void {
    recapList.replaceChildren();
    recapRows.clear();
    recapSignatures.clear();
    for (const key of keys) {
      const term = el('dt', 'recap-term');
      const value = el('dd', 'recap-value');
      recapList.append(term, value);
      recapRows.set(key, { term, value });
    }
  }

  /**
   * The "Fix ... data" shortcuts, created once.
   *
   * A button is only shown while its section is implicated (see
   * `renderRecapActions`); the node itself is never recreated, so a focused
   * shortcut survives a refresh that keeps it visible.
   */
  const recapFixButtons = RECAP_FIX_SECTIONS.map(({ labelKey, pointer }) => {
    const button = el('button', 'secondary recap-fix');
    button.type = 'button';
    button.textContent = format(text('recapFixField'), { section: text(labelKey) });
    button.hidden = true;
    button.addEventListener('click', () => {
      // Same target as the guided task link: one control, two affordances.
      const target = reviewTable.getFieldElement(pointer);
      if (target !== null) {
        focusAnchorTarget(target);
      }
    });
    recapActions.append(button);
    return button;
  });

  const chmedSection = el('section', 'panel-section');
  const chmedHeading = el('h3');
  chmedHeading.textContent = text('chmedOutputHeading');
  chmedSection.append(chmedHeading);
  secondaryColumn.append(chmedSection);

  const chmedOutput = createTextareaField(chmedSection, {
    id: CHMED_OUTPUT_ID,
    label: text('chmedOutputLabel'),
    hint: text('chmedOutputHint'),
    rows: 8,
    readOnly: true,
  });

  const chmedActions = el('div', 'actions');
  chmedSection.append(chmedActions);
  const chmedClearButton = createButtonWithIcon(chmedActions, text('clear'), 'eraser', {
    className: 'secondary',
    accessibleName: text('clearChmedOutputAccessibleName'),
  });
  const chmedCopyButton = createButtonWithIcon(chmedActions, text('copy'), 'copy', {
    className: 'secondary',
    accessibleName: text('copyChmedAccessibleName'),
  });
  const chmedDownloadButton = createButtonWithIcon(chmedActions, text('download'), 'download', {
    className: 'secondary',
    accessibleName: text('downloadChmedAccessibleName'),
  });
  chmedCopyButton.disabled = true;
  chmedDownloadButton.disabled = true;

  const chmedStatus = el('p', 'copy-status');
  chmedStatus.setAttribute('aria-live', 'polite');
  chmedSection.append(chmedStatus);

  const qrSection = el('section', 'panel-section');
  const qrHeading = el('h3');
  qrHeading.textContent = text('qrHeading');
  qrSection.append(qrHeading);
  secondaryColumn.append(qrSection);

  const ecField = el('div', 'field field-inline');
  const ecLabel = el('label', 'field-label');
  ecLabel.htmlFor = EC_ID;
  ecLabel.textContent = text('qrEcLabel');

  const ecSelect = el('select', 'field-select');
  ecSelect.id = EC_ID;
  for (const level of EC_LEVELS) {
    const option = el('option');
    option.value = level;
    option.textContent = level;
    ecSelect.append(option);
  }
  ecSelect.value = DEFAULT_EC_LEVEL;

  const ecHint = el('p', 'field-hint');
  ecHint.id = `${EC_ID}-hint`;
  ecHint.textContent = text('qrEcHint');
  ecSelect.setAttribute('aria-describedby', ecHint.id);

  const preview = el('div', 'qr-preview');
  const qrStatus = el('p', 'qr-status');
  qrStatus.setAttribute('aria-live', 'polite');
  const qrInfo = el('p', 'qr-info');

  ecField.append(ecLabel, ecSelect, ecHint);
  qrSection.append(ecField, preview, qrStatus, qrInfo);

  /** Bytes of the last selected file, kept for a re-run after the input is reset. */
  let currentBytes: Uint8Array | null = null;
  let lastChmed: string | null = null;
  let running = false;
  /** Bumped by `dispose()`: a result from an older generation is dropped. */
  let generation = 0;
  /** Invalidates an in-flight preview; also the token a render captures. */
  let previewGeneration = 0;
  /** True once a run has reported a result for the loaded file (steps 2/3). */
  let processed = false;
  /**
   * True from the first byte of a picked file until its run has settled. Folded
   * into `syncControls` so no other code path (e.g. an edit applied while the
   * read is still pending) can re-enable the picker mid-read and let a second
   * `change` event race the first file's bytes.
   */
  let readingFile = false;
  /** The object the review table shows; every inline edit is written into it. */
  let editedPrescription: ReviewPrescription | null = null;
  /**
   * The findings the review table is currently showing, kept so the recap can
   * decide which sections are implicated (and offer a shortcut to them).
   */
  let currentReviewFindings: readonly ReviewFinding[] = [];
  /** The original pipeline's info lines, kept while the edited document validates. */
  let successInfo: readonly Finding[] = [];
  /** Page count of the last successful run; `null` when only a draft exists. */
  let pageCount: number | null = null;
  /**
   * Provenance of the last successful run (`low` = OCR). A validate-stage
   * failure carries no confidence, so a draft leaves this `null` and the recap
   * shows no extraction row rather than guessing.
   */
  let sourceConfidence: PdfToPrescriptionSuccess['confidence'] | null = null;
  /**
   * The pipeline's own JSON text for the current document. The recap's edit
   * badge is the difference between this baseline and what is on screen — the
   * same pretty JSON both sides — so retyping the original value clears it.
   */
  let baselineJson: string | null = null;
  /**
   * True once a prescription has reached the JSON area (draft or success).
   * Mirrors the CHMED16A → JSON flow: the first result switches to Structured,
   * later ones leave the current view alone.
   */
  let hasJsonResult = false;
  /** True once the user pressed a view toggle; their choice then always wins. */
  let userSelectedJsonView = false;
  /**
   * How to repaint the status line in the current locale.
   *
   * The line reports a stage failure (`stageMessage`), a count (`pdfSuccess`), a
   * draft state or a read failure, so a bare key cannot describe it. The panel
   * keeps the *derivation* instead and re-runs it on a locale change; every
   * captured input is immutable per run, so a repaint can only change words.
   * `null` means the line is empty.
   */
  let statusSource: (() => string) | null = null;
  /** Tone of the current status line, re-applied with the text. */
  let statusVariant: '' | 'is-error' | 'is-warning' = '';
  /**
   * Key of the neutral message the findings view shows, or `null` while it shows
   * findings. Kept so a locale change re-issues the same message.
   */
  let findingsMessageKey: UiStringKey | null = null;
  /**
   * Key of the preview line, or `null` when it is empty. The preview failure is
   * the one outcome message of this panel that describes a state (not an event),
   * so it is re-issued rather than left stale.
   */
  let previewStatusKey: UiStringKey | null = null;
  /** True while the JSON area holds an unencoded draft (drives the heading). */
  let draftMode = false;
  /** Counts of the last recap pass, so a locale change re-derives the verdict. */
  let recapCounts: { readonly errors: number; readonly warnings: number } = {
    errors: 0,
    warnings: 0,
  };

  /** Switches visibility only — content is never recomputed here. */
  function applyJsonView(view: JsonOutputView): void {
    const structured = view === 'structured';
    structuredJsonButton.setAttribute('aria-pressed', String(structured));
    rawJsonButton.setAttribute('aria-pressed', String(!structured));
    jsonRawView.hidden = structured;
    jsonStructuredView.hidden = !structured;
  }

  /**
   * Re-renders the structured presentation from the object already in hand.
   *
   * `prescription` is the very object the raw textarea was serialized from
   * (`result.draft.prescription` / `result.prescription` / the edited object),
   * so the two views cannot disagree and the textarea stays byte-identical and
   * canonical for copy/download. Marks come from the findings just rendered —
   * never from a second validation — and a full re-render clears the previous
   * marks when a section stops being implicated.
   */
  function renderJsonView(
    prescription: ReviewPrescription,
    errors: readonly ValidationError[],
  ): void {
    jsonViewer.render(prescription, { missingSections: requiredMissingSections(errors) });
    if (!hasJsonResult) {
      hasJsonResult = true;
      if (!userSelectedJsonView) {
        applyJsonView('structured');
      }
    }
  }

  /**
   * Paints the status line from the derivation it was last set with.
   *
   * Called on every state change and again on a locale change: the tone is
   * re-applied with the text, so a repaint never loses the error/warning tint.
   */
  function paintStatus(): void {
    scanStatus.classList.remove('is-error', 'is-warning');
    if (statusVariant !== '') {
      scanStatus.classList.add(statusVariant);
    }
    scanStatus.textContent = statusSource === null ? '' : statusSource();
  }

  /**
   * Sets the status line to a lazily-resolved message.
   *
   * `source` returns the current locale's wording and is kept, not invoked once,
   * so the line can be repainted (`paintStatus`) without tracking a second copy
   * of every branch. `null` clears it.
   */
  function setStatus(
    source: (() => string) | null,
    variant: '' | 'is-error' | 'is-warning',
  ): void {
    statusSource = source;
    statusVariant = variant;
    paintStatus();
  }

  /** Shows findings; a live message is stale by definition. */
  function renderFindings(
    errors: readonly Finding[],
    warnings: readonly Finding[],
    info?: readonly Finding[],
  ): void {
    findingsMessageKey = null;
    findings.render(errors, warnings, info);
  }

  /** Shows one neutral message and remembers its key for the locale refresh. */
  function showFindingsMessage(key: UiStringKey): void {
    findingsMessageKey = key;
    findings.message(text(key));
  }

  function previewFailed(): void {
    previewStatusKey = 'pdfPreviewFailed';
    previewStatus.textContent = text('pdfPreviewFailed');
  }

  /**
   * Drops the preview bitmap and any render still in flight.
   *
   * `canvas.width = canvas.height = 0` releases the backing store immediately
   * instead of waiting for the GC — the same disposal hygiene as the other
   * panels — and the generation bump makes a late `renderPreview` a no-op.
   */
  function clearPreview(): void {
    previewGeneration += 1;
    previewFrame.hidden = true;
    previewCanvas.width = 0;
    previewCanvas.height = 0;
    previewStatusKey = null;
    previewStatus.textContent = '';
  }

  /**
   * Best-effort first-page rasterization, run beside the pipeline and never
   * awaited by it.
   *
   * The page count of 1 is what keeps a long document cheap: the core binding
   * opens the PDF, renders page 1 and destroys the document again. The bytes
   * reference is captured so a render that finishes after the file was replaced
   * (or the panel reset) cannot paint a stale page over the new one.
   */
  async function renderPreview(bytes: Uint8Array): Promise<void> {
    clearPreview();
    const myPreview = previewGeneration;

    let rendered: PdfPagesRenderResult;
    try {
      rendered = await PDF_TO_PRESCRIPTION_DEPS.renderPages(bytes, 1);
    } catch {
      // Defensive only: the binding converts every failure to a typed result.
      if (myPreview === previewGeneration) {
        previewFailed();
      }
      return;
    }

    if (myPreview !== previewGeneration || bytes !== currentBytes) {
      return;
    }
    if (!rendered.ok) {
      previewFailed();
      return;
    }

    const image = rendered.images[0];
    if (image === undefined || typeof ImageData === 'undefined' || !(image instanceof ImageData)) {
      previewFailed();
      return;
    }

    previewCanvas.width = image.width;
    previewCanvas.height = image.height;
    const context = previewCanvas.getContext('2d');
    if (context === null) {
      previewFailed();
      return;
    }
    context.putImageData(image, 0, 0);
    previewFrame.hidden = false;
  }

  /**
   * Marks the step the panel is currently in.
   *
   * Derived from state, never toggled: a load with no result is step 1, a
   * finished run without a CHMED string (failure or reviewable draft) is step 2,
   * and a successful encode is step 3. Nothing is hidden by this — the sections
   * of every step stay in the DOM exactly as before.
   */
  function syncSteps(): void {
    const active = lastChmed !== null ? 3 : processed ? 2 : 1;
    stepItems.forEach((item, index) => {
      if (index + 1 === active) {
        item.setAttribute('aria-current', 'step');
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  /**
   * Derives both controls from the panel state rather than toggling them:
   * the picker is disabled from the moment a picked file starts being read
   * until its run has settled, and Process is enabled only for a loaded file
   * while idle. Deriving means a disposed mid-run panel can never re-enable
   * Process with no bytes behind it.
   */
  function syncControls(): void {
    fileInput.disabled = running || readingFile;
    processButton.disabled = running || currentBytes === null;
    // A clear during a run would be overwritten by the result that lands after
    // it, so both clear buttons are unavailable while the pipeline works.
    jsonClearButton.disabled = running;
    chmedClearButton.disabled = running;
    // An edit belongs to the result on screen: while a new run is in flight the
    // inputs stay visible but cannot be changed, so no edit is silently dropped
    // by the result that lands next.
    reviewTable.setDisabled(running);
    syncSteps();
  }

  function readEcLevel(): QrEcLevel {
    const value = ecSelect.value;
    return EC_LEVELS.find((level) => level === value) ?? DEFAULT_EC_LEVEL;
  }

  function renderQr(): void {
    preview.replaceChildren();
    qrInfo.textContent = '';
    qrStatus.classList.remove('is-error');

    if (lastChmed === null) {
      qrStatus.textContent = text('pdfQrEmpty');
      return;
    }

    const result = generateQr(lastChmed, { ecLevel: readEcLevel() });
    if (!result.ok) {
      // The CHMED text stays in its textarea: it is still copyable/downloadable.
      qrStatus.classList.add('is-error');
      qrStatus.textContent = format(text('qrOverflow'), {
        level: result.ecLevel,
        bytes: result.utf8Bytes,
      });
      return;
    }

    qrStatus.textContent = '';
    preview.innerHTML = qrToSvg(result);
    const svgElement = preview.querySelector('svg');
    if (svgElement !== null) {
      svgElement.setAttribute('role', 'img');
      svgElement.setAttribute('aria-label', format(text('qrAriaLabel'), { level: result.ecLevel }));
    }
    qrInfo.textContent = format(text('qrInfo'), {
      version: result.version,
      bytes: result.utf8Bytes,
    });
  }

  function clearOutput(): void {
    lastChmed = null;
    editedPrescription = null;
    currentReviewFindings = [];
    successInfo = [];
    pageCount = null;
    sourceConfidence = null;
    baselineJson = null;
    jsonOutput.value = '';
    // Presentation only: drops the sections and their marks. The chosen view is
    // deliberately left alone, so a reset keeps the user's choice.
    jsonViewer.clear();
    chmedOutput.value = '';
    jsonCopyButton.disabled = true;
    jsonDownloadButton.disabled = true;
    chmedCopyButton.disabled = true;
    chmedDownloadButton.disabled = true;
    jsonStatus.textContent = '';
    chmedStatus.textContent = '';
    reviewTable.clear();
    setDraftMode(false);
    renderQr();
    // `editedPrescription` is already null here, so the recap drops its rows
    // and hides: no state survives a clear or a new run.
    renderRecap(0, 0);
    // The preview belongs to the loaded file, not to an output area: it is kept
    // while its bytes are still retained (a run clears its output before it
    // starts, and a failure clears it again afterwards). Only a panel with no
    // bytes left — reset, dispose, size-guard/read failure — drops the page.
    if (currentBytes === null) {
      clearPreview();
    }
  }

  /**
   * Refreshes the step-3 export recap from the live object and the counts just
   * rendered above.
   *
   * `errorCount`/`warningCount` are the lengths of the very arrays passed to
   * `findings.render` at each call site, so the summary and the findings panel
   * cannot disagree.
   *
   * REBUILD CONTRACT (plan 005, phase 4): the `<dl>` is rebuilt only when the
   * row *set* changes, which is only the conditional extraction row — a run
   * result or a reset. On an edit the set is identical, so every row keeps its
   * `dt`/`dd` nodes and `writeRecapValue` rewrites just the `dd` content that
   * actually differs: no scroll jump, no focus loss, and the polite live region
   * only announces a value that changed. The section is hidden whenever there is
   * no prescription to summarise (idle, extract/OCR/parse failure, reset), and
   * its rows are dropped then, so no stale value can survive.
   */
  function renderRecap(errorCount: number, warningCount: number): void {
    // Kept so a locale change can re-run this very derivation (the verdict is
    // `format()`ed, so it cannot be repainted from a key alone).
    recapCounts = { errors: errorCount, warnings: warningCount };
    const prescription = editedPrescription;
    if (prescription === null) {
      recapList.replaceChildren();
      recapRows.clear();
      recapSignatures.clear();
      recapShape = null;
      recapSection.hidden = true;
      hideRecapActions();
      return;
    }
    recapSection.hidden = false;

    // Row set of this pass, in DOM order. Only the extraction row depends on
    // state (a draft carries no confidence), and that state never changes on an
    // edit — so an edit-driven refresh always finds the current shape.
    const keys: RecapRowKey[] = ['patient', 'medicaments'];
    if (sourceConfidence !== null && pageCount !== null) {
      keys.push('extraction');
    }
    keys.push('edits', 'verdict');
    const shape = keys.join(',');
    if (shape !== recapShape) {
      rebuildRecap(keys);
      recapShape = shape;
    }

    // Patient: "FName LName · born YYYY-MM-DD", the name alone when the birth
    // date is absent, and the shared placeholder when neither exists.
    const patient = isRecord(prescription.Patient) ? prescription.Patient : undefined;
    const patientName = fullName(patient);
    const birthDate = scalarText(patient, 'BDt');
    const patientAbsent = patientName === '' && birthDate === '';
    const patientText =
      birthDate === ''
        ? patientName
        : format(text('recapPatientBorn'), {
            name: patientName === '' ? text('reviewValuePlaceholder') : patientName,
            date: birthDate,
          });
    setRecapTerm('patient', text('recapPatientLabel'));
    writeRecapValue('patient', patientAbsent ? [] : [{ text: patientText }], {
      absent: patientAbsent,
    });

    const medicamentCount = Array.isArray(prescription.Medicaments)
      ? prescription.Medicaments.length
      : 0;
    setRecapTerm('medicaments', text('recapMedicamentsLabel'));
    writeRecapValue('medicaments', [{ text: String(medicamentCount) }]);

    // Provenance: the pipeline's own success wording, with the OCR variant in
    // the warning tone. A draft has no confidence, so it shows no row at all.
    if (sourceConfidence !== null && pageCount !== null) {
      setRecapTerm('extraction', text('recapExtractionLabel'));
      writeRecapValue(
        'extraction',
        [
          {
            text: format(
              sourceConfidence === 'low' ? text('pdfSuccessOcr') : text('pdfSuccessTextLayer'),
              { pages: pageCount },
            ),
          },
        ],
        // The text already says "OCR"; the tone only invites attention to it.
        sourceConfidence === 'low' ? { tone: 'is-warning' } : {},
      );
    }

    // Edit state: a badge only when the document differs from the pipeline's
    // output. Comparing the serialized JSON (the same pretty form on both
    // sides) means retyping the original value removes the badge again.
    setRecapTerm('edits', text('recapEditsLabel'));
    const edited = baselineJson !== null && jsonOutput.value !== baselineJson;
    writeRecapValue('edits', edited ? [{ badge: text('recapEdited') }] : [], { absent: !edited });

    // One verdict derivation for the whole panel; draft mode blocks exactly
    // like the findings view, because both read the same counts.
    // The findings view already owns the "Validation results" heading; the row
    // borrows that label rather than duplicating the word in a new string.
    setRecapTerm('verdict', text('validationHeading'));
    writeRecapValue(
      'verdict',
      [
        {
          text:
            errorCount === 0
              ? format(text('recapValid'), { warnings: warningCount })
              : format(text('recapBlocked'), {
                  errors: errorCount,
                  warnings: warningCount,
                }),
        },
      ],
      { tone: errorCount === 0 ? 'is-success' : 'is-error' },
    );

    renderRecapActions();
  }

  /**
   * Shows only the shortcuts of the implicated sections (plan 005, phase 1).
   *
   * The buttons were created once, so a refresh toggles their `hidden` state
   * instead of recreating them: a focused shortcut keeps its node, and a section
   * that stops being implicated simply hides its button. They are pure focus
   * helpers (never disabled, never a second validation): each moves focus to the
   * same input the guided task link targets, reduced-motion aware.
   */
  function renderRecapActions(): void {
    let shown = 0;
    recapFixButtons.forEach((button, index) => {
      const spec = RECAP_FIX_SECTIONS[index];
      const implicated = spec !== undefined && sectionImplicated(currentReviewFindings, spec.section);
      button.hidden = !implicated;
      if (implicated) {
        shown += 1;
      }
    });
    recapActions.hidden = shown === 0;
  }

  /** Hides every shortcut (no prescription to fix). */
  function hideRecapActions(): void {
    for (const button of recapFixButtons) {
      button.hidden = true;
    }
    recapActions.hidden = true;
  }

  /**
   * Returns the panel to its first-load state: no retained bytes, both output
   * areas empty, every copy/download control disabled and no stale findings or
   * status. Shared by the clear buttons and `dispose()`.
   */
  function resetPanel(): void {
    currentBytes = null;
    processed = false;
    fileInput.value = '';
    clearOutput();
    syncControls();
    showFindingsMessage('pdfIdle');
    setStatus(null, '');
  }

  /**
   * Marks the JSON area as a draft (or back to the normal heading). Encoding
   * controls are untouched here: `clearOutput()` already disabled them, so a
   * draft can never reach the CHMED textarea, the clipboard or the QR code.
   */
  function setDraftMode(active: boolean): void {
    draftMode = active;
    jsonHeading.textContent = active ? text('pdfDraftHeading') : text('pdfJsonOutputHeading');
    draftHint.hidden = !active;
  }

  function applyResult(result: PdfToPrescriptionResult): void {
    processed = true;
    if (!result.ok) {
      // Extract/OCR failures never reached a prescription: their findings point
      // at the file picker, every later stage at the JSON area.
      anchorArea = result.stage === 'extract' || result.stage === 'ocr' ? 'file' : 'json';
      clearOutput();
      if (result.stage === 'validate' && result.draft !== undefined) {
        // The parsed prescription is shown for review only: validation failed,
        // so `lastChmed` stays null and the CHMED/QR outputs stay empty. It is
        // also the object inline edits will be written into (phase 7c).
        setDraftMode(true);
        jsonOutput.value = result.draft.json;
        jsonCopyButton.disabled = false;
        jsonDownloadButton.disabled = false;
        setStatus(() => text('pdfDraftStatus'), 'is-warning');
        // The object the inline editing writes into, set before the table sees it.
        editedPrescription = result.draft.prescription;
        // Structured mirror of the very text written above; marks come from the
        // failure's own findings (no re-validation).
        renderJsonView(result.draft.prescription, result.errors);
        // The recap summarises a draft too: same object, same failure counts.
        // No confidence is carried by a validate failure, so no extraction row.
        baselineJson = result.draft.json;
        // The verifiable summary the draft exists for: the rejected object is
        // shown with the statuses of the very findings that rejected it. The
        // failure carries no warnings, so only the errors drive the table.
        currentReviewFindings = validationReviewFindings(result.errors);
        // Table first, findings second: a guided task's "Go to field" link
        // resolves the input element while the findings are rendered, so the
        // table it points at must already be mounted.
        reviewTable.render(result.draft.prescription, currentReviewFindings);
        renderFindings(failureFindings(result), []);
        renderRecap(result.errors.length, 0);
        return;
      }
      renderFindings(failureFindings(result), []);
      setStatus(() => text(stageMessage(result)), 'is-error');
      return;
    }

    const warnings = warningFindings(result.warnings);
    anchorArea = 'json';
    const info = successFindings(result);
    // The object behind the JSON below, the info lines an edit keeps while the
    // document stays valid, and the page count its status line reports.
    editedPrescription = result.prescription;
    successInfo = info;
    pageCount = result.pageCount;
    sourceConfidence = result.confidence;
    baselineJson = result.json;
    renderFindings([], warnings, info);
    // A successful encode carries warnings only, so every field they do not
    // implicate is "Recognized".
    currentReviewFindings = warningReviewFindings(result.warnings);
    reviewTable.render(result.prescription, currentReviewFindings);
    setStatus(
      () => format(text('pdfSuccess'), { pages: result.pageCount }),
      warnings.length > 0 ? 'is-warning' : '',
    );

    jsonOutput.value = result.json;
    // Same object, same serialization: the viewer is a presentation of the text
    // the textarea holds. A successful encode has no errors, so no marks.
    renderJsonView(result.prescription, []);
    chmedOutput.value = result.chmed;
    lastChmed = result.chmed;
    jsonCopyButton.disabled = false;
    jsonDownloadButton.disabled = false;
    chmedCopyButton.disabled = false;
    chmedDownloadButton.disabled = false;
    jsonStatus.textContent = '';
    chmedStatus.textContent = '';
    renderQr();
    // The verdict mirrors the findings just rendered: same arrays, same counts.
    renderRecap(0, result.warnings.length);
  }

  /** Status line after a successful re-validation: keep the page count if known. */
  function editSuccessStatus(): string {
    return pageCount === null
      ? text('pdfSuccessValidated')
      : format(text('pdfSuccess'), { pages: pageCount });
  }

  /**
   * Serializes the edited prescription and re-checks it with the public core.
   *
   * `validateJsonText` produces the findings; `jsonToChmed` re-validates and is
   * the only producer of the CHMED16A string, so the bytes are exactly those the
   * pipeline's own encode stage (`jsonToChmed(parsed.value)`) would emit for the
   * same document. Nothing is coerced, patched or invented between the two
   * calls. Both are wrapped: a throw becomes one blocking finding instead of
   * escaping the `change` handler.
   */
  function evaluateEdit(prescription: ReviewPrescription): {
    readonly jsonText: string;
    readonly errors: readonly ValidationError[];
    readonly warnings: readonly ValidationWarning[];
    readonly chmed: string | null;
  } {
    let jsonText: string;
    try {
      jsonText = JSON.stringify(prescription, null, 2);
    } catch {
      // Unreachable for a JSON-derived object (edits only add strings and
      // numbers), reported rather than thrown; the previous JSON stays on screen.
      return { jsonText: jsonOutput.value, errors: [editFailure()], warnings: [], chmed: null };
    }

    let validation: ValidationResult;
    try {
      validation = validateJsonText(jsonText);
    } catch {
      return { jsonText, errors: [editFailure()], warnings: [], chmed: null };
    }
    if (!validation.ok) {
      return {
        jsonText,
        errors: validation.errors,
        warnings: validation.warnings,
        chmed: null,
      };
    }

    try {
      const encoded = jsonToChmed(jsonText);
      return encoded.ok
        ? { jsonText, errors: [], warnings: encoded.warnings, chmed: encoded.chmed }
        : { jsonText, errors: encoded.errors, warnings: encoded.warnings, chmed: null };
    } catch {
      return { jsonText, errors: [editFailure()], warnings: [], chmed: null };
    }
  }

  /**
   * One committed inline edit: mutate → re-serialize → re-validate → refresh.
   *
   * The edited document becomes the source of truth for the JSON area, the
   * CHMED string and the QR code; findings are replaced by the ones for the
   * edited document, except the pipeline's info lines, which describe the
   * original detection and are kept while the edited document still validates.
   * Gating is the flow-1 gate: no blocking finding, no export.
   */
  function applyEdit(edit: ReviewEdit): void {
    // Edits belong to a result on screen, and never to a run in flight.
    if (running || editedPrescription === null) {
      return;
    }
    if (!writeEdit(editedPrescription, edit)) {
      return;
    }

    const outcome = evaluateEdit(editedPrescription);
    jsonOutput.value = outcome.jsonText;
    // Refresh in step with the textarea: same object, marks from the very
    // findings rebuilt below, so a fixed section loses its mark immediately.
    renderJsonView(editedPrescription, outcome.errors);

    const valid = outcome.errors.length === 0 && outcome.chmed !== null;
    renderFindings(
      errorFindings(outcome.errors),
      warningFindings(outcome.warnings),
      valid ? successInfo : [],
    );
    currentReviewFindings = [
      ...validationReviewFindings(outcome.errors),
      ...warningReviewFindings(outcome.warnings),
    ];
    reviewTable.updateFindings(currentReviewFindings);

    // Valid ⇒ the draft banner goes away and the encoded outputs arrive exactly
    // as on a pipeline success. Invalid ⇒ draft mode returns and they are gone.
    setDraftMode(!valid);
    lastChmed = outcome.chmed;
    chmedOutput.value = outcome.chmed ?? '';
    chmedCopyButton.disabled = outcome.chmed === null;
    chmedDownloadButton.disabled = outcome.chmed === null;
    chmedStatus.textContent = '';
    renderQr();

    // The JSON area holds the edited document in both states, so it stays
    // copyable and downloadable exactly as the draft path already allowed.
    jsonCopyButton.disabled = false;
    jsonDownloadButton.disabled = false;
    jsonStatus.textContent = '';

    if (valid) {
      setStatus(() => editSuccessStatus(), outcome.warnings.length > 0 ? 'is-warning' : '');
    } else {
      setStatus(() => text('pdfStageValidate'), 'is-error');
    }
    // Updated only on the committed `change` re-validation, never mid-keystroke,
    // so the summary cannot flap while a value is being typed. The counts are
    // the same outcome arrays the findings above were just rebuilt from.
    renderRecap(outcome.errors.length, outcome.warnings.length);
    syncControls();
  }

  async function run(bytes: Uint8Array): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    const myGeneration = generation + 1;
    generation = myGeneration;
    processed = false;

    syncControls();
    clearOutput();
    setStatus(() => text('pdfProcessing'), '');
    showFindingsMessage('pdfProcessing');

    try {
      const result = await pdfToPrescription(bytes);
      if (myGeneration !== generation) {
        return;
      }
      applyResult(result);
    } catch {
      if (myGeneration !== generation) {
        return;
      }
      renderFindings([{ path: '', message: text('pdfUnexpected') }], []);
      setStatus(() => text('pdfUnexpected'), 'is-error');
      clearOutput();
    } finally {
      if (myGeneration === generation) {
        running = false;
        syncControls();
      }
    }
  }

  async function handleFile(file: File): Promise<void> {
    // A second picked file would race this one's bytes and panel state, so the
    // picker is disabled by `syncControls` for the whole read + run and a
    // re-entry that still slips through is a no-op.
    if (readingFile) {
      return;
    }
    readingFile = true;
    syncControls();
    // Check the metadata first: an oversized file must never be read into memory.
    if (file.size > MAX_PDF_BYTES) {
      readingFile = false;
      processed = false;
      fileInput.value = '';
      currentBytes = null;
      clearOutput();
      syncControls();
      renderFindings([{ path: '', message: text('pdfFileTooLarge') }], []);
      setStatus(() => text('pdfFileTooLarge'), 'is-error');
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      readingFile = false;
      processed = false;
      fileInput.value = '';
      syncControls();
      renderFindings([{ path: '', message: text('pdfReadFailed') }], []);
      setStatus(() => text('pdfReadFailed'), 'is-error');
      return;
    }
    // The File object is not needed anymore; its bytes live only in this panel.
    fileInput.value = '';
    currentBytes = bytes;
    syncControls();
    // Starts now so the page is visible while the pipeline works; not awaited,
    // so a slow or failing preview never delays or fails the extraction.
    void renderPreview(bytes);
    await run(bytes);
    // `run` re-derives the controls in its own `finally` while this flag is
    // still set; clearing it here is what finally frees the picker.
    readingFile = false;
    syncControls();
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file === undefined) {
      return;
    }
    void handleFile(file);
  });

  processButton.addEventListener('click', () => {
    if (currentBytes === null) {
      showFindingsMessage('pdfIdle');
      return;
    }
    void run(currentBytes);
  });

  ecSelect.addEventListener('change', renderQr);

  structuredJsonButton.addEventListener('click', () => {
    userSelectedJsonView = true;
    applyJsonView('structured');
  });

  rawJsonButton.addEventListener('click', () => {
    userSelectedJsonView = true;
    applyJsonView('raw');
  });

  jsonCopyButton.addEventListener('click', () => {
    void copyText(jsonOutput.value, jsonStatus);
  });

  jsonDownloadButton.addEventListener('click', () => {
    downloadText(text('jsonFilename'), jsonOutput.value, 'application/json;charset=utf-8');
  });

  chmedCopyButton.addEventListener('click', () => {
    void copyText(chmedOutput.value, chmedStatus);
  });

  chmedDownloadButton.addEventListener('click', () => {
    downloadText(text('chmedFilename'), chmedOutput.value, 'text/plain;charset=utf-8');
  });

  // Both text areas show the same pipeline result, so either clear button
  // resets the whole panel through the shared `clearOutput()` path.
  jsonClearButton.addEventListener('click', resetPanel);
  chmedClearButton.addEventListener('click', resetPanel);

  // Pre-result state: the raw textarea (today's behaviour). The first draft or
  // success switches to Structured unless the user has already toggled.
  applyJsonView('raw');
  showFindingsMessage('pdfIdle');
  renderQr();
  syncSteps();

  /**
   * Re-applies every label this panel owns from the current locale.
   *
   * LABEL-ONLY BY CONTRACT (i18n plan 007, phases 2 and 5). Everything the user
   * put into — or got out of — this tab survives: the retained PDF bytes, the
   * rasterized first page, the JSON textarea (pipeline output or the edited
   * document), every review-table input value including text typed but not yet
   * committed, the CHMED16A string, the QR symbol, the draft banner and the
   * findings/advisory state. This function calls no pipeline, no
   * `resetPanel`, no `clearOutput` and no re-validation; it writes text and
   * accessible names only.
   *
   * Piece by piece:
   * - static labels (step, upload, preview, JSON/recap/CHMED/QR sections and
   *   their buttons) are rewritten through the Phase 3 primitives
   *   (`setFieldLabels`, `setButtonLabel`, `setLeadingIconLabel`);
   * - the review table relabels itself in place (`reviewTable.relabel`), so each
   *   input keeps focus, caret and value;
   * - the findings view relabels through its own authoring path, and a neutral
   *   message is re-issued from the key it was shown for;
   * - the structured JSON viewer relabels in place (`jsonViewer.relabel`), so its
   *   section hints and missing-required badge follow the locale while every
   *   expanded section stays open;
   * - four pieces are re-derived rather than re-worded, because their text is
   *   `format()`ed: the status line (from `statusSource`), the preview failure
   *   (from `previewStatusKey`), the draft heading (from `draftMode`) and the
   *   export recap (from `recapCounts`, which rewrites only rows whose text
   *   changed — the recap's `<dl>` is not rebuilt because its row set is the
   *   same);
   * - `renderQr()` re-renders the same string into the same preview, so the QR
   *   code and its caption follow the locale without touching `lastChmed`.
   *
   * Copy confirmations written by `copyText` describe an event, not a label, and
   * are left alone (they are shared clipboard wording, i18n plan 007 phase 6).
   */
  function refreshLabels(): void {
    heading.textContent = text('tabPdfToChmed');
    stepList.setAttribute('aria-label', text('pdfStepIndicatorLabel'));
    stepPositions.forEach((node, index) => {
      node.textContent = format(text('pdfStepOf'), { current: index + 1 });
    });
    stepNames.forEach((node, index) => {
      const key = STEP_LABEL_KEYS[index];
      if (key !== undefined) {
        node.textContent = text(key);
      }
    });

    setLeadingIconLabel(fileLabel, text('pdfFileLabel'));
    fileHint.textContent = text('pdfFileHint');
    setButtonLabel(processButton, text('pdfProcess'));
    paintStatus();

    previewHeading.textContent = text('pdfPreviewHeading');
    previewCanvas.setAttribute('aria-label', text('pdfPreviewAriaLabel'));
    if (previewStatusKey !== null) {
      previewStatus.textContent = text(previewStatusKey);
    }

    findings.relabel(text('pdfFindingsHeading'));
    if (findingsMessageKey !== null) {
      findings.message(text(findingsMessageKey));
    }
    reviewTable.relabel();

    setDraftMode(draftMode);
    jsonViewToggle.setAttribute('aria-label', text('jsonViewGroupLabel'));
    structuredJsonButton.textContent = text('jsonViewStructured');
    rawJsonButton.textContent = text('jsonViewRaw');
    jsonViewer.relabel();
    setFieldLabels(jsonOutput, {
      label: text('pdfJsonOutputLabel'),
      hint: text('jsonOutputHint'),
    });
    setButtonLabel(jsonClearButton, text('clear'), text('clearJsonOutputAccessibleName'));
    setButtonLabel(jsonCopyButton, text('copy'), text('copyJsonAccessibleName'));
    setButtonLabel(jsonDownloadButton, text('download'), text('downloadJsonAccessibleName'));

    recapHeading.textContent = text('exportRecapHeading');
    recapFixButtons.forEach((button, index) => {
      const spec = RECAP_FIX_SECTIONS[index];
      if (spec !== undefined) {
        button.textContent = format(text('recapFixField'), { section: text(spec.labelKey) });
      }
    });
    renderRecap(recapCounts.errors, recapCounts.warnings);

    chmedHeading.textContent = text('chmedOutputHeading');
    setFieldLabels(chmedOutput, {
      label: text('chmedOutputLabel'),
      hint: text('chmedOutputHint'),
    });
    setButtonLabel(chmedClearButton, text('clear'), text('clearChmedOutputAccessibleName'));
    setButtonLabel(chmedCopyButton, text('copy'), text('copyChmedAccessibleName'));
    setButtonLabel(chmedDownloadButton, text('download'), text('downloadChmedAccessibleName'));

    qrHeading.textContent = text('qrHeading');
    ecLabel.textContent = text('qrEcLabel');
    ecHint.textContent = text('qrEcHint');
    renderQr();
  }

  return {
    dispose: () => {
      // The pipeline has no AbortSignal, so an in-flight run cannot be
      // cancelled. Invalidating the generation drops its result, and the OCR
      // worker is terminated by `runOcr`'s own `finally` when the call settles.
      generation += 1;
      running = false;
      // `main.ts` mounts every panel once and only toggles `hidden`, so a
      // disposed panel must stay usable when its tab is selected again: back to
      // the idle view with no bytes, no output and no stale findings/status.
      resetPanel();
    },
    refresh: refreshLabels,
  };
}
