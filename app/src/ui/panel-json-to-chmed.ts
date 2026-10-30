/**
 * Tab 1 — CHMED16A JSON document → validated, encoded string and QR symbol.
 *
 * Plain DOM wiring over the framework-free core modules. Nothing is persisted
 * and nothing is sent anywhere: the document lives in the textarea, the encoded
 * string in a read-only textarea and the QR code in an inline SVG.
 */

import { jsonToChmed } from '../core/encode';
import type { EncodeResult } from '../core/encode';
import { generateQr, qrToSvg } from '../core/qr-generate';
import type { QrEcLevel, QrMatrix } from '../core/qr-generate';
import { NESTING_TOO_DEEP_MESSAGE, isNestingOverflow, validateJsonText } from '../core/validate';
import type { ValidationError, ValidationResult, ValidationWarning } from '../core/validate';
import { createButtonWithIcon } from './components/buttons';
import { copyText, downloadText } from './components/clipboard';
import { el } from './components/dom';
import { createDropzone } from './components/dropzone';
import type { DropRejection } from './components/dropzone';
import { createTextareaField } from './components/fields';
import { createFindingsView } from './components/findings';
import type { Finding } from './components/findings';
import { format, text } from './strings';

export interface Panel {
  /** Releases resources held by the panel. */
  dispose(): void;
}

const EC_LEVELS: readonly QrEcLevel[] = ['L', 'M', 'Q', 'H'];
const DEFAULT_EC_LEVEL: QrEcLevel = 'M';
const INPUT_ID = 'json-to-chmed-input';
const OUTPUT_ID = 'json-to-chmed-output';
const EC_ID = 'json-to-chmed-ec';

/**
 * Largest text file the drop zone accepts (1 MiB).
 *
 * UI-only guard: the textarea itself has no size limit and the core has none
 * either, so this only keeps an accidental multi-megabyte drop from freezing a
 * long validation. Typing or pasting the same text is still allowed.
 */
const MAX_INPUT_FILE_BYTES = 1024 * 1024;

/** Pixels per module in the exported PNG (integer scale, hence crisp edges). */
const PNG_MODULE_PX = 8;
/** Quiet zone in modules (ISO/IEC 18004), matching the on-screen SVG. */
const PNG_QUIET_ZONE_MODULES = 4;
const PNG_MIME_TYPE = 'image/png';

function errorFindings(errors: readonly ValidationError[]): Finding[] {
  return errors.map((error) => ({ path: error.instancePath, message: error.message }));
}

function warningFindings(warnings: readonly ValidationWarning[]): Finding[] {
  return warnings.map((warning) => ({ path: warning.path, message: warning.message }));
}

/**
 * Wording for a rejected drop.
 *
 * The value is always assigned with `textContent`, so a file name can never
 * become markup. A rejected drop leaves the textarea exactly as it was, and a
 * read failure is a warning rather than an error: nothing was changed and the
 * user can paste the same text instead.
 */
function dropRejectionMessage(rejection: DropRejection): string {
  switch (rejection.reason) {
    case 'unsupported':
      return format(text('dropFileUnsupported'), { name: rejection.fileName });
    case 'too-large':
      return format(text('dropFileTooLarge'), { name: rejection.fileName });
    case 'multiple':
      return format(text('dropMultipleFiles'), { name: rejection.fileName });
    case 'read-error':
      return text('dropReadFailed');
  }
}

/* -------------------------------------------------------------------------- */
/* QR raster export                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Draws a module map onto a fresh canvas: white background, black modules,
 * 8 px per module and a 4-module quiet zone. Nothing else is painted, so the
 * exported raster carries no metadata and no UI chrome.
 *
 * Returns `null` when the browser gives no 2D context.
 */
function rasterizeQr(matrix: QrMatrix): HTMLCanvasElement | null {
  const canvas = el('canvas');
  const modules = matrix.size + PNG_QUIET_ZONE_MODULES * 2;
  canvas.width = modules * PNG_MODULE_PX;
  canvas.height = modules * PNG_MODULE_PX;

  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.data[(row * matrix.size + col) * 4] !== 0) {
        continue;
      }
      context.fillRect(
        (col + PNG_QUIET_ZONE_MODULES) * PNG_MODULE_PX,
        (row + PNG_QUIET_ZONE_MODULES) * PNG_MODULE_PX,
        PNG_MODULE_PX,
        PNG_MODULE_PX,
      );
    }
  }

  return canvas;
}

/**
 * Downloads the QR symbol as `chmed16a-qr.png`.
 *
 * `toDataURL` yields a self-contained image, so no object URL is created and
 * therefore none has to be revoked.
 */
