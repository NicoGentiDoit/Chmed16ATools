/**
 * QR → CHMED16A text.
 *
 * The decision logic is a pure function over RGBA pixels (`scanImageData`), so
 * it is testable without a DOM and reusable from any image source. The browser
 * adapters at the bottom of the file cover the two supported acquisition paths:
 * an uploaded image file and a camera stream. They are deliberately not called
 * on import — a camera must only ever start from an explicit user action — and
 * every failure is mapped to a stable code instead of leaking a DOMException
 * message.
 *
 * A decoded text is untrusted input: it is returned verbatim and only the
 * header/codec layer (P3) decides whether it is a valid CHMED document.
 */

import jsQR from 'jsqr';

/** Minimal shape of an RGBA image, compatible with `ImageData`. */
export interface ImageDataSource {
  /** `width * height * 4` bytes, row-major RGBA. */
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface ScanSuccess {
  readonly ok: true;
  readonly text: string;
}

export type ScanErrorCode = 'no-qr' | 'image-load-failed' | 'camera-unavailable';

export interface ScanFailure {
  readonly ok: false;
  readonly code: ScanErrorCode;
}

export type ScanResult = ScanSuccess | ScanFailure;

const NO_QR: ScanFailure = { ok: false, code: 'no-qr' };

/**
 * Decodes the first QR symbol found in an RGBA image.
 *
 * Malformed buffers and decoder throws are reported as `no-qr`: to the user a
 * picture that cannot be read is simply a picture without a usable code.
 */
export function scanImageData(source: ImageDataSource): ScanResult {
  if (source.width <= 0 || source.height <= 0) {
    return NO_QR;
  }
  if (source.data.length < source.width * source.height * 4) {
    return NO_QR;
  }

  const data =
    source.data instanceof Uint8ClampedArray ? source.data : new Uint8ClampedArray(source.data);

  try {
    const decoded = jsQR(data, source.width, source.height);
    return decoded === null ? NO_QR : { ok: true, text: decoded.data };
  } catch {
    return NO_QR;
  }
}

/* ------------------------------------------------------------------------- *
 * Browser adapters — not imported by the DOM-free tests.
 * ------------------------------------------------------------------------- */

/** Raised by `startCamera` when the browser cannot provide a camera stream. */
export class CameraUnavailableError extends Error {
  readonly code = 'camera-unavailable' as const;

  constructor() {
    super('The camera is not available. Check browser support and camera permissions.');
    this.name = 'CameraUnavailableError';
  }
}

type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createContext(width: number, height: number): Canvas2DContext | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height).getContext('2d');
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext('2d');
  }
  return null;
}

async function bitmapToImageData(bitmap: ImageBitmap): Promise<ImageData | null> {
  const context = createContext(bitmap.width, bitmap.height);
  if (context === null) {
    return null;
  }
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

/**
 * Reads an uploaded image file and scans it.
 *
 * `createImageBitmap` handles the formats the browser can decode; anything it
 * rejects (wrong MIME type, corrupt file, no canvas support) becomes
 * `image-load-failed`.
 */
export async function readFileAsImageData(file: File): Promise<ScanResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const image = await bitmapToImageData(bitmap);
    if (image === null) {
      return { ok: false, code: 'image-load-failed' };
    }
    return scanImageData(image);
  } catch {
    return { ok: false, code: 'image-load-failed' };
  } finally {
    bitmap?.close();
  }
}

interface ActiveCamera {
  readonly stream: MediaStream;
  readonly video: HTMLVideoElement;
}

let activeCamera: ActiveCamera | null = null;

/**
 * Requests the rear camera, attaches it to `video` and starts playback.
 *
 * The returned stream is owned by this module: call `stopCamera()` to release
 * every track. Permission denial, missing hardware and unsupported browsers all
 * raise `CameraUnavailableError` (no raw DOMException escapes).
 */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  stopCamera();

  if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
    throw new CameraUnavailableError();
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch {
    throw new CameraUnavailableError();
  }

  activeCamera = { stream, video };
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // Autoplay can be blocked until the next user gesture; the caller may retry.
  }

  return stream;
}

/** Stops the tracks started by `startCamera` and detaches them from the video. */
export function stopCamera(): void {
  if (activeCamera === null) {
    return;
  }
  for (const track of activeCamera.stream.getTracks()) {
    track.stop();
  }
  activeCamera.video.srcObject = null;
  activeCamera = null;
}
