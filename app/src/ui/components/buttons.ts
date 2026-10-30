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
