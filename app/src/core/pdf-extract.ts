/**
 * PDF → normalized text.
 *
 * The decision logic is pure: `normalizeTextItems` turns the `TextItem` /
 * `TextMarkedContent` union that pdfjs yields into line-oriented text, and
 * `hasTextLayer` answers the "is this a scanned page?" question. Both are
 * testable without a DOM, a worker or a real PDF — the same pure/adapter split
 * used by `qr-scan.ts:1-13`.
 *
 * The pdfjs adapter at the bottom of the file is loaded lazily (`await
 * import('pdfjs-dist')`), so importing this module never touches the pdfjs
 * bundle, a worker or the network. Tests import only the pure exports.
 *
 * ## Input contract
 *
 * The text is a line-oriented rendering of the page. `normalizeTextItems`
 * restores two things the raw item stream does not express directly:
 *
 * - **line breaks** — from `TextItem.hasEOL`, or from a baseline change the
 *   item geometry still records;
 * - **column gaps** — a horizontal gap wider than two line heights becomes two
 *   spaces, which is exactly the cell separator `prescription-parse.ts`
 *   understands (`prescription-parse.ts:343-349`). Narrower gaps become a
 *   single space. Whitespace *inside* an item is collapsed, never invented.
 *
 * Pages are joined with `PDF_PAGE_SEPARATOR` (a form feed), which
 * `prescription-parse.ts:329-337` already treats as a page boundary.
 *
 * ## Untrusted input
 *
 * PDF bytes are attacker-controlled. `hasPdfMagic` rejects anything that is not
 * a PDF up front, the page count is bounded, and every throw is mapped to a
 * stable `PdfExtractErrorCode` — the adapter never throws to its caller. The
 * installed pdfjs-dist build contains no `eval`/`new Function` path at all
 * (`isEvalSupported` was removed in v6), so font programs cannot execute.
 *
 * ## Text bounds (fail closed with `pdf-corrupt`)
 *
 * Extracted text is accumulated in memory, so a hostile PDF must not be able to
 * grow it without limit:
 *
 * - a page whose `TextContent.items` array exceeds `MAX_PAGE_TEXT_ITEMS`
 *   entries is refused before normalization ("The PDF page has too many text
 *   items to read.");
 * - the concatenated text is refused once it exceeds
 *   `MAX_TOTAL_TEXT_LENGTH` characters ("The PDF contains too much text to
 *   read.").
 *
 * Both bounds report the existing typed code `pdf-corrupt`, so the Phase 3
 * pipeline maps them without a new error path. They are defence in depth: the
 * UI also refuses files larger than `MAX_PDF_BYTES` before reading them.
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Structural view of one entry of `TextContent.items`.
 *
 * `TextItem` carries `str`; `TextMarkedContent` only carries a `type` tag. Both
 * are optional here so the union from pdfjs is assignable without a cast, and
 * so hostile/garbage entries can be probed safely.
 */
export interface PdfTextItemLike {
  /** Text of the item. Absent on `TextMarkedContent` entries. */
  readonly str?: string;
  /** True when pdfjs reports a line break after this item. */
  readonly hasEOL?: boolean;
  /** `[a, b, c, d, x, y]` text matrix; `transform[4]`/`[5]` are the baseline origin. */
  readonly transform?: readonly number[];
  /** Advance width of the item in device space. */
  readonly width?: number;
  /** Font height in device space. */
  readonly height?: number;
  /** Marked-content tag, present on `TextMarkedContent` entries only. */
  readonly type?: string;
}

/** Baseline origin and advance box of one text item, in device space. */
interface TextBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Two items belong to the same line when their baselines differ by <= half a line. */
const SAME_LINE_FACTOR = 0.5;
/** A gap wider than this many line heights separates two table columns. */
const COLUMN_GAP_FACTOR = 2;
/** A gap wider than this many line heights separates two words. */
const WORD_GAP_FACTOR = 0.2;
/** Cell separator of the printed paper layout (`prescription-parse.ts:343-349`). */
const COLUMN_SEPARATOR = '  ';

function readBox(item: PdfTextItemLike): TextBox | null {
  const transform = item.transform;
  const x = transform === undefined ? undefined : transform[4];
  const y = transform === undefined ? undefined : transform[5];
  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const width =
    typeof item.width === 'number' && Number.isFinite(item.width) && item.width > 0 ? item.width : 0;
  const height =
    typeof item.height === 'number' && Number.isFinite(item.height) && item.height > 0
      ? item.height
      : 0;
  return { x, y, width, height };
}

