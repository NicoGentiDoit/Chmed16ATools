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
 */

import { pdfToPrescription } from '../core/pdf-to-prescription';
import type {
  PdfToPrescriptionFailure,
  PdfToPrescriptionResult,
  PdfToPrescriptionStage,
  PdfToPrescriptionSuccess,
  PdfToPrescriptionWarning,
} from '../core/pdf-to-prescription';
import { generateQr, qrToSvg } from '../core/qr-generate';
import type { QrEcLevel } from '../core/qr-generate';
import { format, text } from './strings';

/** Icons this panel uses; the closed union keeps arbitrary markup out. */
type PanelIconName = 'upload' | 'search' | 'copy' | 'download';

/** Lucide icon name → inline SVG string. */
function svg(name: PanelIconName): string {
  return `<i data-lucide="${name}" aria-hidden="true" style="width:1em;height:1em;vertical-align:-0.125em;flex-shrink:0"></i>`;
}

/**
 * createButton variant that accepts an optional icon name.
 *
 * The icon must be injected via `innerHTML` (so Lucide can replace it with an
 * SVG); only the visible text part is set through textContent so unknown
 * characters are never escaped twice.
 */
function createButtonWithIcon(
  parent: HTMLElement,
  labelText: string,
  iconName: PanelIconName,
  options: ButtonOptions = {},
): HTMLButtonElement {
  const button = el('button', options.className);
  button.type = 'button';
  button.setAttribute('aria-label', options.accessibleName ?? labelText);
  // Insert icon markup first so Lucide can find it.
  button.insertAdjacentHTML('afterbegin', svg(iconName));
  // Then set the text node — textContent never touches existing children.
  button.appendChild(document.createTextNode(` ${labelText}`));
  parent.append(button);
  return button;
}

/** A finding flattened for rendering. */
interface Finding {
  readonly path: string;
  readonly message: string;
}

export interface Panel {
  /** Releases resources held by the panel. */
  dispose(): void;
}

const EC_LEVELS: readonly QrEcLevel[] = ['L', 'M', 'Q', 'H'];
const DEFAULT_EC_LEVEL: QrEcLevel = 'M';

/** Ceiling on a selected PDF (25 MiB), checked before the file is read. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const FILE_INPUT_ID = 'pdf-to-chmed-file';
const JSON_OUTPUT_ID = 'pdf-to-chmed-json';
const CHMED_OUTPUT_ID = 'pdf-to-chmed-chmed';
const EC_ID = 'pdf-to-chmed-ec';

/* -------------------------------------------------------------------------- */
/* Small DOM helpers                                                          */
/* -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  return node;
}

interface TextareaOptions {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly rows?: number;
  readonly readOnly?: boolean;
}

function createTextareaField(parent: HTMLElement, options: TextareaOptions): HTMLTextAreaElement {
  const wrapper = el('div', 'field');
  const label = el('label', 'field-label');
  label.htmlFor = options.id;
  label.textContent = options.label;

  const area = el('textarea', 'field-input');
  area.id = options.id;
  area.rows = options.rows ?? 10;
  area.spellcheck = false;
  area.readOnly = options.readOnly === true;

  wrapper.append(label, area);

  if (options.hint !== undefined) {
    const hint = el('p', 'field-hint');
    hint.id = `${options.id}-hint`;
    hint.textContent = options.hint;
    area.setAttribute('aria-describedby', hint.id);
    wrapper.append(hint);
  }

  parent.append(wrapper);
  return area;
}

interface ButtonOptions {
  readonly className?: string;
  readonly accessibleName?: string;
}

function warningFindings(warnings: readonly PdfToPrescriptionWarning[]): Finding[] {
  return warnings.map((warning) => ({ path: warning.path, message: warning.message }));
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
      return failure.errors.map((error) => ({ path: error.code, message: error.message }));
    case 'parse':
      return failure.errors.map((error) => ({ path: error.path, message: error.message }));
    case 'validate':
    case 'encode':
      return failure.errors.map((error) => ({ path: error.instancePath, message: error.message }));
    default:
      return [];
  }
}

function stageMessage(stage: PdfToPrescriptionStage): string {
  switch (stage) {
    case 'extract':
      return text('pdfStageExtract');
    case 'ocr':
      return text('pdfStageOcr');
    case 'parse':
      return text('pdfStageParse');
    case 'validate':
      return text('pdfStageValidate');
    case 'encode':
      return text('pdfStageEncode');
    default:
      return text('pdfUnexpected');
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

interface FindingsView {
  render(
    errors: readonly Finding[],
    warnings: readonly Finding[],
    successes?: readonly Finding[],
  ): void;
  /** Shows a single neutral message instead of findings. */
  message(value: string): void;
}

