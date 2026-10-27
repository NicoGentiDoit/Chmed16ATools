/**
 * Tab 2 — CHMED16A document (typed, uploaded or scanned) → pretty JSON.
 *
 * The decoder already accepts both compression variants, so the UI never
 * branches on the header. Uploaded images and the optional camera feed both go
 * through `scanImageData`; the camera is started only from a user gesture and
 * stopped on success, on tab switch and on page hide (see `dispose`).
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
import { text } from './strings';

/** Lucide icon name → inline SVG string. */
function svg(name: string): string {
  return `<i data-lucide="${name}" aria-hidden="true" style="width:1em;height:1em;vertical-align:-0.125em"></i>`;
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

const INPUT_ID = 'chmed-to-json-input';
const OUTPUT_ID = 'chmed-to-json-output';
const FILE_INPUT_ID = 'chmed-to-json-file';
const CAMERA_HINT_ID = 'chmed-to-json-camera-hint';

/** Delay between two camera frames; scanning is cheap but not free. */
const SCAN_INTERVAL_MS = 250;

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

function createButton(
  parent: HTMLElement,
  labelText: string,
  options: ButtonOptions = {},
): HTMLButtonElement {
  const button = el('button', options.className);
  button.type = 'button';
  button.textContent = labelText;
  if (options.accessibleName !== undefined) {
    button.setAttribute('aria-label', options.accessibleName);
  }
  parent.append(button);
  return button;
}

function errorFindings(errors: readonly ValidationError[]): Finding[] {
  return errors.map((error) => ({ path: error.instancePath, message: error.message }));
}

function warningFindings(warnings: readonly ValidationWarning[]): Finding[] {
  return warnings.map((warning) => ({ path: warning.path, message: warning.message }));
}

function decodeFindings(errors: readonly DecodeError[]): Finding[] {
  return errors.map((error) => ({ path: error.code, message: error.message }));
}

interface FindingsView {
  render(errors: readonly Finding[], warnings: readonly Finding[]): void;
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

  const render = (errors: readonly Finding[], warnings: readonly Finding[]): void => {
    container.replaceChildren();

    const summary = el('p', 'findings-summary');
    summary.textContent = `${text('errorsLabel')}: ${errors.length} · ${text('warningsLabel')}: ${warnings.length}`;
    container.append(summary);

    if (errors.length === 0 && warnings.length === 0) {
      const ok = el('p', 'findings-ok');
      ok.textContent = text('noFindings');
      container.append(ok);
      return;
    }

    appendFindingList(container, text('errorsLabel'), errors, 'is-error');
    appendFindingList(container, text('warningsLabel'), warnings, 'is-warning');
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

  const inputSection = el('section', 'panel-section');
  container.append(inputSection);

  const chmedInput = createTextareaField(inputSection, {
    id: INPUT_ID,
    label: text('chmedInputLabel'),
    hint: text('chmedInputHint'),
    rows: 8,
  });

  const decodeActions = el('div', 'actions');
  inputSection.append(decodeActions);
  const decodeButton = createButton(decodeActions, `${svg('arrow-left-circle')} ${text('decodeToJson')}`);

  const scanSection = el('section', 'panel-section');
  const scanHeading = el('h3');
  scanHeading.textContent = text('scanHeading');
  scanSection.append(scanHeading);
  container.append(scanSection);

  const fileField = el('div', 'field');
  const fileLabel = el('label', 'field-label');
  fileLabel.htmlFor = FILE_INPUT_ID;
  fileLabel.textContent = `${svg('upload')} ${text('scanFileLabel')}`;

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
  const cameraButton = createButton(cameraRow, `${svg('video')} ${text('cameraStart')}`, { className: 'secondary' });
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

  const findings = createFindingsView(container, text('resultsHeading'));

  const outputSection = el('section', 'panel-section');
  const outputHeading = el('h3');
  outputHeading.textContent = text('jsonOutputHeading');
  outputSection.append(outputHeading);
  container.append(outputSection);

  const jsonOutput = createTextareaField(outputSection, {
    id: OUTPUT_ID,
    label: text('jsonOutputLabel'),
    hint: text('jsonOutputHint'),
    rows: 16,
    readOnly: true,
  });

  const outputActions = el('div', 'actions');
  outputSection.append(outputActions);
  const copyButton = createButton(outputActions, `${svg('copy')} ${text('copy')}`, {
    className: 'secondary',
    accessibleName: text('copyJsonAccessibleName'),
  });
  const downloadButton = createButton(outputActions, `${svg('download')} ${text('download')}`, {
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

  function setScanStatus(message: string, variant: '' | 'is-error' | 'is-warning'): void {
    scanStatus.classList.remove('is-error', 'is-warning');
    if (variant !== '') {
      scanStatus.classList.add(variant);
    }
    scanStatus.textContent = message;
  }

  function clearOutput(): void {
    jsonOutput.value = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
    outputStatus.textContent = '';
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
    setScanStatus('', '');
    // Reveal the element first: some browsers refuse to play a display:none video.
    video.hidden = false;
    try {
      await startCamera(video);
    } catch {
      stopCameraUi();
      setScanStatus(text('cameraUnavailable'), 'is-error');
      return;
    }
    cameraActive = true;
    cameraButton.textContent = text('cameraStop');
    scanning = true;
    scheduleScan();
  }

  function handleScannedText(value: string): void {
    chmedInput.value = value;
    setScanStatus(text('scanSuccess'), '');
    decodeCurrentInput();
  }

  async function handleFile(file: File): Promise<void> {
    setScanStatus('', '');
    const result = await readFileAsImageData(file);
    fileInput.value = '';
    if (!result.ok) {
      setScanStatus(
        result.code === 'no-qr' ? text('scanNoQr') : text('scanImageFailed'),
        'is-warning',
      );
      return;
    }
    handleScannedText(result.text);
  }

  function decodeCurrentInput(): void {
    const value = chmedInput.value.trim();
    if (value === '') {
      findings.message(text('emptyInput'));
      clearOutput();
      return;
    }

    // Second net around decode, pretty-printing and validation: the core turns
    // a stack overflow into a finding, but no unexpected throw may escape.
    try {
      decodeDocument(value);
    } catch (error) {
      findings.render([unexpectedFinding(error)], []);
      clearOutput();
    }
  }

  function decodeDocument(value: string): void {
    const decoded = chmedToJson(value);
    if (!decoded.ok) {
      findings.render(decodeFindings(decoded.errors), []);
      clearOutput();
      return;
    }

    const parsed = parseJsonText(decoded.jsonText);
    if (!parsed.ok) {
      findings.render([{ path: '', message: parsed.error.message }], []);
      clearOutput();
      return;
    }

    jsonOutput.value = JSON.stringify(parsed.value, null, 2);
    copyButton.disabled = false;
    downloadButton.disabled = false;
    outputStatus.textContent = '';

    const validation = validateObject(parsed.value);
    findings.render(errorFindings(validation.errors), warningFindings(validation.warnings));
  }

  decodeButton.addEventListener('click', decodeCurrentInput);

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
      setScanStatus('', '');
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

  findings.message(text('notValidated'));

  return {
    dispose: () => {
      stopCameraUi();
    },
  };
}