/** True when the two items share a baseline (within rounding tolerance). */
function isSameLine(previous: TextBox, next: TextBox): boolean {
  const height = Math.max(previous.height, next.height);
  if (height <= 0) {
    return previous.y === next.y;
  }
  return Math.abs(previous.y - next.y) <= height * SAME_LINE_FACTOR;
}

/**
 * Separator to insert between two adjacent items on the same line.
 *
 * `previous.width === 0` means the advance width is unknown, so only a single
 * space can be justified. Negative gaps (kerning/overlap) produce no separator.
 */
function joinSeparator(previous: TextBox, next: TextBox): string {
  const height = Math.max(previous.height, next.height);
  if (height <= 0 || previous.width <= 0) {
    return ' ';
  }
  const gap = next.x - (previous.x + previous.width);
  if (gap >= height * COLUMN_GAP_FACTOR) {
    return COLUMN_SEPARATOR;
  }
  if (gap >= height * WORD_GAP_FACTOR) {
    return ' ';
  }
  return '';
}

/**
 * Flattens pdfjs text items into line-oriented text, in content order.
 *
 * - Marked-content entries and non-string `str` values are skipped.
 * - Whitespace inside an item collapses to a single space and is trimmed.
 * - `hasEOL` ends a line; a baseline change between two positioned items ends
 *   it as well (the geometry is the only hint for PDFs whose `hasEOL` is
 *   missing).
 * - Empty lines are dropped, so the result never starts or ends with a newline
 *   and never contains two consecutive newlines.
 *
 * Pure: no DOM, no pdfjs import, no I/O.
 */
export function normalizeTextItems(items: readonly PdfTextItemLike[]): string {
  const lines: string[] = [];
  let line = '';
  let previous: TextBox | null = null;

  const flush = (): void => {
    const trimmed = line.trimEnd();
    if (trimmed !== '') {
      lines.push(trimmed);
    }
    line = '';
    previous = null;
  };

  for (const item of items) {
    const text = typeof item.str === 'string' ? item.str.replace(/\s+/gu, ' ').trim() : '';
    if (text === '') {
      if (item.hasEOL === true) {
        flush();
      }
      continue;
    }

    const box = readBox(item);

    if (line !== '') {
      if (previous === null || box === null) {
        if (!line.endsWith(' ')) {
          line += ' ';
        }
      } else if (isSameLine(previous, box)) {
        line += joinSeparator(previous, box);
      } else {
        flush();
      }
    }

    line += text;
    previous = box;
    if (item.hasEOL === true) {
      flush();
    }
  }

  flush();
  return lines.join('\n');
}

/**
 * True only when the text carries at least one non-whitespace character.
 *
 * This is the text-layer heuristic of plan 002: whitespace-only extraction means
 * the page has no usable text layer and the caller must fall back to OCR.
 */
export function hasTextLayer(text: string): boolean {
  return text.trim() !== '';
}

/* ------------------------------------------------------------------------- *
 * pdfjs adapter — lazy, DOM/worker dependent, never imported by the tests.
 * ------------------------------------------------------------------------- */

/** Every PDF starts with these five bytes (ISO 32000-1 §7.5.2). */
const PDF_MAGIC = '%PDF-';

/** Page break of the concatenated document text (see `prescription-parse.ts:329-337`). */
export const PDF_PAGE_SEPARATOR = '\f';

/** Upper bound on pages per document: a hostile PDF must not stall the tab. */
export const MAX_PDF_PAGES = 200;

/** Upper bound on text items of one page, checked before normalization. */
export const MAX_PAGE_TEXT_ITEMS = 50_000;

/** Upper bound on the accumulated text of the whole document, in characters. */
export const MAX_TOTAL_TEXT_LENGTH = 2 * 1024 * 1024;

/** Stable failure modes; mapped 1:1 by the Phase 3 pipeline. */
export type PdfExtractErrorCode = 'not-pdf' | 'pdf-corrupt' | 'pdf-password';

export interface PdfExtractError {
  readonly code: PdfExtractErrorCode;
  readonly message: string;
}