function createFindingsView(parent: HTMLElement, headingText: string): FindingsView {
  const section = el('section', 'panel-section');
  const heading = el('h3');
  heading.textContent = headingText;

  const container = el('div', 'findings');
  container.setAttribute('aria-live', 'polite');

  section.append(heading, container);
  parent.append(section);

  const message = (value: string): void => {
    container.replaceChildren();
    const paragraph = el('p', 'findings-summary');
    paragraph.textContent = value;
    container.append(paragraph);
  };

  const render = (
    errors: readonly Finding[],
    warnings: readonly Finding[],
    successes: readonly Finding[] = [],
  ): void => {
    container.replaceChildren();

    const summary = el('p', 'findings-summary');
    summary.textContent = `${text('errorsLabel')}: ${errors.length} · ${text('warningsLabel')}: ${warnings.length}`;
    container.append(summary);

    if (errors.length === 0 && warnings.length === 0 && successes.length === 0) {
      const ok = el('p', 'findings-ok');
      ok.textContent = text('noFindings');
      container.append(ok);
      return;
    }

    appendFindingList(container, text('errorsLabel'), errors, 'is-error');
    appendFindingList(container, text('warningsLabel'), warnings, 'is-warning');
    appendSuccessList(container, successes);
  };

  return { render, message };
}

function appendFindingList(
  parent: HTMLElement,
  headingText: string,
  findings: readonly Finding[],
  variant: 'is-error' | 'is-warning',
): void {
  if (findings.length === 0) {
    return;
  }

  const heading = el('h4', `findings-heading ${variant}`);
  heading.textContent = `${headingText} (${findings.length})`;

  const list = el('ul', `findings-list ${variant}`);
  for (const finding of findings) {
    const item = el('li');
    if (finding.path !== '') {
      const path = el('code', 'finding-path');
      path.textContent = finding.path;
      item.append(path, document.createTextNode(' '));
    }
    item.append(document.createTextNode(finding.message));
    list.append(item);
  }

  parent.append(heading, list);
}

/** Success lines carry no path, so they need no heading of their own. */
function appendSuccessList(parent: HTMLElement, findings: readonly Finding[]): void {
  if (findings.length === 0) {
    return;
  }

  const list = el('ul', 'findings-list is-success');
  for (const finding of findings) {
    const item = el('li');
    item.textContent = finding.message;
    list.append(item);
  }

  parent.append(list);
}

/* -------------------------------------------------------------------------- */
/* Clipboard and download                                                     */
/* -------------------------------------------------------------------------- */

function legacyCopy(value: string): boolean {
  try {
    const area = el('textarea');
    area.value = value;
    area.readOnly = true;
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

async function copyText(value: string, status: HTMLElement): Promise<void> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(value);
      status.textContent = text('copied');
      return;
    }
  } catch {
    // Permission or support problems fall through to the legacy path.
  }
  status.textContent = legacyCopy(value) ? text('copied') : text('copyFailed');
}

