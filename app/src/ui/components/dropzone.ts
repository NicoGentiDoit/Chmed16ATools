/**
 * Native drag-and-drop file intake for a text field.
 *
 * The zone is a pointer-only accelerator: it reads exactly one dropped text
 * file and hands the text to `onFileText`. It owns no document state and never
 * writes to the field, so the caller keeps the textarea as the single source of
 * truth. It is deliberately not focusable and carries no ARIA role or tab stop:
 * keyboard and assistive-technology users keep the existing textarea, where
 * typing and pasting remain the primary path. Nothing here is interactive, so
 * the zone is invisible to the tab order by construction.
 *
 * Rejections are reported through `onReject` rather than rendered here, so the
 * caller owns the wording. The factory returns a polite live region (`status`)
 * for that message; the caller writes it with `textContent` only.
 *
 * The file name is reported but never inserted into the DOM by this module.
 *
 * Lifetime: listeners sit on the zone element itself, so they disappear with
 * it when the panel subtree is removed, and nothing is attached to `document`
 * or `window`. The default "open the dropped file" behaviour is prevented only
 * inside this zone; drops elsewhere on the page are untouched.
 */

import { el } from './dom';

/** Why a dropped file was not turned into text. */
export type DropRejection =
  | { readonly reason: 'unsupported'; readonly fileName: string }
  | { readonly reason: 'too-large'; readonly fileName: string }
  | { readonly reason: 'multiple'; readonly fileName: string }
  | { readonly reason: 'read-error'; readonly fileName: string };

/** Extensions accepted regardless of the (often empty) browser MIME type. */
const TEXT_EXTENSIONS = ['.json', '.txt'] as const;

export interface DropzoneOptions {
  /** Upper bound in bytes; a larger file is rejected before any read starts. */
  readonly maxSizeBytes: number;
  /** Text of the single accepted file, plus its name. */
  readonly onFileText: (text: string, fileName: string) => void;
  /** Called for every rejected drop. Nothing was read and nothing was written. */
  readonly onReject: (rejection: DropRejection) => void;
}

export interface Dropzone {
  /** The drop region; build the field this zone augments inside it. */
  readonly zone: HTMLElement;
  /** Polite live region directly under the zone; the caller writes the text. */
  readonly status: HTMLParagraphElement;
  /** Clears the message and its tone. */
  clearStatus(): void;
}

/** A file is acceptable when its extension or MIME type says "text". */
function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (TEXT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return true;
  }
  const type = file.type.toLowerCase();
  return type.startsWith('text/') || type === 'application/json';
}

/**
 * Wraps a text field in a drop zone and returns both the zone and its status
 * line. The caller appends the field to `zone`, so the whole labelled field is
 * a target and the visual ring follows the field, not the results column.
 */
export function createDropzone(parent: HTMLElement, options: DropzoneOptions): Dropzone {
  const zone = el('div', 'dropzone');

  const status = el('p', 'dropzone-status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  parent.append(zone, status);

  const clearStatus = (): void => {
    status.textContent = '';
    status.classList.remove('is-warning');
  };

  // A second drop supersedes an in-flight read: the token stops an older
  // FileReader from landing after a newer one and resurrecting stale text.
  let readToken = 0;

  const readFile = (file: File): void => {
    const token = (readToken += 1);
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== readToken) {
        return;
      }
      const result = reader.result;
      if (typeof result !== 'string') {
        options.onReject({ reason: 'read-error', fileName: file.name });
        return;
      }
      options.onFileText(result, file.name);
    };
    reader.onerror = () => {
      if (token === readToken) {
        options.onReject({ reason: 'read-error', fileName: file.name });
      }
    };
    reader.readAsText(file);
  };

  const showTarget = (event: DragEvent): void => {
    event.preventDefault();
    zone.classList.add('is-drop-target');
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  zone.addEventListener('dragenter', showTarget, { passive: false });
  zone.addEventListener('dragover', showTarget, { passive: false });

  zone.addEventListener('dragleave', (event) => {
    const next = event.relatedTarget;
    // Moving between the field's own children is not leaving the zone.
    if (next instanceof Node && zone.contains(next)) {
      return;
    }
    zone.classList.remove('is-drop-target');
  });

  zone.addEventListener(
    'drop',
    (event: DragEvent) => {
      // Cleared here as well as on dragleave: a drop does not fire dragleave,
      // and a non-file drop (e.g. dragged page text) must not leave the ring on.
      zone.classList.remove('is-drop-target');
      const transfer = event.dataTransfer;
      if (transfer === null || transfer.files.length === 0) {
        // Not a file drag: leave the browser's own text-drop behaviour alone.
        return;
      }
      event.preventDefault();
      clearStatus();

      const first = transfer.files[0];
      if (first === undefined) {
        return;
      }
      if (transfer.files.length > 1) {
        options.onReject({ reason: 'multiple', fileName: first.name });
        return;
      }
      if (!isTextFile(first)) {
        options.onReject({ reason: 'unsupported', fileName: first.name });
        return;
      }
      if (first.size > options.maxSizeBytes) {
        options.onReject({ reason: 'too-large', fileName: first.name });
        return;
      }
      readFile(first);
    },
    { passive: false },
  );

  return { zone, status, clearStatus };
}
