/**
 * Page images → text, with tesseract.js, entirely offline.
 *
 * The pure layer is small on purpose: `combineOcrPages` joins per-page results
 * into one document text with the page break `prescription-parse.ts:329-337`
 * already understands, and `normalizeOcrLanguages` pins the language request to
 * the traineddata that is actually shipped in `public/tesseract/`.
 *
 * ## Offline contract
 *
 * tesseract.js defaults to three CDN locations — `workerPath`
 * (jsdelivr `tesseract.js`), `corePath` (jsdelivr `tesseract.js-core`) and
 * `langPath` (jsdelivr `@tesseract.js-data/<lang>`). All three are overridden
 * here with same-origin assets built from the app's own `public/` directory, so
 * a page can be recognised with the network unplugged:
 *
 * | option       | bundled asset                                    |
 * | ------------ | ------------------------------------------------ |
 * | `workerPath` | `public/tesseract/worker.min.js`                 |
 * | `corePath`   | `public/tesseract/core/` (LSTM wasm wrappers)    |
 * | `langPath`   | `public/tesseract/` (`<lang>.traineddata.gz`)    |
 *
 * `cacheMethod: 'none'` is set as well: tesseract.js otherwise mirrors
 * traineddata into IndexedDB, which plan 002 forbids (no persistence).
 *
 * ## Column contract
 *
 * `preserve_interword_spaces: '1'` is set on the worker (Tesseract's own
 * `WorkerParams` entry, a string like every Tesseract parameter). Without it
 * Tesseract collapses the wide gaps of the printed medication table to one
 * space, so a medication row would no longer carry the 2+ space / tab / `|`
 * cell separators `prescription-parse.ts` expects. With it, a column gap
 * survives as a run of spaces and the strict parser keeps working. The parser
 * additionally has a tolerated single-space fallback for OCR engines that
 * still collapse the gaps.
 *
 * The tesseract.js bundle is imported dynamically, so importing this module in
 * node costs nothing and the pure helpers stay testable without a worker.
 */

/** Languages shipped under `public/tesseract/`. */
export const DEFAULT_OCR_LANGUAGES = 'eng+deu';

/** Page break between two recognised pages (a form feed, like `pdf-extract`). */
export const OCR_PAGE_SEPARATOR = '\n\f\n';

/** Traineddata directories present under `public/tesseract/`. */
const SHIPPED_OCR_LANGUAGES: readonly string[] = ['eng', 'deu'];

/**
 * Joins per-page OCR text into one document text.
 *
 * Pages keep their order, each page is trimmed, and whitespace-only pages (a
 * blank scan) are dropped instead of producing empty double separators. A
 * single page therefore comes back verbatim, with no separator at all.
 *
 * Pure: no DOM, no tesseract.js import, no I/O.
 */
export function combineOcrPages(pages: readonly string[]): string {
  const cleaned: string[] = [];
  for (const page of pages) {
    const text = page.trim();
    if (text !== '') {
      cleaned.push(text);
    }
  }
  return cleaned.join(OCR_PAGE_SEPARATOR);
}

/**
 * Normalizes a language request to `lang(+"lang")*` limited to the traineddata
 * that ships with the app.
 *
 * Unknown codes would make the worker fetch a missing `.traineddata.gz` (a
 * failed request, not a network escape), so they are rejected up front. The
 * codes are also the only characters that ever reach `langPath`, which keeps a
 * hostile configuration from turning into a path traversal.
 *
 * Returns `null` when the request cannot be served offline.
 *
 * Pure: no DOM, no tesseract.js import, no I/O.
 */
export function normalizeOcrLanguages(languages: string | undefined): string | null {
  if (languages === undefined) {
    return DEFAULT_OCR_LANGUAGES;
  }
  const requested = languages
    .toLowerCase()
    .split('+')
    .map((part) => part.trim());
  const unique: string[] = [];
  for (const language of requested) {
    if (language === '' || !SHIPPED_OCR_LANGUAGES.includes(language)) {
      return null;
    }
    if (!unique.includes(language)) {
      unique.push(language);
    }
  }
  return unique.join('+');
}

/* ------------------------------------------------------------------------- *
 * tesseract.js adapter — worker/WASM/canvas dependent, never imported by the
 * tests. All asset paths point inside the app's own `public/tesseract/`.
 * ------------------------------------------------------------------------- */

/** `import.meta.env.BASE_URL` already ends with `/` (e.g. `/Chmed16ATools/`). */
const TESSERACT_ASSET_BASE = `${import.meta.env.BASE_URL}tesseract`;

/**
 * The three tesseract.js locations, all inside the app's own
 * `public/tesseract/` tree (copied verbatim into `dist/tesseract/` by Vite).
 * Exported so the offline rule can be asserted without spawning a worker.
 */
export const TESSERACT_ASSET_PATHS = {
  workerPath: `${TESSERACT_ASSET_BASE}/worker.min.js`,
  corePath: `${TESSERACT_ASSET_BASE}/core`,
  langPath: TESSERACT_ASSET_BASE,
} as const;

const OCR_FAILED_MESSAGE = 'The text on this page could not be recognised.';
const OCR_IMAGE_MESSAGE = 'The page image could not be prepared for OCR.';
const OCR_CANCELLED_MESSAGE = 'Text recognition was cancelled.';

