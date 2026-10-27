/**
 * Tab 1 — CHMED16A JSON document → validated, encoded string and QR symbol.
 *
 * Plain DOM wiring over the framework-free core modules. Nothing is persisted
 * and nothing is sent anywhere: the document lives in the textarea, the encoded
 * string in a read-only textarea and the QR code in an inline SVG.
 */

import { jsonToChmed } from '../core/encode';
import { generateQr, qrToSvg } from '../core/qr-generate';
import type { QrEcLevel } from '../core/qr-generate';
import { validateJsonText } from '../core/validate';
import type { ValidationError, ValidationWarning } from '../core/validate';
import { format, text } from './strings';

/** A validation finding flattened for rendering. */
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
const INPUT_ID = 'json-to-chmed-input';
const OUTPUT_ID = 'json-to-chmed-output';
const EC_ID = 'json-to-chmed-ec';

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

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function mountJsonToChmed(container: HTMLElement): Panel {
  container.replaceChildren();

  const heading = el('h2');
  heading.textContent = text('tabJsonToChmed');
  container.append(heading);

  const inputSection = el('section', 'panel-section');
  container.append(inputSection);

  const jsonInput = createTextareaField(inputSection, {
    id: INPUT_ID,
    label: text('jsonInputLabel'),
    hint: text('jsonInputHint'),
    rows: 14,
  });

  const inputActions = el('div', 'actions');
  inputSection.append(inputActions);
  const validateButton = createButton(inputActions, text('validateJson'), {
    className: 'secondary',
  });
  const encodeButton = createButton(inputActions, text('encodeToChmed'));

  const findings = createFindingsView(container, text('validationHeading'));

  const outputSection = el('section', 'panel-section');
  const outputHeading = el('h3');
  outputHeading.textContent = text('chmedOutputHeading');
  outputSection.append(outputHeading);
  container.append(outputSection);

  const chmedOutput = createTextareaField(outputSection, {
    id: OUTPUT_ID,
    label: text('chmedOutputLabel'),
    hint: text('chmedOutputHint'),
    rows: 8,
    readOnly: true,
  });

  const outputActions = el('div', 'actions');
  outputSection.append(outputActions);
  const copyButton = createButton(outputActions, text('copy'), {
    className: 'secondary',
    accessibleName: text('copyChmedAccessibleName'),
  });
  const downloadButton = createButton(outputActions, text('download'), {
    className: 'secondary',
    accessibleName: text('downloadChmedAccessibleName'),
  });
  copyButton.disabled = true;
  downloadButton.disabled = true;

  const outputStatus = el('p', 'copy-status');
  outputStatus.setAttribute('aria-live', 'polite');
  outputSection.append(outputStatus);

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

  let lastChmed: string | null = null;

  function readEcLevel(): QrEcLevel {
    const value = ecSelect.value;
    return EC_LEVELS.find((level) => level === value) ?? DEFAULT_EC_LEVEL;
  }

  function renderQr(): void {
    preview.replaceChildren();
    qrInfo.textContent = '';
    qrStatus.classList.remove('is-error');

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

  validateButton.addEventListener('click', () => {
    const input = jsonInput.value;
    if (input.trim() === '') {
      findings.message(text('emptyInput'));
      resetOutput();
      return;
    }
    const result = validateJsonText(input);
    findings.render(errorFindings(result.errors), warningFindings(result.warnings));
    encodeButton.disabled = result.errors.length > 0;
    if (!result.ok) {
      resetOutput();
    }
  });

  encodeButton.addEventListener('click', () => {
    const input = jsonInput.value;
    if (input.trim() === '') {
      findings.message(text('emptyInput'));
      resetOutput();
      return;
    }
    const result = jsonToChmed(input);
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
  });

  ecSelect.addEventListener('change', renderQr);

  copyButton.addEventListener('click', () => {
    void copyText(chmedOutput.value, outputStatus);
  });

  downloadButton.addEventListener('click', () => {
    downloadText(text('chmedFilename'), chmedOutput.value, 'text/plain;charset=utf-8');
  });

  findings.message(text('notValidated'));
  renderQr();

  return {
    dispose: () => {
      // This tab holds no resources: nothing to release.
    },
  };
}
