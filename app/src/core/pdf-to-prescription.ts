/**
 * Untrusted PDF bytes → validated CHMED16A ePrescription.
 *
 * This is the Phase 3 orchestration layer of plan 002. It owns *only* the
 * decisions between stages; every stage is a single injected function, so the
 * whole pipeline runs in a node-environment test with fakes and never needs a
 * real PDF, a canvas, a worker or the tesseract WASM.
 *
 * ## Flow (`plan/in-progress/002-pdf-to-chmed.md` §Phase Details, Phase 3)
 *
 * 1. `hasPdfMagic` — anything that is not a PDF fails closed as `not-pdf`
 *    before an adapter touches it.
 * 2. `extractText` — the pdfjs text layer plus `pageCount`/`hasTextLayer`.
 * 3. If the text layer is missing or whitespace-only: render every page,
 *    recognise them with OCR, mark `confidence: 'low'` and append the
 *    `ocr-low-confidence` warning. Otherwise the extracted text is used as is.
 * 4. `parseText` — `{ ok: false, errors }` becomes `stage: 'parse'`.
 * 5. `validate` — the parsed object is checked against the rev-3 Rx schema;
 *    `{ ok: false }` becomes `stage: 'validate'`.
 * 6. `encode` — `jsonToChmed`; `{ ok: false }` becomes `stage: 'encode'`.
 * 7. Success carries the text that was parsed, the medication object, its
 *    pretty JSON, the encoded string, merged warnings, confidence and the
 *    extraction's page count.
 *
 * ## Failure contract
 *
 * The function never throws. Adapter throws and unexpected engine throws are
 * caught at the boundary and mapped to the typed `stage`/`errors` result;
 * extraction, render and OCR reuse the Phase 2 codes (`not-pdf`,
 * `pdf-corrupt`, `pdf-password`, `render-failed`, `ocr-failed`,
 * `ocr-cancelled`) instead of inventing parallel ones.
 *
 * ## Warnings
 *
 * Parser findings, validator findings, encoder findings and the OCR fallback
 * warning are merged in that order. Exact `(code, path)` duplicates are dropped,
 * keeping the first occurrence: the parser and the validator both report the
 * same empty `/Auth` string (`plan/.../002-pdf-to-chmed.md` §Notes), and
 * `jsonToChmed` re-runs the validator, so the merge is what keeps the findings
 * list readable. The encoder's own warning list is included so a finding it
 * raises on its second validation pass is never silently dropped.
 *
 * ## Untrusted input
 *
 * No `eval`, no shell, no file writes. The default OCR renderer opens the
 * document itself (the Phase 2 `renderPageToImageData` takes a `PDFPageProxy`),
 * so it bounds the rasterized pages with `MAX_OCR_PAGES` and maps page-count or
 * canvas failures to a stable error. The buffer handed to pdfjs is copied here
 * as well because pdfjs transfers ownership to its worker; `extractPdfText`
 * copies its own buffer already, but the render pass needs a second, live copy.
 */

