/**
 * Tab 2 — CHMED16A document (typed, uploaded or scanned) → pretty JSON.
 *
 * The decoder already accepts both compression variants, so the UI never
 * branches on the header. Uploaded images and the optional camera feed both go
 * through `scanImageData`; the camera is started only from a user gesture and
 * stopped on success, on tab switch and on page hide (see `dispose`).
 *
 * ## In-place locale refresh (i18n plan 007, phase 4)
 *
 * `refresh()` repaints the labels of this panel for the current locale. It is
 * label-only by contract: the typed CHMED16A string, the decoded JSON in both
 * presentations, the findings and a RUNNING camera scan all survive a locale
 * switch. Nothing here disposes the camera, restarts the scan loop or clears the
 * scanned input — a locale change is presentation, never state.
 *
 * ## Decode findings (i18n plan 007, phase 7)
 *
 * The decoder returns a stable `code` (and, where one code covers several
 * messages, a `detail`) plus the values a sentence needs as `params`; the
 * wording is resolved here by `ui/i18n/core-message.ts` at paint time. The
 * core's English `message` is only the fallback for a code without a key (the
 * validator's JSON syntax text, which is the schema engine's own), so a finding
 * is never blank. Like any finding, the wording of one already on screen is a
 * result snapshot and is not re-translated by `refresh()`; the next decode
 * renders in the new locale.
 */

import { chmedToJson } from '../core/decode';
import type { DecodeError } from '../core/decode';
import { readFileAsImageData, scanImageData, startCamera, stopCamera } from '../core/qr-scan';
import {
  NESTING_TOO_DEEP_MESSAGE,
  isNestingOverflow,
  parseJsonText,
  validateObject,
} from '../core/validate';
import type { ValidationError, ValidationWarning } from '../core/validate';
import { createButtonWithIcon, setButtonLabel, svg } from './components/buttons';
import { copyText, downloadText } from './components/clipboard';
import { el } from './components/dom';
import { createTextareaField, setFieldLabels } from './components/fields';
import { createFindingsView } from './components/findings';
import type { Finding } from './components/findings';
import { createJsonViewer } from './components/json-viewer';
import { coreMessageText } from './i18n/core-message';
import { text } from './strings';
import type { UiStringKey } from './strings';

export interface Panel {
  /** Releases resources held by the panel. */
  dispose(): void;
  /**
   * Re-applies every label of the panel for the current locale without
   * rebuilding it: the typed document, the decoded JSON, the findings and a
   * running camera scan are all kept as they are.
   */
  refresh?(): void;
}

const INPUT_ID = 'chmed-to-json-input';
const OUTPUT_ID = 'chmed-to-json-output';
const FILE_INPUT_ID = 'chmed-to-json-file';
const CAMERA_HINT_ID = 'chmed-to-json-camera-hint';

/** Delay between two camera frames; scanning is cheap but not free. */
const SCAN_INTERVAL_MS = 250;

/** Which presentation of the decoded output is visible. */
type OutputView = 'structured' | 'raw';

