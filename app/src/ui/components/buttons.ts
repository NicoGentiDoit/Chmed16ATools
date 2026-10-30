/** Buttons with a leading Lucide icon. */

import { el } from './dom';

/**
 * Icons the panels use. The closed union keeps arbitrary markup out and turns a
 * misspelled icon name into a type error: Lucide's `createIcons` silently skips
 * unknown names, so a typo would otherwise just drop the icon.
 */
export type PanelIconName =
  | 'upload'
  | 'search'
  | 'copy'
  | 'download'
  | 'eraser'
  | 'check-circle'
  | 'arrow-right-circle'
  | 'arrow-left-circle'
  | 'image-down'
  | 'video';

/** Lucide icon name → inline SVG string. */
export function svg(name: PanelIconName): string {
  return `<i data-lucide="${name}" aria-hidden="true" style="width:1em;height:1em;vertical-align:-0.125em;flex-shrink:0"></i>`;
}

export interface ButtonOptions {
  readonly className?: string;
  readonly accessibleName?: string;
}

/**
 * createButton variant that accepts an optional icon name.
 *
 * The icon must be injected via `innerHTML` (so Lucide can replace it with an
 * SVG); only the visible text part is set through textContent so unknown
 * characters are never escaped twice.
 */
export function createButtonWithIcon(
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

/**
 * Replaces the visible text of a button built by {@link createButtonWithIcon}.
 *
 * The icon markup (Lucide's `<i>` or the SVG it was swapped for) stays in place;
 * only the trailing text node and the accessible name change. `accessibleName`
 * defaults to the visible label, exactly like the factory.
 */
export function setButtonLabel(
  button: HTMLButtonElement,
  labelText: string,
  accessibleName?: string,
): void {
  const last = button.lastChild;
  if (last instanceof Text) {
    last.textContent = ` ${labelText}`;
  } else {
    button.append(document.createTextNode(` ${labelText}`));
  }
  button.setAttribute('aria-label', accessibleName ?? labelText);
}

/**
 * Replaces the text of a label whose leading icon was injected as markup.
 *
 * A `<label>` that carries a Lucide icon cannot be relabelled with
 * `textContent` (that would drop the icon), so this rewrites only its trailing
 * text node — the same technique {@link setButtonLabel} uses for buttons. Used
 * by the locale refresh, where only words may change.
 */
export function setLeadingIconLabel(label: HTMLElement, value: string): void {
  const last = label.lastChild;
  if (last instanceof Text) {
    last.textContent = value;
    return;
  }
  label.append(document.createTextNode(value));
}
