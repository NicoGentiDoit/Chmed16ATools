/** Labelled form fields shared by the panels. */

import { el } from './dom';

export interface TextareaOptions {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly rows?: number;
  readonly readOnly?: boolean;
}

/** Labelled textarea plus optional hint, wired to the field via `aria-describedby`. */
export function createTextareaField(
  parent: HTMLElement,
  options: TextareaOptions,
): HTMLTextAreaElement {
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

/**
 * Re-applies a field's visible label and hint in place (locale refresh).
 *
 * Only the text of the label and of the hint paragraph changes: the textarea,
 * its value, its id and every listener stay untouched. `hint` is ignored when
 * the field was created without one.
 */
export function setFieldLabels(
  area: HTMLTextAreaElement,
  labels: { readonly label: string; readonly hint?: string },
): void {
  const wrapper = area.closest('.field');
  if (wrapper === null) {
    return;
  }
  const label = wrapper.querySelector('label');
  if (label !== null) {
    label.textContent = labels.label;
  }
  if (labels.hint !== undefined) {
    const hint = wrapper.querySelector('p.field-hint');
    if (hint !== null) {
      hint.textContent = labels.hint;
    }
  }
}
