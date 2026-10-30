/** Clipboard and text-download helpers shared by the panels. */

import { text } from '../strings';
import { el } from './dom';

/** Pre-Clipboard-API fallback: a hidden, selected textarea plus `execCommand`. */
export function legacyCopy(value: string): boolean {
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

/**
 * Copies `value`, reporting the outcome in `status`.
 *
 * Order is fixed: `navigator.clipboard.writeText` first, `legacyCopy` only when
 * the API is missing or the write rejects.
 */
export async function copyText(value: string, status: HTMLElement): Promise<void> {
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

/** Downloads `value` as `filename` through a temporary object URL. */
export function downloadText(filename: string, value: string, mimeType: string): void {
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