import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { jsonToChmed } from './encode';
import type { EncodeResult } from './encode';
import { runOcr } from './ocr';
import type { OcrError, OcrImage, OcrResult } from './ocr';
import { extractPdfText, hasPdfMagic, NOT_PDF_MESSAGE } from './pdf-extract';
import type { PdfExtractError, PdfExtractResult } from './pdf-extract';
import { RENDER_FAILED_MESSAGE, renderPageToImageData } from './pdf-render';
import type { PdfRenderError } from './pdf-render';
import { parsePrescriptionText } from './prescription-parse';
import type { ParseError, PrescriptionParseResult } from './prescription-parse';
import type { MedicationRx } from './types';
import { validateObject } from './validate';
import type {
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './validate';

/** The stage that produced a failure (or is currently executing). */
export type PdfToPrescriptionStage = 'extract' | 'ocr' | 'parse' | 'validate' | 'encode';

/** `low` marks the OCR fallback; a text layer keeps `high`. */
export type PdfToPrescriptionConfidence = 'high' | 'low';

/**
 * A validator finding or the OCR-fallback notice.
 *
 * The OCR code is kept out of `validate.ts`'s `WarningCode` on purpose: that
 * union describes schema findings, this one describes the pipeline.
 */
export type PdfToPrescriptionWarning =
  | ValidationWarning
  | {
      readonly code: 'ocr-low-confidence';
      readonly path: '';
      readonly message: string;
    };

/** Result of a page-render pass: the images, or the Phase 2 render error. */
export type PdfPagesRenderResult =
  | { readonly ok: true; readonly images: readonly OcrImage[] }
  | { readonly ok: false; readonly error: PdfRenderError };

/**
 * Every stage as one injectable function. The default object below binds each
 * one to its Phase 1/2 module; a test passes a complete fake object instead.
 */
export interface PdfToPrescriptionDeps {
  readonly extractText: (bytes: Uint8Array) => Promise<PdfExtractResult>;
  /** Renders `pageCount` pages of the same bytes, in page order. */
  readonly renderPages: (
    bytes: Uint8Array,
    pageCount: number,
  ) => Promise<PdfPagesRenderResult>;
  /** Recognises one or more pages; `runOcr` already joins them with `combineOcrPages`. */
  readonly ocr: (images: readonly OcrImage[]) => Promise<OcrResult>;
  readonly parseText: (text: string) => PrescriptionParseResult;
  readonly validate: (object: unknown, context?: ValidationContext) => ValidationResult;
  readonly encode: (input: string | object) => EncodeResult;
}

export interface PdfToPrescriptionSuccess {
  readonly ok: true;
  /** Text that was parsed (text layer, or the OCR pages joined). */
  readonly text: string;
  readonly prescription: MedicationRx;
  /** `JSON.stringify(prescription, null, 2)`. */
  readonly json: string;
  readonly chmed: string;
  readonly warnings: readonly PdfToPrescriptionWarning[];
  readonly confidence: PdfToPrescriptionConfidence;
  /** Page count reported by the extraction adapter. */
  readonly pageCount: number;
}

/**
 * Typed failure. `errors` is the stage's own error list, so a caller can narrow
 * on `stage` and read the exact Phase 1/2/validator shape.
 */
export type PdfToPrescriptionFailure =
  | {
      readonly ok: false;
      readonly stage: 'extract';
      readonly errors: readonly PdfExtractError[];
    }
  | {
      readonly ok: false;
      readonly stage: 'ocr';
      readonly errors: readonly (OcrError | PdfRenderError)[];
    }
  | {
      readonly ok: false;
      readonly stage: 'parse';
      readonly errors: readonly ParseError[];
    }
  | {
      readonly ok: false;
      readonly stage: 'validate' | 'encode';
      readonly errors: readonly ValidationError[];
    };

export type PdfToPrescriptionResult = PdfToPrescriptionSuccess | PdfToPrescriptionFailure;

/** Upper bound on pages rasterized for OCR (each page may hold ~16 MB of RGBA). */
export const MAX_OCR_PAGES = 20;

const UNEXPECTED_MESSAGE = 'The PDF could not be processed.';
const NO_PAGES_MESSAGE = 'The PDF has no pages to render.';
const TOO_MANY_PAGES_MESSAGE = 'The scanned PDF has more pages than this tool can read.';

const OCR_LOW_CONFIDENCE_WARNING: PdfToPrescriptionWarning = {
  code: 'ocr-low-confidence',
  path: '',
  message:
    'The text was recognized from a scanned page; verify every value before using the prescription.',
};

/* ------------------------------------------------------------------------- *
 * Page renderer adapter — pdfjs/canvas dependent, never used by the tests.
 * ------------------------------------------------------------------------- */

/**
 * Renders every page of `bytes` with the Phase 2 canvas adapter.
 *
 * The Phase 2 entry point takes a `PDFPageProxy`, so the document lifecycle
 * lives here: one loading task, one page at a time, destroyed in `finally`.
 * Never throws; any failure becomes the stable `render-failed` error.
 */
async function renderPdfPages(
  bytes: Uint8Array,
  pageCount: number,
): Promise<PdfPagesRenderResult> {
  if (pageCount <= 0) {
    return { ok: false, error: { code: 'render-failed', message: NO_PAGES_MESSAGE } };
  }

  let loadingTask: PDFDocumentLoadingTask | null = null;

  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    loadingTask = pdfjs.getDocument({
      // pdfjs transfers the buffer to its worker, so it must own the copy.
      data: bytes.slice(),
      useWorkerFetch: false,
      verbosity: 0,
    });
    const pdfDocument = await loadingTask.promise;

    const pages = Math.min(pageCount, pdfDocument.numPages);
    const images: OcrImage[] = [];
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      try {
        const rendered = await renderPageToImageData(page);
        if (!rendered.ok) {
          return { ok: false, error: rendered.error };
        }
        images.push(rendered.value.image);
      } finally {
        page.cleanup();
      }
    }

    if (images.length === 0) {
      return { ok: false, error: { code: 'render-failed', message: NO_PAGES_MESSAGE } };
    }
    return { ok: true, images };
  } catch {
    return {
      ok: false,
      error: { code: 'render-failed', message: RENDER_FAILED_MESSAGE },
    };
  } finally {
    try {
      if (loadingTask !== null) {
        await loadingTask.destroy();
      }
    } catch {
      // Teardown is best effort: it must not mask the render result.
    }
  }
}