export interface PdfExtractedText {
  /** Pages joined with `PDF_PAGE_SEPARATOR`, lines in content order. */
  readonly text: string;
  readonly pageCount: number;
  /** False when the document has no non-whitespace text layer (scanned PDF). */
  readonly hasTextLayer: boolean;
}

export type PdfExtractResult =
  | { readonly ok: true; readonly value: PdfExtractedText }
  | { readonly ok: false; readonly error: PdfExtractError };

/** Stable wording of the non-PDF failure; the Phase 3 pipeline reuses it. */
export const NOT_PDF_MESSAGE = 'The selected file is not a PDF document.';
const CORRUPT_MESSAGE =
  'The PDF could not be read. It may be damaged or use an unsupported layout.';
const PASSWORD_MESSAGE = 'The PDF is password protected.';
const TOO_MANY_PAGES_MESSAGE = 'The PDF has more pages than this tool can read.';
const TOO_MANY_ITEMS_MESSAGE = 'The PDF page has too many text items to read.';
const TOO_MUCH_TEXT_MESSAGE = 'The PDF contains too much text to read.';

function fail(code: PdfExtractErrorCode, message: string): PdfExtractResult {
  return { ok: false, error: { code, message } };
}

/** Reads the `name` property of a thrown value without trusting its shape. */
function errorName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return '';
  }
  const name: unknown = error.name;
  return typeof name === 'string' ? name : '';
}

/** Maps any adapter throw to a stable, non-leaky failure mode. */
function classifyPdfError(error: unknown): PdfExtractError {
  const name = errorName(error);
  if (name === 'PasswordException') {
    return { code: 'pdf-password', message: PASSWORD_MESSAGE };
  }
  return { code: 'pdf-corrupt', message: CORRUPT_MESSAGE };
}

/**
 * True when `bytes` starts with the `%PDF-` magic header.
 *
 * Deliberately strict about the offset: a PDF with leading junk is malformed
 * input, not a document this tool has to guess about. Pure and allocation-free.
 */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) {
    return false;
  }
  for (let index = 0; index < PDF_MAGIC.length; index += 1) {
    if (bytes[index] !== PDF_MAGIC.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

/**
 * Extracts the text layer of a PDF with pdfjs-dist.
 *
 * The worker is the app's own bundled `pdfjs-dist` worker (resolved by Vite to a
 * same-origin asset), never a CDN, and the document is parsed without any
 * eval-based font program path (see the module header).
 *
 * The buffer is copied before being handed to pdfjs because pdfjs transfers
 * ownership of the typed array to its worker.
 *
 * Never throws: malformed, password-protected or unparseable input resolves to
 * `{ ok: false, error }`.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtractResult> {
  if (!hasPdfMagic(bytes)) {
    return { ok: false, error: { code: 'not-pdf', message: NOT_PDF_MESSAGE } };
  }

  let loadingTask: PDFDocumentLoadingTask | null = null;

  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      useWorkerFetch: false,
      verbosity: 0,
    });
    const pdfDocument: PDFDocumentProxy = await loadingTask.promise;

    if (pdfDocument.numPages > MAX_PDF_PAGES) {
      return fail('pdf-corrupt', TOO_MANY_PAGES_MESSAGE);
    }

    const pages: string[] = [];
    let totalLength = 0;
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        if (content.items.length > MAX_PAGE_TEXT_ITEMS) {
          return fail('pdf-corrupt', TOO_MANY_ITEMS_MESSAGE);
        }
        const pageText = normalizeTextItems(content.items);
        totalLength += pageText.length + PDF_PAGE_SEPARATOR.length;
        if (totalLength > MAX_TOTAL_TEXT_LENGTH) {
          return fail('pdf-corrupt', TOO_MUCH_TEXT_MESSAGE);
        }
        pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }

    const text = pages.join(PDF_PAGE_SEPARATOR);
    return {
      ok: true,
      value: { text, pageCount: pdfDocument.numPages, hasTextLayer: hasTextLayer(text) },
    };
  } catch (error) {
    return { ok: false, error: classifyPdfError(error) };
  } finally {
    try {
      // Destroying the loading task also tears down the document and its worker.
      if (loadingTask !== null) {
        await loadingTask.destroy();
      }
    } catch {
      // Teardown is best effort: a failure here must not mask the result.
    }
  }
}
