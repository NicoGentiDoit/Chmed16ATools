import { describe, expect, it } from 'vitest';

import { generateQr, qrToSvg } from '../qr-generate';
import type { QrEcLevel, QrGenerateSuccess, QrMatrix } from '../qr-generate';
import { scanImageData } from '../qr-scan';
import type { ImageDataSource } from '../qr-scan';
import { OFFICIAL_COMPRESSED } from './fixtures/official';

const SMALL_PAYLOAD = 'CHMED16A0{"MedType":1}';
const LONG_PAYLOAD = `CHMED16A0${'A'.repeat(190)}`;
const NON_ASCII_PAYLOAD = 'CHMED16A0{"Rmk":"Müller 🩺"}';

function generatedOrThrow(text: string, ecLevel: QrEcLevel): QrGenerateSuccess {
  const result = generateQr(text, { ecLevel });
  if (!result.ok) {
    throw new Error(
      `generateQr failed with ${result.code} at EC ${result.ecLevel} (${result.utf8Bytes} bytes)`,
    );
  }
  return result;
}

function isDark(matrix: QrMatrix, row: number, col: number): boolean {
  return matrix.data[(row * matrix.size + col) * 4] === 0;
}

/**
 * Renders the module map as RGBA pixels with a quiet zone, the way a scanner
 * would see a displayed QR code (no anti-aliasing, integer module scale).
 */
function rasterize(matrix: QrMatrix, scale = 4, margin = 4): ImageDataSource {
  const modules = matrix.size + margin * 2;
  const width = modules * scale;
  const height = modules * scale;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!isDark(matrix, row, col)) {
        continue;
      }
      const left = (col + margin) * scale;
      const top = (row + margin) * scale;
      for (let y = top; y < top + scale; y += 1) {
        for (let x = left; x < left + scale; x += 1) {
          const index = (y * width + x) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
        }
      }
    }
  }

  return { data, width, height };
}

function noise(width: number, height: number): ImageDataSource {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = 0x2f6e2b1;
  for (let index = 0; index < data.length; index += 4) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const value = state & 0xff;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, width, height };
}

describe('generateQr', () => {
  it('defaults to EC level M and reports the byte size', () => {
    const result = generatedOrThrow(SMALL_PAYLOAD, 'M');

    expect(result.ecLevel).toBe('M');
    expect(result.utf8Bytes).toBe(SMALL_PAYLOAD.length);
    expect(result.matrix.data).toHaveLength(result.matrix.size * result.matrix.size * 4);
    expect(result.matrix.size).toBe(result.version * 4 + 17);
    expect(result.version).toBeGreaterThanOrEqual(1);
    expect(result.version).toBeLessThanOrEqual(40);
  });

  it('produces a matrix with both dark and light modules', () => {
    const { matrix } = generatedOrThrow(SMALL_PAYLOAD, 'M');
    const pixels = Array.from({ length: matrix.size * matrix.size }, (_, index) =>
      matrix.data[index * 4] === 0 ? 1 : 0,
    );
    expect(pixels).toContain(1);
    expect(pixels).toContain(0);
  });

  it('generates at every error-correction level, growing with the level', () => {
    const sizes = (['L', 'M', 'Q', 'H'] as const).map(
      (ecLevel) => generatedOrThrow(SMALL_PAYLOAD, ecLevel).matrix.size,
    );

    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeGreaterThanOrEqual(sizes[index - 1] ?? 0);
    }
  });

  it('counts non-ASCII payloads in UTF-8 bytes', () => {
    const result = generatedOrThrow(NON_ASCII_PAYLOAD, 'M');
    const expected = new TextEncoder().encode(NON_ASCII_PAYLOAD).length;

    expect(result.utf8Bytes).toBe(expected);
    expect(result.utf8Bytes).toBeGreaterThan(NON_ASCII_PAYLOAD.length);
  });

  it('reports qr-overflow for a 4000-char payload at EC H', () => {
    const text = 'A'.repeat(4000);
    const result = generateQr(text, { ecLevel: 'H' });

    expect(result).toEqual({ ok: false, code: 'qr-overflow', ecLevel: 'H', utf8Bytes: 4000 });
  });

  it('also overflows at EC L beyond the version-40 byte capacity', () => {
    // Version 40 byte-mode capacity is 2953 bytes at EC L, so a 4000-char ASCII
    // payload cannot fit even at the most permissive level.
    const result = generateQr('A'.repeat(4000), { ecLevel: 'L' });

    expect(result).toEqual({ ok: false, code: 'qr-overflow', ecLevel: 'L', utf8Bytes: 4000 });
  });

  it('fits 2900 bytes at EC L while EC H overflows', () => {
    const text = 'A'.repeat(2900);

    const low = generateQr(text, { ecLevel: 'L' });
    expect(low.ok).toBe(true);
    if (low.ok) {
      expect(low.version).toBe(40);
    }

    expect(generateQr(text, { ecLevel: 'H' })).toEqual({
      ok: false,
      code: 'qr-overflow',
      ecLevel: 'H',
      utf8Bytes: 2900,
    });
  });
});