/** Default bindings: the Phase 1/2 adapters and the existing validator/encoder. */
export const PDF_TO_PRESCRIPTION_DEPS: PdfToPrescriptionDeps = {
  extractText: extractPdfText,
  renderPages: renderPdfPages,
  ocr: (images) => runOcr(images),
  parseText: parsePrescriptionText,
  validate: validateObject,
  encode: jsonToChmed,
};

/* ------------------------------------------------------------------------- *
 * Pipeline
 * ------------------------------------------------------------------------- */

/** Drop exact `(code, path)` duplicates, keeping the first occurrence. */
function mergeWarnings(
  groups: readonly (readonly PdfToPrescriptionWarning[])[],
): PdfToPrescriptionWarning[] {
  const seen = new Set<string>();
  const merged: PdfToPrescriptionWarning[] = [];
  for (const group of groups) {
    for (const warning of group) {
      const key = `${warning.code}\u0000${warning.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(warning);
    }
  }
  return merged;
}

/** Typed failure for a throw the stages did not convert themselves. */
function unexpectedFailure(stage: PdfToPrescriptionStage): PdfToPrescriptionFailure {
  switch (stage) {
    case 'extract':
      return { ok: false, stage, errors: [{ code: 'pdf-corrupt', message: UNEXPECTED_MESSAGE }] };
    case 'ocr':
      return { ok: false, stage, errors: [{ code: 'ocr-failed', message: UNEXPECTED_MESSAGE }] };
    case 'parse':
      return {
        ok: false,
        stage,
        errors: [{ code: 'invalid-value', path: '', message: UNEXPECTED_MESSAGE }],
      };
    case 'validate':
    case 'encode':
      return {
        ok: false,
        stage,
        errors: [
          {
            instancePath: '',
            keyword: 'internal',
            message: UNEXPECTED_MESSAGE,
            params: {},
          },
        ],
      };
  }
}

/**
 * Runs the untrusted-PDF pipeline.
 *
 * @param bytes Untrusted file bytes; never mutated and never trusted.
 * @param deps  Optional override of any stage (tests pass a full fake object).
 *
 * Never throws: every failure is a `{ ok: false, stage, errors }` result.
 */
export async function pdfToPrescription(
  bytes: Uint8Array,
  deps?: PdfToPrescriptionDeps,
): Promise<PdfToPrescriptionResult> {
  const stages: PdfToPrescriptionDeps = { ...PDF_TO_PRESCRIPTION_DEPS, ...deps };
  let stage: PdfToPrescriptionStage = 'extract';

  try {
    if (!hasPdfMagic(bytes)) {
      return {
        ok: false,
        stage: 'extract',
        errors: [{ code: 'not-pdf', message: NOT_PDF_MESSAGE }],
      };
    }

    const extracted = await stages.extractText(bytes);
    if (!extracted.ok) {
      return { ok: false, stage: 'extract', errors: [extracted.error] };
    }

    stage = 'ocr';
    let text = extracted.value.text;
    let confidence: PdfToPrescriptionConfidence = 'high';
    const extraWarnings: PdfToPrescriptionWarning[] = [];

    if (!extracted.value.hasTextLayer || text.trim() === '') {
      if (extracted.value.pageCount > MAX_OCR_PAGES) {
        return {
          ok: false,
          stage: 'ocr',
          errors: [{ code: 'ocr-failed', message: TOO_MANY_PAGES_MESSAGE }],
        };
      }

      const rendered = await stages.renderPages(bytes, extracted.value.pageCount);
      if (!rendered.ok) {
        return { ok: false, stage: 'ocr', errors: [rendered.error] };
      }

      const recognised = await stages.ocr(rendered.images);
      if (!recognised.ok) {
        return { ok: false, stage: 'ocr', errors: [recognised.error] };
      }

      text = recognised.text;
      confidence = 'low';
      extraWarnings.push(OCR_LOW_CONFIDENCE_WARNING);
    }

    stage = 'parse';
    const parsed = stages.parseText(text);
    if (!parsed.ok) {
      return { ok: false, stage: 'parse', errors: parsed.errors };
    }

    stage = 'validate';
    const validation = stages.validate(parsed.value, {
      medType: 3,
      rev: parsed.value.rev ?? 3,
    });
    if (!validation.ok) {
      return { ok: false, stage: 'validate', errors: validation.errors };
    }

    stage = 'encode';
    const encoded = stages.encode(parsed.value);
    if (!encoded.ok) {
      return { ok: false, stage: 'encode', errors: encoded.errors };
    }

    return {
      ok: true,
      text,
      prescription: parsed.value,
      json: JSON.stringify(parsed.value, null, 2),
      chmed: encoded.chmed,
      warnings: mergeWarnings([
        parsed.warnings,
        validation.warnings,
        encoded.warnings,
        extraWarnings,
      ]),
      confidence,
      pageCount: extracted.value.pageCount,
    };
  } catch {
    return unexpectedFailure(stage);
  }
}
