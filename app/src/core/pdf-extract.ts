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
 * That gap heuristic is lossy on real paper layouts, where the gap depends on
 * the *content* width and therefore oscillates between one and two spaces.
 * `tabulateLayout` therefore rebuilds the table from the boxes (x/y bands) and
 * emits the same ` | ` cell separator deterministically; `extractPdfText` ships
 * both renderings (`text` and `tabulatedText`) and the Phase 3 pipeline prefers
 * the tabulated one when it exists.
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
 * ## Link annotations (phase 4)
 *
 * `extractPdfText` also harvests Link annotations (`page.getAnnotations()`),
 * keeping only URIs that carry a Swissmedic `/product/<id>/MPub` id. Each record
 * is `{ page, rect, productId }`, with the rect in the same page space as the
 * text items (no viewport scaling on either side). The data is optional: absent
 * for OCR-only documents and for PDFs without product links, and a page whose
 * annotations cannot be read still contributes its text.
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
 *
 * The optional annotation and row-geometry arrays are bounded the same way:
 * `MAX_PAGE_ANNOTATIONS` / `MAX_TOTAL_ANNOTATIONS` cap annotations per page and
 * per document, and `MAX_TOTAL_MEDICATION_ROWS` caps the row geometry. Excess
 * entries are dropped (the per-page collector already truncates), which is
 * fail-closed: an annotation can only *upgrade* a row to `IdType 4`, so losing
 * one leaves the printed-text identity, never a wrong binding. A truncated row
 * geometry makes the parser's row/medicament count guard fire, which drops all
 * `IdType 4` bindings and surfaces a warning (see
 * `prescription-parse.ts`'s `PdfAnnotationContext` contract).
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { columnKeyFor } from './prescription-parse';
import type { ColumnKey, PdfLinkAnnotation, PdfRowGeometry } from './prescription-parse';

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
 * Geometry-aware table reconstruction (fix round 2)
 *
 * Real eMediplan paper layouts (the German HCI sample) have no `|`/tab and no
 * stable run of 2+ spaces: the gap between two neighbouring cells is a function
 * of the *content* width, so it alternates between one and two spaces. The
 * geometry, however, is unambiguous, so `tabulateLayout` rebuilds the table
 * from the item boxes and emits exactly the separator contract the strict
 * parser of `prescription-parse.ts` understands: one line per printed row, cells
 * joined by ` | ` in header order.
 *
 * ## Band tolerances (measured, not guessed)
 *
 * Measured on `20261027_eMediplan_Beispiel_de.pdf` (A4 landscape, 10 pt text,
 * y upwards):
 * - the largest baseline step *inside* one printed row is 9.6 pt — the PANADOL
 *   row prints its title (y=224.3), the `(#)` placeholder (214.7), the substance
 *   (206.3) and the wrapped instruction (205.7); the VALIUM row wraps in 4.8 pt
 *   steps (title 392.4, `i.m./i.v.` 382.8, `Diazepam` 374.4) and the wrapped
 *   header title `zur` (425.4) sits 4.8 pt above `Nacht` (415.8);
 * - the smallest gap *between* two printed rows is 22.2 pt — the lowest line of
 *   the SORTIS row (y=341.4) to the CO-DIOVAN title (y=319.2); the VALIUM row
 *   to SORTIS is 23.4 pt, the reserve header to PANADOL 22.8 pt.
 *
 * `ROW_TOLERANCE` 14 pt therefore sits 4.4 pt above the largest intra-row step
 * and 8.2 pt below the smallest inter-row gap: one medication row never glues to
 * the next, and a four-to-five-line medication cell stays one row.
 * `HEADER_MERGE_GAP` 18 pt is the corresponding bound for a header that a PDF
 * breaks into separate bands: it still stays below the 22.2 pt inter-row gap and
 * only ever merges bands that consist of title vocabulary or bare wrap
 * fragments, so the first body row can never be absorbed.
 *
 * Rows *above* the first table (patient/provider block) are emitted per printed
 * baseline (`PLAIN_LINE_TOLERANCE`) instead of per band: the parser reads them
 * as `Label: value` lines, so two neighbouring labels must not be glued by a
 * wide tolerance.
 *
 * ## Per-table columns
 *
 * Column bands are re-derived from every header row, never from a document-wide
 * template: the sample drifts by 4-30 pt between table 1 and the
 * `Reservemedikation` table (`Einheit` 347.9 -> 365.3, `Von` 421.1 -> 404.3,
 * `Grund` 660.1 -> 690.7). A band spans the midpoint to its neighbour titles,
 * so a centre-aligned dose cell (offset +10.5 to +13.2 pt from the title's left
 * edge) lands in the right band by geometry, not by equality.
 *
 * Header fragments that carry no title of their own (`zur`, `durch`) are
 * consumed: `zur` wraps `zur Nacht`, so `Nacht` stays the night column and the
 * fragment is dropped.
 *
 * Pure: no DOM, no pdfjs import, no I/O.
 * ------------------------------------------------------------------------- */

/** One text item with its resolved device-space origin. */
interface LayoutGlyph {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Row-clustering tolerance in points (justified above: largest intra-row step
 * 9.6 pt, smallest inter-row gap 22.2 pt).
 */
const ROW_TOLERANCE = 14;

/**
 * Baseline tolerance of a plain (non-table) line. The patient/provider block is
 * read as `Label: value`, so neighbouring printed lines stay separate; items of
 * one printed line share a baseline (measured jitter <= 1.2 pt).
 */
const PLAIN_LINE_TOLERANCE = 2;

/**
 * Max distance at which a wrapped header band is merged (justified above: above
 * the 14 pt row tolerance, below the 22.2 pt smallest inter-row gap).
 */
const HEADER_MERGE_GAP = 18;

/** Max number of physical bands one header may be printed on. */
const MAX_HEADER_BANDS = 4;

/** Same minimum as `layoutFor` in `prescription-parse.ts`. */
const MIN_HEADER_TITLES = 4;

/** Defensive bounds for hostile geometry (a page may hold 50 000 items). */
const MAX_COLUMNS = 24;
const MAX_ROWS = 5_000;

/** Cell separator written into the tabulated text (the strict parser contract). */
const TABULATED_CELL_SEPARATOR = ' | ';

/** Bare wrap fragments of a printed title: they carry no column of their own. */
const WRAP_FRAGMENT_PATTERN = /^(?:zur|durch|by|and|u\.|mit|to|up)$/i;

/** Footer, comment section and generator line end the medication rows. */
const TABULATION_STOP_PATTERN =
  /(?:\b(?:seite|page)\s+\d{1,3}\s+(?:von|of)\s+\d{1,3}\b|eMediplan\s+by\b)/i;
const COMMENT_HEADER_PATTERN = /^(?:comment|comments|bemerkung|kommentar|remark|remarks|footer)\b/i;

/** Printed title of a following table: a marker, not a medication row. */
const TABLE_TITLE_MARKER_PATTERN = /^(?:reservemedikation|reserve\s+medication)$/i;

export interface TabulateOptions {
  /** Overrides the documented row tolerance (points). */
  readonly rowTolerance?: number;
  readonly maxColumns?: number;
  readonly maxRows?: number;
}

export type TabulateErrorCode =
  | 'no-geometry'
  | 'no-medication-header'
  | 'layout-too-complex'
  | 'text-too-long';

export interface TabulateError {
  readonly code: TabulateErrorCode;
  readonly message: string;
}

/**
 * Reconstructed page layout.
 *
 * - `text` is one line per printed row; medication rows and header rows are
 *   `| `-separated in header order, every other line is plain reading-order
 *   text (patient/provider blocks, issue date, ...).
 * - `medicationTableCount` is the number of header rows consumed (the sample
 *   prints two: the main table and `Reservemedikation`).
 * - `medicationRowCount` counts the emitted medication rows (all tables).
 * - `columnCount` is the width of the last table's column set.
 */
export type TabulateResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly medicationTableCount: number;
      readonly medicationRowCount: number;
      readonly columnCount: number;
      /**
       * Geometry of every emitted medication row band, in document order (the
       * same order as `medicationRowCount`). It is the bridge between the text
       * the parser reads and the page-space rectangles of the link annotations.
       *
       * One entry per row band, not per parsed medicament: the parser verifies
       * its medicament count against this array and drops all `IdType 4`
       * bindings when they disagree (see `prescription-parse.ts`'s
       * `PdfAnnotationContext`).
       */
      readonly medicationRows: readonly TabulatedRowGeometry[];
    }
  | { readonly ok: false; readonly errors: readonly TabulateError[] };

/** Band of one tabulated medication row, in page space (points). */
export interface TabulatedRowGeometry {
  readonly top: number;
  readonly bottom: number;
  /** First-column (Medication) band: left edge of the printed name. */
  readonly medicationLeft: number;
  /** Right edge of the first column: midpoint to the next title. */
  readonly medicationRight: number;
}

/** Column band of one table, derived from the printed header titles. */
interface ColumnBand {
  readonly title: string;
  /** Inclusive left edge: midpoint to the previous title (else -infinity). */
  readonly left: number;
}

/** Header band: the columns plus the title cell of each column. */
interface HeaderBand {
  readonly columns: readonly ColumnBand[];
  readonly endIndex: number;
}

function tabulateFailure(code: TabulateErrorCode, message: string): TabulateResult {
  return { ok: false, errors: [{ code, message }] };
}

/** Text items with a usable box, in a private shape the algorithm can sort. */
function toGlyphs(items: readonly PdfTextItemLike[]): LayoutGlyph[] {
  const glyphs: LayoutGlyph[] = [];
  for (const item of items) {
    if (glyphs.length >= MAX_PAGE_TEXT_ITEMS) {
      break;
    }
    const text = typeof item.str === 'string' ? item.str.replace(/\s+/gu, ' ').trim() : '';
    if (text === '') {
      continue;
    }
    const box = readBox(item);
    if (box === null) {
      continue;
    }
    glyphs.push({ text, x: box.x, y: box.y });
  }
  return glyphs;
}

/** Reading order: top to bottom, then left to right (y grows upwards). */
function compareGlyphs(left: LayoutGlyph, right: LayoutGlyph): number {
  return right.y - left.y || left.x - right.x;
}

/**
 * Clusters the page into printed rows.
 *
 * Bands are chained: an item joins the current row when its baseline is at most
 * `tolerance` below the previous item's, so a title/dose/wrap sequence stays one
 * row while a real row change (>= 22.2 pt in the sample) starts a new band.
 */
function clusterRows(glyphs: readonly LayoutGlyph[], tolerance: number): LayoutGlyph[][] {
  const sorted = [...glyphs].sort(compareGlyphs);
  const rows: LayoutGlyph[][] = [];
  let current: LayoutGlyph[] = [];
  let previousY = Number.NaN;
  for (const glyph of sorted) {
    if (current.length > 0 && previousY - glyph.y > tolerance) {
      rows.push(current);
      current = [];
    }
    current.push(glyph);
    previousY = glyph.y;
  }
  if (current.length > 0) {
    rows.push(current);
  }
  return rows;
}

/**
 * Columns of one header band, or `undefined` when the band is not a header.
 *
 * A band is a header when its items name the `Medication` column and at least
 * three further titles — the same rule as `layoutFor`. Titles are deduplicated
 * by key; wrap fragments (`zur`, `durch`) match no key and are consumed.
 */
function deriveColumns(
  glyphs: readonly LayoutGlyph[],
  maxColumns: number,
): ColumnBand[] | undefined {
  const ordered = [...glyphs].sort(compareGlyphs);
  const seen = new Set<ColumnKey>();
  const titles: { key: ColumnKey; title: string; x: number }[] = [];
  for (const glyph of ordered) {
    const key = columnKeyFor(glyph.text);
    if (key === undefined || seen.has(key)) {
      continue;
    }
    seen.add(key);
    titles.push({ key, title: glyph.text, x: glyph.x });
  }
  if (!seen.has('medication') || titles.length < MIN_HEADER_TITLES || titles.length > maxColumns) {
    return undefined;
  }
  titles.sort((left, right) => left.x - right.x);
  return titles.map((title, index) => {
    const previous = titles[index - 1];
    return {
      title: title.title,
      left: previous === undefined ? Number.NEGATIVE_INFINITY : (previous.x + title.x) / 2,
    };
  });
}

/** True when every token of the band is a title or a bare wrap fragment. */
function isHeaderFragmentRow(glyphs: readonly LayoutGlyph[]): boolean {
  for (const glyph of glyphs) {
    if (columnKeyFor(glyph.text) !== undefined) {
      continue;
    }
    for (const token of glyph.text.split(' ')) {
      if (token !== '' && !WRAP_FRAGMENT_PATTERN.test(token)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Reads the header starting at `start`, merging wrapped continuation bands.
 *
 * A following band joins the header when it is within `HEADER_MERGE_GAP` and is
 * either another title band or a bare-fragment band; the columns are re-derived
 * from the union so a title split across bands keeps its own column.
 */
function readHeaderBand(
  rows: readonly (readonly LayoutGlyph[])[],
  start: number,
  maxColumns: number,
): HeaderBand | undefined {
  const first = rows[start];
  if (first === undefined) {
    return undefined;
  }
  let columns = deriveColumns(first, maxColumns);
  if (columns === undefined) {
    return undefined;
  }
  let glyphs: LayoutGlyph[] = [...first];
  let endIndex = start;
  while (endIndex + 1 < rows.length && endIndex + 1 - start < MAX_HEADER_BANDS) {
    const previous = rows[endIndex];
    const next = rows[endIndex + 1];
    if (previous === undefined || next === undefined) {
      break;
    }
    const gap = lowestY(previous) - highestY(next);
    if (gap > HEADER_MERGE_GAP || gap < 0) {
      break;
    }
    const nextColumns = deriveColumns(next, maxColumns);
    if (nextColumns === undefined && !isHeaderFragmentRow(next)) {
      break;
    }
    glyphs = [...glyphs, ...next];
    endIndex += 1;
    const merged = deriveColumns(glyphs, maxColumns);
    if (merged !== undefined) {
      columns = merged;
    }
  }
  return { columns, endIndex };
}

function lowestY(glyphs: readonly LayoutGlyph[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const glyph of glyphs) {
    minimum = Math.min(minimum, glyph.y);
  }
  return minimum;
}

function highestY(glyphs: readonly LayoutGlyph[]): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const glyph of glyphs) {
    maximum = Math.max(maximum, glyph.y);
  }
  return maximum;
}

/** Index of the column whose band contains `x` (bands are contiguous). */
function columnIndexFor(columns: readonly ColumnBand[], x: number): number {
  let index = 0;
  for (let cursor = 0; cursor < columns.length; cursor += 1) {
    const band = columns[cursor];
    if (band === undefined || x < band.left) {
      break;
    }
    index = cursor;
  }
  return index;
}

/**
 * One row → one cell string per column, in header order.
 *
 * Several items of the same band and column (a wrapped brand name, the
 * substance line, a `(#)` placeholder, a wrapped instruction) are joined with a
 * single space, which is how the strict parser reads a multi-line cell.
 */
function cellsForRow(row: readonly LayoutGlyph[], columns: readonly ColumnBand[]): string[] {
  const cells = columns.map(() => '');
  for (const glyph of [...row].sort(compareGlyphs)) {
    const index = columnIndexFor(columns, glyph.x);
    const previous = cells[index] ?? '';
    cells[index] = previous === '' ? glyph.text : `${previous} ${glyph.text}`;
  }
  return cells;
}

/**
 * Horizontal band of the first (Medication) column.
 *
 * `columns[0].left` is `-Infinity` by construction, so the left edge is taken
 * from the row's own glyphs; the right edge is the midpoint to the next column
 * title. A row with no glyph in the first column yields an empty band
 * (`+Infinity` left), which can never match an annotation.
 */
function medicationBand(
  row: readonly LayoutGlyph[],
  columns: readonly ColumnBand[],
): { left: number; right: number } {
  const right = columns[1]?.left ?? Number.POSITIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  for (const glyph of row) {
    if (columnIndexFor(columns, glyph.x) === 0) {
      left = Math.min(left, glyph.x);
    }
  }
  return { left, right };
}

/** One non-table band as plain reading-order text. */
function plainRowText(row: readonly LayoutGlyph[]): string {
  return [...row]
    .sort(compareGlyphs)
    .map((glyph) => glyph.text)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A non-table band split per printed baseline.
 *
 * The wide row tolerance is needed to keep a wrapped medication cell together,
 * but the patient/provider block is `Label: value` text: two neighbouring labels
 * must stay two lines, so the band is re-clustered with the narrow plain-line
 * tolerance.
 */
function plainRowLines(row: readonly LayoutGlyph[]): string[] {
  const lines: string[] = [];
  for (const subLine of clusterRows(row, PLAIN_LINE_TOLERANCE)) {
    const text = plainRowText(subLine);
    if (text !== '') {
      lines.push(text);
    }
  }
  return lines;
}

/** True for a band that ends the medication rows (footer / comment section). */
function isStopRow(text: string): boolean {
  return COMMENT_HEADER_PATTERN.test(text) || TABULATION_STOP_PATTERN.test(text);
}

/**
 * Reconstructs the printed paper layout from text-item geometry.
 *
 * Returns `{ ok: false, errors }` when the page has no usable geometry or no
 * medication header; the caller then keeps the flat `text` of
 * `normalizeTextItems`, so nothing is lost and no guess is made. Never throws.
 */
export function tabulateLayout(
  items: readonly PdfTextItemLike[],
  options: TabulateOptions = {},
): TabulateResult {
  const rowTolerance = options.rowTolerance ?? ROW_TOLERANCE;
  const maxColumns = options.maxColumns ?? MAX_COLUMNS;
  const maxRows = options.maxRows ?? MAX_ROWS;

  const glyphs = toGlyphs(items);
  if (glyphs.length === 0) {
    return tabulateFailure(
      'no-geometry',
      'The page has no positioned text items; the table layout cannot be reconstructed.',
    );
  }

  const rows = clusterRows(glyphs, rowTolerance);
  if (rows.length > maxRows) {
    return tabulateFailure(
      'layout-too-complex',
      'The page has too many text rows to reconstruct a medication table.',
    );
  }

  const lines: string[] = [];
  const medicationRows: TabulatedRowGeometry[] = [];
  let columns: readonly ColumnBand[] | undefined;
  let medicationTableCount = 0;
  let medicationRowCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined) {
      continue;
    }
    const plain = plainRowText(row);
    if (plain === '') {
      continue;
    }
    if (isStopRow(plain)) {
      break;
    }

    const header = readHeaderBand(rows, index, maxColumns);
    if (header !== undefined) {
      columns = header.columns;
      medicationTableCount += 1;
      lines.push(header.columns.map((column) => column.title).join(TABULATED_CELL_SEPARATOR));
      index = header.endIndex;
      continue;
    }

    if (columns === undefined) {
      // Everything above the first table (patient and provider blocks, issue
      // date, document title) stays plain: the parser reads it as header text.
      for (const text of plainRowLines(row)) {
        lines.push(text);
      }
      continue;
    }

    if (TABLE_TITLE_MARKER_PATTERN.test(plain)) {
      // `Reservemedikation`: the title of the following table, not a row.
      continue;
    }

    const band = medicationBand(row, columns);
    medicationRows.push({
      top: highestY(row),
      bottom: lowestY(row),
      medicationLeft: band.left,
      medicationRight: band.right,
    });
    lines.push(cellsForRow(row, columns).join(TABULATED_CELL_SEPARATOR));
    medicationRowCount += 1;
  }

  if (medicationTableCount === 0 || columns === undefined) {
    return tabulateFailure(
      'no-medication-header',
      'No printed medication column header ("Medication", "Morning", ...) was found in the page geometry.',
    );
  }

  const text = lines.join('\n');
  if (text.length > MAX_TOTAL_TEXT_LENGTH) {
    return tabulateFailure('text-too-long', 'The reconstructed table exceeds the text bound.');
  }

  return {
    ok: true,
    text,
    medicationTableCount,
    medicationRowCount,
    columnCount: columns.length,
    medicationRows,
  };
}

/* ------------------------------------------------------------------------- *
 * Link annotations (phase 4)
 *
 * The reference PDF carries Swissmedic product ids only in the Link annotations
 * of the medication names. `collectLinkAnnotations` is the pure part of the
 * adapter: it reduces the untrusted annotation objects (as returned by
 * `page.getAnnotations()`) to `{ page, rect, productId }` records. The rect is
 * read in the same page space as `readBox` reads text items (PDF user space,
 * `y` upwards), so no viewport scaling is applied to either side and the two
 * line up. URIs are parsed, never fetched or executed.
 * ------------------------------------------------------------------------- */

/** Upper bound on annotations read from one page (hostile PDFs). */
export const MAX_PAGE_ANNOTATIONS = 10_000;

/**
 * Upper bound on annotations kept for the whole document (hostile PDFs).
 *
 * The per-page cap alone is unbounded across `MAX_PDF_PAGES` pages; this
 * aggregate limit mirrors `MAX_TOTAL_TEXT_LENGTH` in scope, not in unit. The
 * excess is dropped, which can only keep a row's printed-text identity.
 */
export const MAX_TOTAL_ANNOTATIONS = 50_000;

/**
 * Upper bound on tabulated medication-row geometry for the whole document.
 *
 * `tabulateLayout` already bounds rows per page (`MAX_ROWS`); this aggregate
 * bound stops a many-page PDF from growing the geometry array without limit.
 * A truncated geometry is detected by the parser (row count != medicament
 * count), which then drops every `IdType 4` binding (see
 * `prescription-parse.ts`'s `PdfAnnotationContext` contract).
 */
export const MAX_TOTAL_MEDICATION_ROWS = 50_000;

/**
 * Swissmedic product link: `…/product/<digits>/MPub` (case-insensitive). The
 * `MPub` tail is required, and a query/fragment or the path end terminates it.
 * Only the canonical digits are kept.
 */
const PRODUCT_URI_PATTERN = /\/product\/(\d{1,32})\/MPub(?:[/?#]|$)/i;

/** A scheme, when present, must be a safe web scheme (see `productIdFromUri`). */
const URI_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

/** Real product ids are at most 12 digits; canonicalization must not exceed it. */
const MAX_PRODUCT_ID_DIGITS = 12;

/**
 * `/product/58356/MPub` → `58356`. Any other URI → `undefined` (ignored
 * silently: it is not a product link).
 *
 * Fail-closed rules for untrusted URIs:
 * - the trailing `/MPub` segment is required, so `/product/123/../admin` and
 *   any other path cannot masquerade as a product link;
 * - path traversal (`..`) anywhere in the URI is refused outright;
 * - a scheme, when present, must be `http:`/`https:` (relative product paths
 *   such as `/product/23846/MPub` stay valid);
 * - leading zeros are stripped to the canonical id and an all-zero/empty id is
 *   refused (`/product/000/MPub` → `undefined`).
 *
 * Pure and bounded; the URI is untrusted input and is never resolved.
 */
export function productIdFromUri(uri: string): string | undefined {
  const value = uri.trim();
  if (value.includes('..')) {
    return undefined;
  }
  const scheme = URI_SCHEME_PATTERN.exec(value)?.[1]?.toLowerCase();
  if (scheme !== undefined && scheme !== 'http' && scheme !== 'https') {
    return undefined;
  }
  const match = PRODUCT_URI_PATTERN.exec(value);
  const raw = match?.[1];
  if (raw === undefined) {
    return undefined;
  }
  const canonical = raw.replace(/^0+/, '');
  if (canonical === '' || canonical.length > MAX_PRODUCT_ID_DIGITS) {
    return undefined;
  }
  return canonical;
}

/** True for a Link annotation subtype (pdfjs spells it `subtype`). */
function isLinkAnnotation(annotation: object): boolean {
  if ('subtype' in annotation && typeof annotation.subtype === 'string') {
    return annotation.subtype.toLowerCase() === 'link';
  }
  if ('subType' in annotation && typeof annotation.subType === 'string') {
    return annotation.subType.toLowerCase() === 'link';
  }
  return false;
}

/** URI of a link annotation; pdfjs versions expose `url` or `uri`. */
function linkUri(annotation: object): string | undefined {
  if ('url' in annotation && typeof annotation.url === 'string') {
    return annotation.url;
  }
  if ('uri' in annotation && typeof annotation.uri === 'string') {
    return annotation.uri;
  }
  return undefined;
}

/**
 * Annotation rect normalized to `[minX, minY, maxX, maxY]`, or `undefined` when
 * the payload is missing, malformed or non-finite.
 */
function normalizedAnnotationRect(
  annotation: object,
): readonly [number, number, number, number] | undefined {
  if (!('rect' in annotation) || !Array.isArray(annotation.rect)) {
    return undefined;
  }
  const values: readonly unknown[] = annotation.rect;
  const [x1, y1, x2, y2] = values;
  if (
    typeof x1 !== 'number' ||
    typeof y1 !== 'number' ||
    typeof x2 !== 'number' ||
    typeof y2 !== 'number'
  ) {
    return undefined;
  }
  if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
    return undefined;
  }
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/**
 * Link annotations of one page, reduced to the product ids the parser maps.
 *
 * Non-Link annotations, malformed rects and non-product URIs are dropped; the
 * result is bounded by {@link MAX_PAGE_ANNOTATIONS} and, when the caller passes
 * a smaller `limit`, by that remaining document-wide budget. Never throws for
 * garbage input: an unknown annotation shape is simply skipped.
 */
export function collectLinkAnnotations(
  pageAnnotations: readonly unknown[],
  page: number,
  limit: number = MAX_PAGE_ANNOTATIONS,
): PdfLinkAnnotation[] {
  const bound = Number.isFinite(limit)
    ? Math.min(Math.max(0, Math.floor(limit)), MAX_PAGE_ANNOTATIONS)
    : MAX_PAGE_ANNOTATIONS;
  const collected: PdfLinkAnnotation[] = [];
  for (const annotation of pageAnnotations) {
    if (collected.length >= bound) {
      break;
    }
    if (typeof annotation !== 'object' || annotation === null) {
      continue;
    }
    if (!isLinkAnnotation(annotation)) {
      continue;
    }
    const uri = linkUri(annotation);
    if (uri === undefined) {
      continue;
    }
    const productId = productIdFromUri(uri);
    if (productId === undefined) {
      continue;
    }
    const rect = normalizedAnnotationRect(annotation);
    if (rect === undefined) {
      continue;
    }
    collected.push({ page, rect, productId });
  }
  return collected;
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

/**
 * Stable sub-code of a `pdf-corrupt` failure, one per distinct bound/message.
 *
 * `pdf-corrupt` covers five different situations (a damaged document, the
 * document-wide page cap, the per-page item cap, the total text cap, and a
 * throw the pipeline maps itself), and the advice differs, so the UI resolves
 * this detail — not the English prose — to its localized message.
 */
export type PdfExtractErrorMessageDetail =
  | 'unreadable'
  | 'page-limit'
  | 'item-limit'
  | 'text-limit'
  | 'unexpected';

export interface PdfExtractError {
  readonly code: PdfExtractErrorCode;
  /** English fallback wording; the UI resolves `code`/`detail` to its locale. */
  readonly message: string;
  /** Narrows `pdf-corrupt` to one stable message (see above). */
  readonly detail?: PdfExtractErrorMessageDetail;
}

export interface PdfExtractedText {
  /** Pages joined with `PDF_PAGE_SEPARATOR`, lines in content order. */
  readonly text: string;
  /**
   * Geometry-tabulated pages joined with `PDF_PAGE_SEPARATOR` (see
   * `tabulateLayout`), or `undefined` when no page could be tabulated.
   *
   * Always present on the adapter result (an empty string when the geometry
   * yielded no medication table — the pipeline then keeps `text`); optional in
   * the type so a caller that only provides a flat text layer stays valid.
   */
  readonly tabulatedText?: string;
  /**
   * Link annotations that carry a Swissmedic product id, in page order.
   *
   * Additive and absent when the document has none (OCR-only or plain text
   * PDFs), so the older OCR-only result shape stays valid. Annotations exist
   * only where a text layer exists; the OCR fallback has none by construction.
   */
  readonly annotations?: readonly PdfLinkAnnotation[];
  /**
   * Geometry of the medication rows of `tabulatedText`, in document order.
   *
   * Invariant: one entry per tabulated row band, not per medicament. The strict
   * parser produces one medicament per printed row; a band it cannot turn into
   * a medicament would desynchronise every later index, so the parser verifies
   * the counts and drops all `IdType 4` bindings when they differ (see
   * `prescription-parse.ts`'s `PdfAnnotationContext`).
   *
   * Present together with `annotations`; it is what lets the parser bind an
   * annotation to its row. Absent when no medication table was tabulated.
   */
  readonly medicationRows?: readonly PdfRowGeometry[];
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

function fail(
  code: PdfExtractErrorCode,
  message: string,
  detail?: PdfExtractErrorMessageDetail,
): PdfExtractResult {
  return { ok: false, error: { code, message, ...(detail === undefined ? {} : { detail }) } };
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
  return { code: 'pdf-corrupt', message: CORRUPT_MESSAGE, detail: 'unreadable' };
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
 * Best-effort link annotations of one page.
 *
 * Annotations are optional data: a page whose annotation dictionary cannot be
 * read still contributes its text layer (the row keeps the printed-text id), so
 * the failure is swallowed rather than turned into `pdf-corrupt`.
 */
async function readPageAnnotations(page: PDFPageProxy): Promise<readonly unknown[]> {
  try {
    return await page.getAnnotations();
  } catch {
    return [];
  }
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
      return fail('pdf-corrupt', TOO_MANY_PAGES_MESSAGE, 'page-limit');
    }

    const pages: string[] = [];
    const tabulatedPages: string[] = [];
    const annotations: PdfLinkAnnotation[] = [];
    const medicationRows: PdfRowGeometry[] = [];
    let totalLength = 0;
    let totalAnnotations = 0;
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        if (content.items.length > MAX_PAGE_TEXT_ITEMS) {
          return fail('pdf-corrupt', TOO_MANY_ITEMS_MESSAGE, 'item-limit');
        }
        const annotationBudget = MAX_TOTAL_ANNOTATIONS - totalAnnotations;
        if (annotationBudget > 0) {
          const pageAnnotations = collectLinkAnnotations(
            await readPageAnnotations(page),
            pageNumber,
            annotationBudget,
          );
          annotations.push(...pageAnnotations);
          totalAnnotations += pageAnnotations.length;
        }
        const pageText = normalizeTextItems(content.items);
        // Pure, local: a page whose geometry yields no table contributes an
        // empty tabulated page, so the pipeline keeps the flat text.
        const tabulated = tabulateLayout(content.items);
        const pageTabulated = tabulated.ok ? tabulated.text : '';
        if (tabulated.ok) {
          for (const row of tabulated.medicationRows) {
            if (medicationRows.length >= MAX_TOTAL_MEDICATION_ROWS) {
              // Truncation is fail-closed: the parser's row/medicament count
              // guard drops all IdType-4 bindings instead of shifting them.
              break;
            }
            medicationRows.push({ page: pageNumber, ...row });
          }
        }
        totalLength += pageText.length + pageTabulated.length + PDF_PAGE_SEPARATOR.length;
        if (totalLength > MAX_TOTAL_TEXT_LENGTH) {
          return fail('pdf-corrupt', TOO_MUCH_TEXT_MESSAGE, 'text-limit');
        }
        pages.push(pageText);
        tabulatedPages.push(pageTabulated);
      } finally {
        page.cleanup();
      }
    }

    const text = pages.join(PDF_PAGE_SEPARATOR);
    return {
      ok: true,
      value: {
        text,
        tabulatedText: tabulatedPages.join(PDF_PAGE_SEPARATOR),
        ...(annotations.length > 0 ? { annotations } : {}),
        ...(medicationRows.length > 0 ? { medicationRows } : {}),
        pageCount: pdfDocument.numPages,
        hasTextLayer: hasTextLayer(text),
      },
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