/** One page as accepted by the tesseract.js browser adapter. */
export type OcrImage = Blob | HTMLCanvasElement | OffscreenCanvas | ImageData;

export interface OcrProgressUpdate {
  /** tesseract.js status, e.g. `recognizing text`. */
  readonly status: string;
  /** 0..1. */
  readonly progress: number;
}

export interface OcrOptions {
  /** `eng+deu` by default; only shipped languages are accepted. */
  readonly languages?: string;
  /** Polled between pages — tesseract.js cannot interrupt a running page. */
  readonly signal?: AbortSignal;
  /** Forwarded from tesseract.js; called on the recognition thread's reports. */
  readonly onProgress?: (update: OcrProgressUpdate) => void;
}

export type OcrErrorCode = 'ocr-failed' | 'ocr-cancelled';

export interface OcrError {
  readonly code: OcrErrorCode;
  readonly message: string;
}

export type OcrResult =
  | {
      readonly ok: true;
      /** Pages joined with `OCR_PAGE_SEPARATOR`. */
      readonly text: string;
      /** Lowest per-page confidence (0-100): the pessimistic page wins. */
      readonly confidence: number;
      readonly pageCount: number;
    }
  | { readonly ok: false; readonly error: OcrError };

/** Structural view of the parts of a tesseract.js worker this module uses. */
interface TesseractWorker {
  recognize(image: Blob | HTMLCanvasElement | OffscreenCanvas): Promise<{
    readonly data: { readonly text: string; readonly confidence: number };
  }>;
  /** Tesseract `WorkerParams`, e.g. `preserve_interword_spaces: '1'`. */
  setParameters(params: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}

function failOcr(code: OcrErrorCode, message: string): OcrResult {
  return { ok: false, error: { code, message } };
}

function isImageList(value: OcrImage | readonly OcrImage[]): value is readonly OcrImage[] {
  return Array.isArray(value);
}

function isImageData(value: OcrImage): value is ImageData {
  return typeof ImageData !== 'undefined' && value instanceof ImageData;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function clampConfidence(confidence: number): number {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return 0;
  }
  return Math.min(100, Math.max(0, confidence));
}

/** `ImageData` is not accepted by tesseract.js directly; PNG is. */
async function imageDataToBlob(image: ImageData): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  context.putImageData(image, 0, 0);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

async function toOcrSource(
  image: OcrImage,
): Promise<Blob | HTMLCanvasElement | OffscreenCanvas | null> {
  if (isImageData(image)) {
    return imageDataToBlob(image);
  }
  return image;
}

/**
 * Recognizes one page, or a list of pages, with a single tesseract.js worker.
 *
 * The worker is created for this call and terminated in `finally`: the panel
 * runs one recognition per user action, so a fresh worker keeps the WASM heap
 * from being held for the lifetime of the tab.
 *
 * Never throws: worker/WASM failures become `ocr-failed`, an aborted signal
 * becomes `ocr-cancelled`. `confidence` is the minimum over the pages, so one
 * badly recognised page marks the whole document as low confidence.
 */
export async function runOcr(
  input: OcrImage | readonly OcrImage[],
  options: OcrOptions = {},
): Promise<OcrResult> {
  const images: readonly OcrImage[] = isImageList(input) ? input : [input];
  if (images.length === 0) {
    return failOcr('ocr-failed', OCR_IMAGE_MESSAGE);
  }
  if (isAborted(options.signal)) {
    return failOcr('ocr-cancelled', OCR_CANCELLED_MESSAGE);
  }

  const languages = normalizeOcrLanguages(options.languages);
  if (languages === null) {
    return failOcr('ocr-failed', 'The requested OCR languages are not available offline.');
  }

  let worker: TesseractWorker | null = null;

  try {
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker(languages, undefined, {
      ...TESSERACT_ASSET_PATHS,
      cacheMethod: 'none',
      gzip: true,
      workerBlobURL: false,
      logger: (message) => {
        options.onProgress?.({ status: message.status, progress: message.progress });
      },
    });
    // Keep the printed table's column gaps: Tesseract otherwise collapses them
    // to a single space and the row cells stop being separable.
    await worker.setParameters({ preserve_interword_spaces: '1' });

    const pages: string[] = [];
    let confidence = 100;

    for (const image of images) {
      if (isAborted(options.signal)) {
        return failOcr('ocr-cancelled', OCR_CANCELLED_MESSAGE);
      }
      const source = await toOcrSource(image);
      if (source === null) {
        return failOcr('ocr-failed', OCR_IMAGE_MESSAGE);
      }
      const result = await worker.recognize(source);
      pages.push(result.data.text);
      confidence = Math.min(confidence, clampConfidence(result.data.confidence));
    }

    return {
      ok: true,
      text: combineOcrPages(pages),
      confidence,
      pageCount: images.length,
    };
  } catch {
    return isAborted(options.signal)
      ? failOcr('ocr-cancelled', OCR_CANCELLED_MESSAGE)
      : failOcr('ocr-failed', OCR_FAILED_MESSAGE);
  } finally {
    if (worker !== null) {
      try {
        await worker.terminate();
      } catch {
        // Terminating a worker that already died is not an error worth surfacing.
      }
    }
  }
}
