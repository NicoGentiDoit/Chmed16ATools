/**
 * PDF page → raster image.
 *
 * `pageRenderScale` is the whole decision: how many device pixels per PDF
 * point to ask for, given a target DPI and a hard pixel budget. It is pure math
 * over two numbers, so it is unit-tested in node without a canvas.
 *
 * The canvas adapter below is what OCR consumes; it is separated by the same
 * banner as `qr-scan.ts:1-13` and is never imported by the tests.
 *
 * Rendering untrusted PDFs is bounded on purpose: the pixel budget keeps a
 * hostile page size from exhausting memory, and every throw becomes a
 * `render-failed` result instead of reaching the caller. A page box that is
 * non-finite or non-positive has no usable geometry at all, so it is refused
 * (`INVALID_PAGE_SCALE`, then `render-failed`) instead of being rendered at a
 * 1:1 scale that could allocate an unbounded canvas.
 */

import type { PDFPageProxy } from 'pdfjs-dist';

/** 200 DPI keeps 10-12 pt print legible to tesseract without huge bitmaps. */
export const DEFAULT_OCR_DPI = 200;

/** Ceiling on rasterized pixels per page (~4 MP ≈ 16 MB of RGBA). */
export const MAX_RENDER_PIXELS = 4_000_000;

/** Ceiling on the DPI-derived scale, so a caller cannot ask for a 2400 DPI page. */
export const MAX_RENDER_SCALE = 4;

/** Largest canvas edge this app will allocate (browser canvases fail past ~16k). */
export const MAX_CANVAS_DIMENSION = 8192;

/**
 * Absolute ceiling on a single canvas, twice the pixel budget: a rounding or
 * viewport surprise still fails closed instead of allocating a huge bitmap.
 */
export const MAX_CANVAS_PIXELS = MAX_RENDER_PIXELS * 2;

/**
 * Sentinel returned for a page whose box is unusable (non-finite or
 * non-positive width/height). Callers must treat it as a failure, never as a
 * scale to render at.
 */
export const INVALID_PAGE_SCALE = 0;

/** PDF user unit: 1 pt = 1/72 inch. */
const POINTS_PER_INCH = 72;

/** Page box at scale 1 (`PageViewport.width`/`height` in CSS px = pt). */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export interface PageRenderScaleOptions {
  /** Target raster resolution; defaults to `DEFAULT_OCR_DPI`. */
  readonly targetDpi?: number;
  /** Pixel budget per page; defaults to `MAX_RENDER_PIXELS`. */
  readonly maxPixels?: number;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Scale factor to pass to `page.getViewport({ scale })` for OCR rasterization.
 *
 * - `targetDpi / 72`, capped at `MAX_RENDER_SCALE`;
 * - then reduced, if needed, so that `width * height * scale²` fits the pixel
 *   budget — a very large page is rendered at a lower resolution rather than
 *   not at all;
 * - a non-finite or non-positive page size (including `Infinity` from a hostile
 *   page box) returns `INVALID_PAGE_SCALE` (`0`). The adapter treats that as
 *   `render-failed`; it must never be replaced by a 1:1 scale, which would ask
 *   the canvas for an unbounded bitmap.
 *
 * Pure: no DOM, no pdfjs, no I/O.
 */
export function pageRenderScale(
  pageSize: PageSize,
  options: PageRenderScaleOptions = {},
): number {
  const { width, height } = pageSize;
  const targetDpi = positiveOr(options.targetDpi, DEFAULT_OCR_DPI);
  const maxPixels = positiveOr(options.maxPixels, MAX_RENDER_PIXELS);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return INVALID_PAGE_SCALE;
  }

  let scale = Math.min(targetDpi / POINTS_PER_INCH, MAX_RENDER_SCALE);
  const pixels = width * height * scale * scale;
  if (pixels > maxPixels) {
    scale = Math.sqrt(maxPixels / (width * height));
  }

  return Number.isFinite(scale) && scale > 0 ? scale : INVALID_PAGE_SCALE;
}

/* ------------------------------------------------------------------------- *
 * Canvas adapter — DOM dependent, never imported by the tests.
 * ------------------------------------------------------------------------- */

export interface RenderPageOptions extends PageRenderScaleOptions {
  /** Canvas background; white is what OCR expects (default `#ffffff`). */
  readonly background?: string;
}

export interface RenderedPage {
  /** RGBA pixels of the rendered page, ready to be fed to `runOcr`. */
  readonly image: ImageData;
  readonly width: number;
  readonly height: number;
  /** Scale that was actually used (already clamped by the pixel budget). */
  readonly scale: number;
}

export type PdfRenderErrorCode = 'render-failed';

export interface PdfRenderError {
  readonly code: PdfRenderErrorCode;
  readonly message: string;
}

export type PdfRenderResult =
  | { readonly ok: true; readonly value: RenderedPage }
  | { readonly ok: false; readonly error: PdfRenderError };

/** Stable wording of the render failure; the Phase 3 pipeline reuses it. */
export const RENDER_FAILED_MESSAGE = 'The PDF page could not be rendered.';
const CANVAS_UNAVAILABLE_MESSAGE = 'This browser cannot provide a canvas to render the page.';

function failRender(message: string): PdfRenderResult {
  return { ok: false, error: { code: 'render-failed', message } };
}

/** A canvas edge must be a finite integer within the allocation ceiling. */
function isUsableDimension(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= MAX_CANVAS_DIMENSION;
}

/**
 * Rasterizes one pdfjs page into an `ImageData` for OCR.
 *
 * pdfjs requires a real `HTMLCanvasElement` (it renders through the 2D context),
 * so there is no `OffscreenCanvas` path here; the canvas is created per call and
 * left to the garbage collector. `willReadFrequently` keeps the single
 * `getImageData` read on the fast path in Chromium.
 *
 * Never throws: a missing DOM, a destroyed page, a hostile page size or a
 * cancelled render all resolve to `{ ok: false, error: { code: 'render-failed' } }`.
 */
export async function renderPageToImageData(
  page: PDFPageProxy,
  options: RenderPageOptions = {},
): Promise<PdfRenderResult> {
  if (typeof document === 'undefined') {
    return failRender(CANVAS_UNAVAILABLE_MESSAGE);
  }

  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = pageRenderScale(
      { width: baseViewport.width, height: baseViewport.height },
      options,
    );
    // `INVALID_PAGE_SCALE` means the page box is unusable: fail closed instead
    // of asking the canvas for a 1:1 bitmap of a hostile page size.
    if (!Number.isFinite(scale) || scale <= 0) {
      return failRender(RENDER_FAILED_MESSAGE);
    }
    const viewport = page.getViewport({ scale });

    // `viewport.width`/`height` are fractional device pixels: round up so no
    // edge of the page is clipped. Non-finite or oversized dimensions would
    // fail inside the canvas allocation, so they are rejected here.
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    if (
      !isUsableDimension(width) ||
      !isUsableDimension(height) ||
      width * height > MAX_CANVAS_PIXELS
    ) {
      return failRender(RENDER_FAILED_MESSAGE);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return failRender(CANVAS_UNAVAILABLE_MESSAGE);
    }

    const task = page.render({
      canvas,
      viewport,
      background: options.background ?? '#ffffff',
    });
    await task.promise;

    return {
      ok: true,
      value: {
        image: context.getImageData(0, 0, width, height),
        width,
        height,
        scale,
      },
    };
  } catch {
    return failRender(RENDER_FAILED_MESSAGE);
  }
}