function downloadText(filename: string, value: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([value], { type: mimeType }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function mountPdfToChmed(container: HTMLElement): Panel {
  container.replaceChildren();

  const heading = el('h2');
  heading.textContent = text('tabPdfToChmed');
  container.append(heading);

  const inputSection = el('section', 'panel-section');
  container.append(inputSection);

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

  const findings = createFindingsView(container, text('pdfFindingsHeading'));

  const jsonSection = el('section', 'panel-section');
  const jsonHeading = el('h3');
  jsonHeading.textContent = text('pdfJsonOutputHeading');
  jsonSection.append(jsonHeading);
  container.append(jsonSection);

  const jsonOutput = createTextareaField(jsonSection, {
    id: JSON_OUTPUT_ID,
    label: text('pdfJsonOutputLabel'),
    hint: text('jsonOutputHint'),
    rows: 14,
    readOnly: true,
  });

  const jsonActions = el('div', 'actions');
  jsonSection.append(jsonActions);
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

  const chmedSection = el('section', 'panel-section');
  const chmedHeading = el('h3');
  chmedHeading.textContent = text('chmedOutputHeading');
  chmedSection.append(chmedHeading);
  container.append(chmedSection);

  const chmedOutput = createTextareaField(chmedSection, {
    id: CHMED_OUTPUT_ID,
    label: text('chmedOutputLabel'),
    hint: text('chmedOutputHint'),
    rows: 8,
    readOnly: true,
  });

  const chmedActions = el('div', 'actions');
  chmedSection.append(chmedActions);
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
  container.append(qrSection);

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

  function setStatus(message: string, variant: '' | 'is-error' | 'is-warning'): void {
    scanStatus.classList.remove('is-error', 'is-warning');
    if (variant !== '') {
      scanStatus.classList.add(variant);
    }
    scanStatus.textContent = message;
  }

  /**
   * Derives both controls from the panel state rather than toggling them:
   * the picker is disabled only while a run is in flight, and Process is
   * enabled only for a loaded file while idle. Deriving means a disposed
   * mid-run panel can never re-enable Process with no bytes behind it.
   */
  function syncControls(): void {
    fileInput.disabled = running;
    processButton.disabled = running || currentBytes === null;
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
    jsonOutput.value = '';
    chmedOutput.value = '';
    jsonCopyButton.disabled = true;
    jsonDownloadButton.disabled = true;
    chmedCopyButton.disabled = true;
    chmedDownloadButton.disabled = true;
    jsonStatus.textContent = '';
    chmedStatus.textContent = '';
    renderQr();
  }

  function applyResult(result: PdfToPrescriptionResult): void {
    if (!result.ok) {
      findings.render(failureFindings(result), []);
      setStatus(stageMessage(result.stage), 'is-error');
      clearOutput();
      return;
    }

    const warnings = warningFindings(result.warnings);
    findings.render([], warnings, successFindings(result));
    setStatus(
      format(text('pdfSuccess'), { pages: result.pageCount }),
      warnings.length > 0 ? 'is-warning' : '',
    );

    jsonOutput.value = result.json;
    chmedOutput.value = result.chmed;
    lastChmed = result.chmed;
    jsonCopyButton.disabled = false;
    jsonDownloadButton.disabled = false;
    chmedCopyButton.disabled = false;
    chmedDownloadButton.disabled = false;
    jsonStatus.textContent = '';
    chmedStatus.textContent = '';
    renderQr();
  }

  async function run(bytes: Uint8Array): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    const myGeneration = generation + 1;
    generation = myGeneration;

    syncControls();
    clearOutput();
    setStatus(text('pdfProcessing'), '');
    findings.message(text('pdfProcessing'));

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
      findings.render([{ path: '', message: text('pdfUnexpected') }], []);
      setStatus(text('pdfUnexpected'), 'is-error');
      clearOutput();
    } finally {
      if (myGeneration === generation) {
        running = false;
        syncControls();
      }
    }
  }

  async function handleFile(file: File): Promise<void> {
    // Check the metadata first: an oversized file must never be read into memory.
    if (file.size > MAX_PDF_BYTES) {
      fileInput.value = '';
      currentBytes = null;
      clearOutput();
      syncControls();
      findings.render([{ path: '', message: text('pdfFileTooLarge') }], []);
      setStatus(text('pdfFileTooLarge'), 'is-error');
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      fileInput.value = '';
      findings.render([{ path: '', message: text('pdfReadFailed') }], []);
      setStatus(text('pdfReadFailed'), 'is-error');
      return;
    }
    // The File object is not needed anymore; its bytes live only in this panel.
    fileInput.value = '';
    currentBytes = bytes;
    syncControls();
    await run(bytes);
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
      findings.message(text('pdfIdle'));
      return;
    }
    void run(currentBytes);
  });

  ecSelect.addEventListener('change', renderQr);

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

  findings.message(text('pdfIdle'));
  renderQr();

  return {
    dispose: () => {
      // The pipeline has no AbortSignal, so an in-flight run cannot be
      // cancelled. Invalidating the generation drops its result, and the OCR
      // worker is terminated by `runOcr`'s own `finally` when the call settles.
      generation += 1;
      running = false;
      // Release the document: bytes, derived strings and both output areas.
      currentBytes = null;
      fileInput.value = '';
      clearOutput();
      // `main.ts` mounts every panel once and only toggles `hidden`, so a
      // disposed panel must stay usable when its tab is selected again: back to
      // the idle view, picker enabled, Process disabled because no bytes are
      // loaded, and no stale findings/status from the previous visit.
      syncControls();
      findings.message(text('pdfIdle'));
      setStatus(text('pdfIdle'), '');
    },
  };
}