function downloadQrPng(matrix: QrMatrix): boolean {
  const canvas = rasterizeQr(matrix);
  if (canvas === null) {
    return false;
  }
  try {
    const link = el('a');
    link.href = canvas.toDataURL(PNG_MIME_TYPE);
    link.download = text('qrFilename');
    document.body.append(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
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

export function mountJsonToChmed(container: HTMLElement): Panel {
  container.replaceChildren();

  const heading = el('h2');
  heading.textContent = text('tabJsonToChmed');
  container.append(heading);

  // Two-column workbench: the input column comes first in the DOM so keyboard
  // order matches the visual order in both the stacked and the side-by-side
  // layout. The wrappers only position the existing sections; every id, control
  // and handler below is unchanged.
  const workspace = el('div', 'workspace');
  const primaryColumn = el('div', 'workspace-primary');
  const secondaryColumn = el('div', 'workspace-secondary');
  workspace.append(primaryColumn, secondaryColumn);
  container.append(workspace);

  const inputSection = el('section', 'panel-section');
  primaryColumn.append(inputSection);

  // The drop zone wraps only the labelled field: the whole field is a target,
  // the visible ring stays around the input, and the actions row is not part of
  // it. Dropping is a pointer-only affordance — the textarea below is still the
  // sole keyboard and paste path, and it stays the single source of truth.
  const dropzone = createDropzone(inputSection, {
    maxSizeBytes: MAX_INPUT_FILE_BYTES,
    onFileText: (value) => {
      loadDroppedText(value);
    },
    onReject: (rejection) => {
      dropzone.status.textContent = dropRejectionMessage(rejection);
      dropzone.status.classList.add('is-warning');
    },
  });

  const jsonInput = createTextareaField(dropzone.zone, {
    id: INPUT_ID,
    label: text('jsonInputLabel'),
    hint: text('jsonInputHint'),
    rows: 14,
  });

  const dragHint = el('p', 'dropzone-hint');
  dragHint.textContent = text('jsonInputDragHint');
  dropzone.zone.append(dragHint);

  const inputActions = el('div', 'actions');
  inputSection.append(inputActions);
  const clearInputButton = createButtonWithIcon(inputActions, text('clear'), 'eraser', {
    className: 'secondary',
    accessibleName: text('clearInputAccessibleName'),
  });
  const validateButton = createButtonWithIcon(inputActions, text('validateJson'), 'check-circle', {
    className: 'secondary',
  });
  const encodeButton = createButtonWithIcon(inputActions, text('encodeToChmed'), 'arrow-right-circle');

  const findings = createFindingsView(secondaryColumn, text('validationHeading'), {
    // Findings describe the document in the textarea above the actions.
    getAnchorTarget: () => jsonInput,
  });

  const outputSection = el('section', 'panel-section');
  const outputHeading = el('h3');
  outputHeading.textContent = text('chmedOutputHeading');
  outputSection.append(outputHeading);
  secondaryColumn.append(outputSection);

  const chmedOutput = createTextareaField(outputSection, {
    id: OUTPUT_ID,
    label: text('chmedOutputLabel'),
    hint: text('chmedOutputHint'),
    rows: 8,
    readOnly: true,
  });

  const outputActions = el('div', 'actions');
  outputSection.append(outputActions);
  const clearOutputButton = createButtonWithIcon(outputActions, text('clear'), 'eraser', {
    className: 'secondary',
    accessibleName: text('clearOutputAccessibleName'),
  });
  const copyButton = createButtonWithIcon(outputActions, text('copy'), 'copy', {
    className: 'secondary',
    accessibleName: text('copyChmedAccessibleName'),
  });
  const downloadButton = createButtonWithIcon(outputActions, text('download'), 'download', {
    className: 'secondary',
    accessibleName: text('downloadChmedAccessibleName'),
  });
  const pngButton = createButtonWithIcon(outputActions, text('downloadPng'), 'image-down', {
    className: 'secondary',
    accessibleName: text('downloadPngAccessibleName'),
  });
  copyButton.disabled = true;
  downloadButton.disabled = true;
  pngButton.disabled = true;

  const outputStatus = el('p', 'copy-status');
  outputStatus.setAttribute('aria-live', 'polite');
  outputSection.append(outputStatus);

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

  let lastChmed: string | null = null;
  /** Module map of the symbol currently previewed, for the PNG export. */
  let lastMatrix: QrMatrix | null = null;

  function readEcLevel(): QrEcLevel {
    const value = ecSelect.value;
    return EC_LEVELS.find((level) => level === value) ?? DEFAULT_EC_LEVEL;
  }

  function renderQr(): void {
    preview.replaceChildren();
    qrInfo.textContent = '';
    qrStatus.classList.remove('is-error');
    lastMatrix = null;
    pngButton.disabled = true;

    if (lastChmed === null) {
      qrStatus.textContent = text('qrEmpty');
      return;
    }

    const result = generateQr(lastChmed, { ecLevel: readEcLevel() });
    if (!result.ok) {
      qrStatus.classList.add('is-error');
      qrStatus.textContent = format(text('qrOverflow'), {
        level: result.ecLevel,
        bytes: result.utf8Bytes,
      });
      return;
    }

    lastMatrix = result.matrix;
    pngButton.disabled = false;
    qrStatus.textContent = '';
    preview.innerHTML = qrToSvg(result);
    const svg = preview.querySelector('svg');
    if (svg !== null) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', format(text('qrAriaLabel'), { level: result.ecLevel }));
    }
    qrInfo.textContent = format(text('qrInfo'), {
      version: result.version,
      bytes: result.utf8Bytes,
    });
  }

  function resetOutput(): void {
    lastChmed = null;
    chmedOutput.value = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
    outputStatus.textContent = '';
    renderQr();
  }

  function runValidation(): void {
    const input = jsonInput.value;
    if (input.trim() === '') {
      findings.message(text('emptyInput'));
      resetOutput();
      return;
    }
    // Second net: the core already turns a stack overflow into a finding, but
    // no unexpected throw may ever escape and blank the results area.
    let result: ValidationResult;
    try {
      result = validateJsonText(input);
    } catch (error) {
      findings.render([unexpectedFinding(error)], []);
      encodeButton.disabled = true;
      resetOutput();
      return;
    }
    findings.render(errorFindings(result.errors), warningFindings(result.warnings));
    encodeButton.disabled = result.errors.length > 0;
    if (!result.ok) {
      resetOutput();
    }
  }

  /**
   * Loads dropped text exactly as if the user had typed it and pressed
   * Validate: the value is assigned, the field's own `input` event is fired
   * (the existing listener re-enables Encode) and the same validation path the
   * Validate button runs is invoked once, so the findings describe the new
   * text. A second drop replaces the content, the same way retyping would.
   */
  function loadDroppedText(value: string): void {
    jsonInput.value = value;
    jsonInput.dispatchEvent(new Event('input', { bubbles: true }));
    runValidation();
  }

  validateButton.addEventListener('click', runValidation);

  encodeButton.addEventListener('click', () => {
    const input = jsonInput.value;
    if (input.trim() === '') {
      findings.message(text('emptyInput'));
      resetOutput();
      return;
    }
    let result: EncodeResult;
    try {
      result = jsonToChmed(input);
    } catch (error) {
      findings.render([unexpectedFinding(error)], []);
      encodeButton.disabled = true;
      resetOutput();
      return;
    }
    const warnings = warningFindings(result.warnings);
    if (!result.ok) {
      findings.render(errorFindings(result.errors), warnings);
      encodeButton.disabled = true;
      resetOutput();
      return;
    }
    findings.render([], warnings);
    lastChmed = result.chmed;
    chmedOutput.value = result.chmed;
    copyButton.disabled = false;
    downloadButton.disabled = false;
    outputStatus.textContent = '';
    renderQr();
  });

  jsonInput.addEventListener('input', () => {
    // A blocking finding only applies to the text it was produced from.
    encodeButton.disabled = false;
    // A drop message describes the previous content; an edit makes it stale.
    dropzone.clearStatus();
  });

  ecSelect.addEventListener('change', renderQr);

  copyButton.addEventListener('click', () => {
    void copyText(chmedOutput.value, outputStatus);
  });

  downloadButton.addEventListener('click', () => {
    downloadText(text('chmedFilename'), chmedOutput.value, 'text/plain;charset=utf-8');
  });

  pngButton.addEventListener('click', () => {
    if (lastMatrix === null) {
      return;
    }
    outputStatus.textContent = downloadQrPng(lastMatrix) ? '' : text('qrPngFailed');
  });

  clearInputButton.addEventListener('click', () => {
    jsonInput.value = '';
    // Back to the first-load view: nothing validated, nothing encoded. The
    // input listener re-enables Encode as soon as a document is typed again.
    encodeButton.disabled = true;
    findings.message(text('notValidated'));
    dropzone.clearStatus();
    resetOutput();
  });

  // Same path the panel already uses for an empty or invalid document.
  clearOutputButton.addEventListener('click', resetOutput);

  findings.message(text('notValidated'));
  renderQr();

  return {
    dispose: () => {
      // This tab holds no resources: nothing to release.
    },
  };
}
