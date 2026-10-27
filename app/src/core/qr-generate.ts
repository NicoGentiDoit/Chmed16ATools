/**
 * CHMED16A payload → QR symbol.
 *
 * The 16A transmission format has no chunking (`chtransmissionformat/README.md:145-181`
 * defines it for release year 23 only), so a payload either fits one symbol or
 * cannot be shown as a QR code at all. The specification calls the payload size
 * "limited" without giving a number (`chtransmissionformat/README.md:39-40`), so
 * capacity is computed at runtime by the encoder library: the caller picks an
 * error-correction level (default `M`, the user-locked choice) and the library
 * picks the smallest version 1–40 that fits. Over-capacity is reported as a
 * blocking `qr-overflow` result carrying the EC level and the UTF-8 byte count,
 * so the UI can suggest a lower EC level before blocking (plan 001, feature 3).
 *
 * Byte handling: the CHMED payload is UTF-8 (`chtransmissionformat/README.md:44`),
 * but qrcode-generator's default string converter truncates each char code to
 * one byte. The text is therefore encoded to UTF-8 first and handed to the
 * library as a byte string, which keeps ASCII, accents and emoji intact.
 *
 * This module is framework-free and DOM-free: it never touches canvas, the
 * document or a network. `qrToSvg` only returns a string; PNG export belongs to
 * the UI layer (P5).
 */

import qrcode from 'qrcode-generator';

/** Error-correction levels, strongest first; `M` is the default. */
export type QrEcLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * A QR symbol as a 1-bit module map: RGBA pixels, where a module is either
 * `[0, 0, 0, 255]` (dark) or `[255, 255, 255, 255]` (light).
 */
export interface QrMatrix {
  /** Modules per side (21, 25, … 177). */
  readonly size: number;
  /** `size * size * 4` bytes, row-major, RGBA. */
  readonly data: Uint8ClampedArray;
}

export interface QrGenerateOptions {
  /** Error-correction level; defaults to `M`. */
  readonly ecLevel?: QrEcLevel;
}

export interface QrGenerateSuccess {
  readonly ok: true;
  readonly text: string;
  readonly ecLevel: QrEcLevel;
  /** QR version 1–40 chosen by the library. */
  readonly version: number;
  /** Size of the payload in UTF-8 bytes (what the symbol capacity consumes). */
  readonly utf8Bytes: number;
  readonly matrix: QrMatrix;
}

export interface QrGenerateFailure {
  readonly ok: false;
  /** The payload does not fit a version 40 symbol at this EC level. */
  readonly code: 'qr-overflow';
  readonly ecLevel: QrEcLevel;
  readonly utf8Bytes: number;
}

export type QrGenerateResult = QrGenerateSuccess | QrGenerateFailure;

const DEFAULT_EC_LEVEL: QrEcLevel = 'M';

/** Quiet zone in modules, as required around a QR symbol (ISO/IEC 18004). */
const QUIET_ZONE_MODULES = 4;

/** Chunk size that keeps `String.fromCharCode(...)` argument lists small. */
const BYTE_CHUNK = 0x2000;

/**
 * Packs UTF-8 bytes into a string whose char codes are exactly those bytes.
 * qrcode-generator's byte mode is fed through this so its latin-1 converter
 * stays lossless.
 */
function bytesToByteString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BYTE_CHUNK)));
  }
  return chunks.join('');
}

function buildMatrix(code: ReturnType<typeof qrcode>): QrMatrix {
  const size = code.getModuleCount();
  const data = new Uint8ClampedArray(size * size * 4);

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = (row * size + col) * 4;
      const value = code.isDark(row, col) ? 0 : 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  return { size, data };
}

/**
 * Encodes a CHMED16A payload as a QR symbol.
 *
 * The library throws on overflow (and may throw plain strings rather than
 * `Error`s); those throws are mapped to `qr-overflow` and never surfaced.
 */
export function generateQr(text: string, options: QrGenerateOptions = {}): QrGenerateResult {
  const ecLevel = options.ecLevel ?? DEFAULT_EC_LEVEL;
  const bytes = new TextEncoder().encode(text);

  try {
    const code = qrcode(0, ecLevel);
    code.addData(bytesToByteString(bytes), 'Byte');
    code.make();

    const matrix = buildMatrix(code);

    return {
      ok: true,
      text,
      ecLevel,
      version: (matrix.size - 17) / 4,
      utf8Bytes: bytes.length,
      matrix,
    };
  } catch {
    return { ok: false, code: 'qr-overflow', ecLevel, utf8Bytes: bytes.length };
  }
}

export interface QrSvgOptions {
  /** Quiet zone in modules; defaults to 4. */
  readonly margin?: number;
}

/**
 * Renders a generated symbol as a standalone, scalable SVG document.
 *
 * The viewBox is expressed in modules and no `width`/`height` attributes are
 * emitted, so the caller controls the display size with CSS. Dark modules are
 * horizontal runs of `<rect>` elements, which keeps the markup small for large
 * symbols without changing the rendered result. Output is deterministic for a
 * given matrix and margin.
 */
export function qrToSvg(source: QrMatrix | QrGenerateSuccess, options: QrSvgOptions = {}): string {
  const { size, data } = 'matrix' in source ? source.matrix : source;
  const margin = Math.max(0, Math.trunc(options.margin ?? QUIET_ZONE_MODULES));
  const total = size + margin * 2;
  const rects: string[] = [];

  for (let row = 0; row < size; row += 1) {
    let runStart = -1;
    for (let col = 0; col <= size; col += 1) {
      const dark = col < size && data[(row * size + col) * 4] === 0;
      if (dark && runStart === -1) {
        runStart = col;
      } else if (!dark && runStart !== -1) {
        rects.push(
          `<rect x="${runStart + margin}" y="${row + margin}" width="${col - runStart}" height="1"/>`,
        );
        runStart = -1;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<g fill="#000000">${rects.join('')}</g>`,
    '</svg>',
  ].join('');
}