/** Toggle button: a plain secondary button with the pressed state in ARIA. */
function createViewToggleButton(parent: HTMLElement, label: string): HTMLButtonElement {
  const button = el('button', 'secondary view-toggle-button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  parent.append(button);
  return button;
}

/**
 * Replaces the text of a label that leads with an icon, keeping the icon.
 *
 * The file label is built from `svg()` markup plus one text node, so assigning
 * `textContent` would drop the icon. Only the trailing text node is rewritten,
 * exactly like `setButtonLabel` does for buttons; a label without a text node
 * gets one appended.
 */
function setLeadingIconLabel(label: HTMLElement, value: string): void {
  const last = label.lastChild;
  if (last instanceof Text) {
    last.textContent = value;
    return;
  }
  label.append(document.createTextNode(value));
}

function errorFindings(errors: readonly ValidationError[]): Finding[] {
  return errors.map((error) => ({ path: error.instancePath, message: error.message }));
}

function warningFindings(warnings: readonly ValidationWarning[]): Finding[] {
  return warnings.map((warning) => ({ path: warning.path, message: warning.message }));
}

function decodeFindings(errors: readonly DecodeError[]): Finding[] {
  // The code (and its detail) is what the finding is localized from; the core's
  // English `message` is only the fallback for a code without a key.
  return errors.map((error) => ({ path: error.code, message: coreMessageText(error) }));
}

/** Turns an unexpected throw (e.g. a stack overflow) into a blocking finding. */
function unexpectedFinding(error: unknown): Finding {
  return {
    path: '',
    message: isNestingOverflow(error) ? NESTING_TOO_DEEP_MESSAGE : text('analysisFailed'),
  };
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function mountChmedToJson(container: HTMLElement): Panel {
  container.replaceChildren();

  const heading = el('h2');
  heading.textContent = text('tabChmedToJson');
  container.append(heading);

  // Input column first in the DOM (keyboard order = visual order at every
  // breakpoint); the wrappers are structural only.
  const workspace = el('div', 'workspace');
  const primaryColumn = el('div', 'workspace-primary');
  const secondaryColumn = el('div', 'workspace-secondary');
  workspace.append(primaryColumn, secondaryColumn);
  container.append(workspace);

  const inputSection = el('section', 'panel-section');
  primaryColumn.append(inputSection);

  const chmedInput = createTextareaField(inputSection, {
    id: INPUT_ID,
    label: text('chmedInputLabel'),
    hint: text('chmedInputHint'),
    rows: 8,
  });

  const decodeActions = el('div', 'actions');
  inputSection.append(decodeActions);
  const clearInputButton = createButtonWithIcon(decodeActions, text('clear'), 'eraser', {
    className: 'secondary',
    accessibleName: text('clearInputAccessibleName'),
  });
  const decodeButton = createButtonWithIcon(decodeActions, text('decodeToJson'), 'arrow-left-circle');

  const scanSection = el('section', 'panel-section');
  const scanHeading = el('h3');
  scanHeading.textContent = text('scanHeading');
  scanSection.append(scanHeading);
  primaryColumn.append(scanSection);

  const fileField = el('div', 'field');
  const fileLabel = el('label', 'field-label');
  fileLabel.htmlFor = FILE_INPUT_ID;
  fileLabel.textContent = text('scanFileLabel');
  fileLabel.insertAdjacentHTML('afterbegin', svg('upload'));

  const fileInput = el('input', 'field-input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.id = FILE_INPUT_ID;

  const fileHint = el('p', 'field-hint');
  fileHint.id = `${FILE_INPUT_ID}-hint`;
  fileHint.textContent = text('scanFileHint');
  fileInput.setAttribute('aria-describedby', fileHint.id);

  fileField.append(fileLabel, fileInput, fileHint);
  scanSection.append(fileField);

  const cameraRow = el('div', 'actions');
  const cameraButton = createButtonWithIcon(cameraRow, text('cameraStart'), 'video', { className: 'secondary' });
  const cameraHint = el('p', 'field-hint');
  cameraHint.id = CAMERA_HINT_ID;
  cameraHint.textContent = text('cameraPermissionHint');
  cameraButton.setAttribute('aria-describedby', cameraHint.id);
  scanSection.append(cameraRow, cameraHint);

  const video = el('video', 'camera-video');
  video.muted = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-label', text('cameraPreview'));
  video.hidden = true;
  scanSection.append(video);

  const scanStatus = el('p', 'scan-status');
  scanStatus.setAttribute('aria-live', 'polite');
  scanSection.append(scanStatus);

  const findings = createFindingsView(secondaryColumn, text('resultsHeading'), {
    // Findings describe the CHMED16A string typed or scanned into the input.
    getAnchorTarget: () => chmedInput,
  });

  const outputSection = el('section', 'panel-section');
  const outputHeading = el('h3');
  outputHeading.textContent = text('jsonOutputHeading');
  outputSection.append(outputHeading);
  secondaryColumn.append(outputSection);

  // View toggle: its own row above the output, deliberately outside the
  // copy/download `.actions` rows so its buttons can never be mistaken for a
  // data action. `aria-pressed` carries the state for assistive technology.
  const viewToggle = el('div', 'view-toggle');
  viewToggle.setAttribute('role', 'group');
  viewToggle.setAttribute('aria-label', text('jsonViewGroupLabel'));
  const structuredViewButton = createViewToggleButton(viewToggle, text('jsonViewStructured'));
  const rawViewButton = createViewToggleButton(viewToggle, text('jsonViewRaw'));
  outputSection.append(viewToggle);

  // Two hosts, only one visible at a time. The raw host keeps the textarea
  // field untouched; the structured host contains the presentation-only viewer.
  const rawView = el('div', 'json-view-raw');
  outputSection.append(rawView);
  const jsonOutput = createTextareaField(rawView, {
    id: OUTPUT_ID,
    label: text('jsonOutputLabel'),
    hint: text('jsonOutputHint'),
    rows: 16,
    readOnly: true,
  });

  const structuredView = el('div', 'json-view-structured');
  outputSection.append(structuredView);
  const jsonViewer = createJsonViewer(structuredView);

  const outputActions = el('div', 'actions');
  outputSection.append(outputActions);
  const clearOutputButton = createButtonWithIcon(outputActions, text('clear'), 'eraser', {
    className: 'secondary',
    accessibleName: text('clearOutputAccessibleName'),
  });
  const copyButton = createButtonWithIcon(outputActions, text('copy'), 'copy', {
    className: 'secondary',
    accessibleName: text('copyJsonAccessibleName'),
  });
  const downloadButton = createButtonWithIcon(outputActions, text('download'), 'download', {
    className: 'secondary',
    accessibleName: text('downloadJsonAccessibleName'),
  });
  copyButton.disabled = true;
  downloadButton.disabled = true;

  const outputStatus = el('p', 'copy-status');
  outputStatus.setAttribute('aria-live', 'polite');
  outputSection.append(outputStatus);

  // Detached canvas used to turn camera frames into ImageData.
  const canvas = el('canvas');
  let cameraActive = false;
  let scanning = false;
  let scanTimer: number | null = null;

  /**
   * What the scan status line currently says, kept as the key it was painted
   * from (plus its tone) so a locale change can re-issue the very same message.
   * Every write goes through {@link paintScanStatus}; a `null` key means idle.
   */
  let scanStatusKey: UiStringKey | null = null;
  let scanStatusVariant: 'is-error' | 'is-warning' | null = null;

  /**
   * Key of the neutral message the findings view currently shows, or `null`
   * when it shows findings. Kept so a locale change can re-issue the same
   * message instead of leaving stale wording on screen.
   */
  let findingsMessageKey: UiStringKey | null = null;

  // The raw textarea is the initial view; the first successful decode switches
  // to Structured unless the user already picked a view. Neither flag is
  // persisted: the choice lives for this session only (no localStorage).
  let hasDecoded = false;
  let userSelectedView = false;

  /** Switches visibility only — content is never recomputed here. */
  function applyView(view: OutputView): void {
    const structured = view === 'structured';
    structuredViewButton.setAttribute('aria-pressed', String(structured));
    rawViewButton.setAttribute('aria-pressed', String(!structured));
    rawView.hidden = structured;
    structuredView.hidden = !structured;
  }

  /**
   * Paints the scan status line from a key and remembers both.
   *
   * The message is resolved with `text()` at write time, so it always reflects
   * the locale current at that moment; there is no per-frame status text, so
   * nothing re-reads the locale inside the scan loop.
   */
  function paintScanStatus(key: UiStringKey | null, variant: 'is-error' | 'is-warning' | null): void {
    scanStatusKey = key;
    scanStatusVariant = variant;
    scanStatus.classList.remove('is-error', 'is-warning');
    if (variant !== null) {
      scanStatus.classList.add(variant);
    }
    scanStatus.textContent = key === null ? '' : text(key);
  }

  /** Shows findings; a live message is stale by definition. */
  function renderFindings(errors: readonly Finding[], warnings: readonly Finding[]): void {
    findingsMessageKey = null;
    findings.render(errors, warnings);
  }

  /** Shows one neutral message and remembers its key for the locale refresh. */
  function showFindingsMessage(key: UiStringKey): void {
    findingsMessageKey = key;
    findings.message(text(key));
  }

  function clearOutput(): void {
    jsonOutput.value = '';
    jsonViewer.clear();
    copyButton.disabled = true;
    downloadButton.disabled = true;
    outputStatus.textContent = '';
    // The view itself is intentionally left alone: clearing resets both
    // presentations' content, while the user's toggle choice persists.
  }

  function stopScanLoop(): void {
    scanning = false;
    if (scanTimer !== null) {
      window.clearTimeout(scanTimer);
      scanTimer = null;
    }
  }

  function stopCameraUi(): void {
    stopScanLoop();
    stopCamera();
    cameraActive = false;
    video.hidden = true;
    cameraButton.textContent = text('cameraStart');
  }

  function captureFrame(): ImageData | null {
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return null;
    }
  }

  function scheduleScan(): void {
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scanFrame();
    }, SCAN_INTERVAL_MS);
  }

  function scanFrame(): void {
    if (!scanning) {
      return;
    }
    const frame = captureFrame();
    if (frame !== null) {
      const result = scanImageData(frame);
      if (result.ok) {
        stopCameraUi();
        handleScannedText(result.text);
        return;
      }
    }
    if (scanning) {
      scheduleScan();
    }
  }

  async function startCameraUi(): Promise<void> {
    paintScanStatus(null, null);
    // Reveal the element first: some browsers refuse to play a display:none video.
    video.hidden = false;
    try {
      await startCamera(video);
    } catch {
      stopCameraUi();
      paintScanStatus('cameraUnavailable', 'is-error');
      return;
    }
    cameraActive = true;
    cameraButton.textContent = text('cameraStop');
    scanning = true;
    scheduleScan();
  }

  function handleScannedText(value: string): void {
    chmedInput.value = value;
    paintScanStatus('scanSuccess', null);
    decodeCurrentInput();
  }

  async function handleFile(file: File): Promise<void> {
    paintScanStatus(null, null);
    const result = await readFileAsImageData(file);
    fileInput.value = '';
    if (!result.ok) {
      paintScanStatus(result.code === 'no-qr' ? 'scanNoQr' : 'scanImageFailed', 'is-warning');
      return;
    }
    handleScannedText(result.text);
  }

  function decodeCurrentInput(): void {
    const value = chmedInput.value.trim();
    if (value === '') {
      showFindingsMessage('emptyInput');
      clearOutput();
      return;
    }

    // Second net around decode, pretty-printing and validation: the core turns
    // a stack overflow into a finding, but no unexpected throw may escape.
    try {
      decodeDocument(value);
    } catch (error) {
      renderFindings([unexpectedFinding(error)], []);
      clearOutput();
    }
  }

  function decodeDocument(value: string): void {
    const decoded = chmedToJson(value);
    if (!decoded.ok) {
      renderFindings(decodeFindings(decoded.errors), []);
      clearOutput();
      return;
    }

    const parsed = parseJsonText(decoded.jsonText);
    if (!parsed.ok) {
      renderFindings([{ path: '', message: parsed.error.message }], []);
      clearOutput();
      return;
    }

    jsonOutput.value = JSON.stringify(parsed.value, null, 2);
    // Pure presentation: the viewer receives the decoded object (not the
    // textarea text), and the textarea above stays byte-identical and canonical
    // for copy/download. Re-rendering the viewer never writes to the textarea.
    jsonViewer.render(parsed.value);
    copyButton.disabled = false;
    downloadButton.disabled = false;
    outputStatus.textContent = '';

    // First successful decode: show the structured presentation by default.
    // Once the user has toggled, their choice wins across later decodes.
    if (!hasDecoded) {
      hasDecoded = true;
      if (!userSelectedView) {
        applyView('structured');
      }
    }

    const validation = validateObject(parsed.value);
    renderFindings(errorFindings(validation.errors), warningFindings(validation.warnings));
  }

  decodeButton.addEventListener('click', decodeCurrentInput);

  structuredViewButton.addEventListener('click', () => {
    userSelectedView = true;
    applyView('structured');
  });

  rawViewButton.addEventListener('click', () => {
    userSelectedView = true;
    applyView('raw');
  });

  // Pre-decode state: the raw textarea (today's behaviour).
  applyView('raw');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file === undefined) {
      return;
    }
    void handleFile(file);
  });

  cameraButton.addEventListener('click', () => {
    if (cameraActive) {
      stopCameraUi();
      paintScanStatus(null, null);
      return;
    }
    void startCameraUi();
  });

  copyButton.addEventListener('click', () => {
    void copyText(jsonOutput.value, outputStatus);
  });

  downloadButton.addEventListener('click', () => {
    downloadText(text('jsonFilename'), jsonOutput.value, 'application/json;charset=utf-8');
  });

  clearInputButton.addEventListener('click', () => {
    // Stop an active camera first: its scan loop would otherwise refill the
    // field moments after it was emptied.
    stopCameraUi();
    chmedInput.value = '';
    paintScanStatus(null, null);
    showFindingsMessage('notValidated');
    clearOutput();
  });

  // Same path the panel already uses for an empty or undecodable document.
  clearOutputButton.addEventListener('click', clearOutput);

  showFindingsMessage('notValidated');

  /**
   * Re-applies every label this panel owns from the current locale.
   *
   * Label-only by contract. Kept as-is across the repaint: the typed CHMED16A
   * string, the decoded JSON in both presentations, the selected view, the
   * findings, the copy/download enabled state and an ACTIVE camera session —
   * nothing here calls `dispose`, `stopCameraUi`, `startCameraUi` or a decode,
   * so a running scan loop and its scheduled frame keep untouched.
   *
   * Shared-component labels are re-created through their own handles
   * (`relabel`, `setFieldLabels`, `setButtonLabel`). Two pieces of text are
   * re-derived from tracked state instead of being left stale: the scan status
   * line (from `scanStatusKey`) and the findings message (from
   * `findingsMessageKey`). The camera button label follows `cameraActive`, so a
   * running session still reads "stop" in the new locale; it is written through
   * `setButtonLabel`, which edits the trailing text node only.
   *
   * Transient outcome messages written with `textContent` (a copy confirmation)
   * are left alone: they describe an event, not a label. The structured viewer's
   * own labels (section hints, missing-required badge, region name) are re-applied
   * by `jsonViewer.relabel()`, in place, so an expanded section stays open.
   */
  function refreshLabels(): void {
    heading.textContent = text('tabChmedToJson');
    setFieldLabels(chmedInput, { label: text('chmedInputLabel'), hint: text('chmedInputHint') });
    setButtonLabel(clearInputButton, text('clear'), text('clearInputAccessibleName'));
    setButtonLabel(decodeButton, text('decodeToJson'));

    scanHeading.textContent = text('scanHeading');
    setLeadingIconLabel(fileLabel, text('scanFileLabel'));
    fileHint.textContent = text('scanFileHint');
    setButtonLabel(cameraButton, text(cameraActive ? 'cameraStop' : 'cameraStart'));
    cameraHint.textContent = text('cameraPermissionHint');
    video.setAttribute('aria-label', text('cameraPreview'));
    paintScanStatus(scanStatusKey, scanStatusVariant);

    findings.relabel(text('resultsHeading'));
    if (findingsMessageKey !== null) {
      findings.message(text(findingsMessageKey));
    }

    outputHeading.textContent = text('jsonOutputHeading');
    setFieldLabels(jsonOutput, { label: text('jsonOutputLabel'), hint: text('jsonOutputHint') });
    viewToggle.setAttribute('aria-label', text('jsonViewGroupLabel'));
    structuredViewButton.textContent = text('jsonViewStructured');
    rawViewButton.textContent = text('jsonViewRaw');
    jsonViewer.relabel();
    setButtonLabel(clearOutputButton, text('clear'), text('clearOutputAccessibleName'));
    setButtonLabel(copyButton, text('copy'), text('copyJsonAccessibleName'));
    setButtonLabel(downloadButton, text('download'), text('downloadJsonAccessibleName'));
  }

  return {
    dispose: () => {
      stopCameraUi();
    },
    refresh: refreshLabels,
  };
}