describe('qr round-trip through scanImageData', () => {
  for (const ecLevel of ['M', 'L'] as const) {
    it(`decodes the small payload generated at EC ${ecLevel}`, () => {
      const generated = generatedOrThrow(SMALL_PAYLOAD, ecLevel);
      expect(scanImageData(rasterize(generated.matrix))).toEqual({
        ok: true,
        text: SMALL_PAYLOAD,
      });
    });

    it(`decodes the 200-char payload generated at EC ${ecLevel}`, () => {
      const generated = generatedOrThrow(LONG_PAYLOAD, ecLevel);
      expect(scanImageData(rasterize(generated.matrix))).toEqual({
        ok: true,
        text: LONG_PAYLOAD,
      });
    });
  }

  it('decodes the official compressed example', () => {
    const generated = generatedOrThrow(OFFICIAL_COMPRESSED, 'M');
    expect(scanImageData(rasterize(generated.matrix))).toEqual({
      ok: true,
      text: OFFICIAL_COMPRESSED,
    });
  });

  it('decodes a non-ASCII payload without mangling it', () => {
    const generated = generatedOrThrow(NON_ASCII_PAYLOAD, 'M');
    expect(scanImageData(rasterize(generated.matrix))).toEqual({
      ok: true,
      text: NON_ASCII_PAYLOAD,
    });
  });
});

describe('scanImageData', () => {
  it('reports no-qr for a noise image', () => {
    expect(scanImageData(noise(160, 160))).toEqual({ ok: false, code: 'no-qr' });
  });

  it('reports no-qr for an empty or truncated buffer', () => {
    expect(scanImageData({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual({
      ok: false,
      code: 'no-qr',
    });
    expect(
      scanImageData({ data: new Uint8ClampedArray(4), width: 10, height: 10 }),
    ).toEqual({ ok: false, code: 'no-qr' });
  });

  it('accepts a plain Uint8Array buffer', () => {
    const generated = generatedOrThrow(SMALL_PAYLOAD, 'M');
    const image = rasterize(generated.matrix);
    const result = scanImageData({
      data: new Uint8Array(image.data),
      width: image.width,
      height: image.height,
    });

    expect(result).toEqual({ ok: true, text: SMALL_PAYLOAD });
  });
});

describe('qrToSvg', () => {
  it('renders a white background and black module rects', () => {
    const generated = generatedOrThrow(SMALL_PAYLOAD, 'M');
    const svg = qrToSvg(generated);

    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toMatch(/<rect x="\d+" y="\d+" width="\d+" height="1"\/>/);
    expect(svg).not.toContain('<script');
  });

  it('is deterministic for the same input', () => {
    const generated = generatedOrThrow(LONG_PAYLOAD, 'Q');
    expect(qrToSvg(generated)).toBe(qrToSvg(generated));
    expect(qrToSvg(generated.matrix)).toBe(qrToSvg(generated));
  });

  it('accepts a bare matrix and honours the margin option', () => {
    const { matrix } = generatedOrThrow(SMALL_PAYLOAD, 'M');
    const withDefaultMargin = qrToSvg(matrix);
    const withoutMargin = qrToSvg(matrix, { margin: 0 });

    const total = matrix.size + 8;
    expect(withDefaultMargin).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(withoutMargin).toContain(`viewBox="0 0 ${matrix.size} ${matrix.size}"`);
  });
});
