import { describe, expect, it } from 'vitest';

import { hasPdfMagic, hasTextLayer, normalizeTextItems } from '../pdf-extract';
import type { PdfTextItemLike } from '../pdf-extract';

/** Positioned text item as pdfjs reports it (device space, `y` upwards). */
function item(
  str: string,
  options: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    hasEOL?: boolean;
  } = {},
): PdfTextItemLike {
  const { x = 100, y = 700, width = 40, height = 10, hasEOL = false } = options;
  return { str, hasEOL, width, height, transform: [1, 0, 0, 1, x, y] };
}

describe('normalizeTextItems', () => {
  it('returns an empty string when there is no text', () => {
    expect(normalizeTextItems([])).toBe('');
    expect(normalizeTextItems([{ hasEOL: true }, { str: '' }])).toBe('');
  });

  it('preserves line order', () => {
    const text = normalizeTextItems([
      item('Medication | Morning | Noon', { hasEOL: true }),
      item('Ramipril 5 mg | 1 | 0', { hasEOL: true }),
      item('Metformin 500 mg | 0 | 1', { hasEOL: true }),
    ]);

    expect(text).toBe(
      ['Medication | Morning | Noon', 'Ramipril 5 mg | 1 | 0', 'Metformin 500 mg | 0 | 1'].join(
        '\n',
      ),
    );
  });

  it('collapses stray whitespace inside an item and trims it', () => {
    const text = normalizeTextItems([
      item('   Ramipril    5 \t mg  ', { hasEOL: true }),
      item('\n\n  Tablet  \t  \n', { hasEOL: true }),
    ]);

    expect(text).toBe('Ramipril 5 mg\nTablet');
  });

  it('skips marked-content entries and non-string text', () => {
    const text = normalizeTextItems([
      { type: 'beginMarkedContent' },
      item('Erika Muster', { hasEOL: true }),
      { type: 'endMarkedContent' },
      { str: undefined },
      item('Born on: 05.05.1980', { hasEOL: true }),
    ]);

    expect(text).toBe('Erika Muster\nBorn on: 05.05.1980');
  });

  it('ends a line on hasEOL even without geometry', () => {
    expect(
      normalizeTextItems([
        { str: 'first', hasEOL: true },
        { str: 'second', hasEOL: true },
        { str: 'third' },
      ]),
    ).toBe('first\nsecond\nthird');
  });

  it('ends a line when the baseline moves by more than half a line height', () => {
    const text = normalizeTextItems([
      item('Ramipril', { x: 100, y: 700 }),
      item('Metformin', { x: 100, y: 685 }),
      item('Ibuprofen', { x: 150, y: 689 }),
    ]);

    expect(text).toBe('Ramipril\nMetformin Ibuprofen');
  });

  it('inserts the two-space column separator for a wide horizontal gap', () => {
    const text = normalizeTextItems([
      item('Ramipril 5 mg', { x: 100, width: 60 }), // spans 100..160
      item('Tablet', { x: 200, width: 30 }), // gap = 40 > 2 * 10
      item('After a meal', { x: 300, width: 50 }), // gap = 70 > 2 * 10
    ]);

    expect(text).toBe('Ramipril 5 mg  Tablet  After a meal');
  });

  it('inserts a single space for a narrow gap and none for an overlap', () => {
    const text = normalizeTextItems([
      item('Rami', { x: 100, width: 40 }), // spans 100..140
      item('pril', { x: 145, width: 20 }), // gap = 5, between 2 and 20
      item('5mg', { x: 160, width: 20 }), // gap = -5
    ]);

    expect(text).toBe('Rami pril5mg');
  });

  it('falls back to a single space when the geometry is missing', () => {
    expect(normalizeTextItems([{ str: 'Ramipril' }, { str: '5 mg' }])).toBe('Ramipril 5 mg');
  });

  it('never emits leading, trailing or repeated blank lines', () => {
    const text = normalizeTextItems([
      item('  ', { hasEOL: true }),
      { str: '', hasEOL: true },
      item('Patient', { hasEOL: true }),
      item('  ', { hasEOL: true }),
      item('', { hasEOL: true }),
      item('Medication', { hasEOL: true }),
      { hasEOL: true },
    ]);

    expect(text).toBe('Patient\nMedication');
  });

  it('does not throw on hostile item shapes', () => {
    const hostile: PdfTextItemLike[] = [
      { str: 'x'.repeat(10_000), transform: [0, 0, 0, 0, Number.NaN, Number.NaN] },
      { str: '\u0000\u0001', width: -1, height: -1, transform: [1, 0, 0, 1, 0, 0] },
      { str: '\u00a0\u00a0', hasEOL: true },
      { str: 'tail', width: Number.POSITIVE_INFINITY, transform: [] },
    ];

    expect(() => normalizeTextItems(hostile)).not.toThrow();
    expect(normalizeTextItems(hostile).startsWith('x')).toBe(true);
  });
});

describe('hasTextLayer', () => {
  it('is true only when non-whitespace text exists', () => {
    expect(hasTextLayer('Ramipril')).toBe(true);
    expect(hasTextLayer('  5 mg \n')).toBe(true);
    expect(hasTextLayer('')).toBe(false);
    expect(hasTextLayer(' \n\t\r\f ')).toBe(false);
    expect(hasTextLayer('\u00a0\u2007')).toBe(false);
  });
});

describe('hasPdfMagic', () => {
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

  it('accepts a %PDF- header at offset 0', () => {
    expect(hasPdfMagic(encode('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfMagic(encode('%PDF-'))).toBe(true);
  });

  it('rejects a short buffer, a different header and an offset header', () => {
    expect(hasPdfMagic(new Uint8Array())).toBe(false);
    expect(hasPdfMagic(encode('%PDF'))).toBe(false);
    expect(hasPdfMagic(encode('PK\u0003\u0004'))).toBe(false);
    expect(hasPdfMagic(encode(' %PDF-1.4'))).toBe(false);
  });
});
