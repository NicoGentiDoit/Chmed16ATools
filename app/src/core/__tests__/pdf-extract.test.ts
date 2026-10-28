import { describe, expect, it } from 'vitest';

import { hasPdfMagic, hasTextLayer, normalizeTextItems, tabulateLayout } from '../pdf-extract';
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

/**
 * Measured item of the real HCI sample (`items-geometry.txt` of the probe):
 * `[y, x, text]` in device space, y upwards. Widths are irrelevant to the
 * tabulator (it bands by x/y only) and are given a plausible advance.
 */
type Measured = readonly [y: number, x: number, text: string];

function measuredItems(entries: readonly Measured[]): PdfTextItemLike[] {
  return entries.map(([y, x, str]) => ({
    str,
    width: Math.max(6, str.length * 5),
    height: 10,
    transform: [1, 0, 0, 1, x, y],
  }));
}

/** The real page, coordinates verbatim from the probe. */
const REAL_PAGE: readonly Measured[] = [
  [543.7, 237.4, 'Peter Muster'],
  [531.7, 237.4, '01.11.1943 (M)'],
  [522.1, 237.4, '2, Seidenhofstrasse, Altstadt, 6002 Luzern'],
  [504.1, 237.4, 'Körpergrösse / Gewicht:'],
  [504.1, 321.5, '180 cm'],
  [504.1, 344.3, '/ 81 kg'],
  [502.9, 39.3, 'Der Schweizer Medikationsplan'],
  [495.7, 237.4, 'Niereninsuffizienz:'],
  [495.7, 321.5, 'leicht'],
  [487.3, 237.4, 'Diabetes:'],
  [487.3, 321.5, 'Unbekannt'],
  [478.8, 237.4, 'Allergie(n):'],
  [478.8, 321.5, 'Penicillin-Allergie, z.B. Amoxicillin, Flucloxacillin,'],
  [470.4, 321.5, 'Piperacillin'],
  [552.7, 495.6, 'erstellt von :'],
  [444.6, 33.3, 'Ausstellungsdatum: 27.10.2026 14:39'],
  [420.6, 39.9, 'Medikament'],
  [420.6, 195.4, 'Morgen'],
  [420.6, 236.8, 'Mittag'],
  [420.6, 272.8, 'Abend'],
  [425.4, 310.1, 'zur'],
  [415.8, 310.1, 'Nacht'],
  [420.6, 347.9, 'Einheit'],
  [420.6, 421.1, 'Von'],
  [420.6, 478.8, 'Bis u. mit'],
  [420.6, 536.4, 'Anleitung'],
  [420.6, 660.1, 'Grund'],
  [420.6, 735.1, 'Verordnet durch'],
  [392.4, 39.9, 'VALIUM Inj Lös 10 mg/2ml'],
  [382.8, 39.9, 'i.m./i.v.'],
  [374.4, 39.9, 'Diazepam'],
  [383.4, 207.7, '2'],
  [383.4, 247.3, '-'],
  [383.4, 283.9, '-'],
  [383.4, 321.5, '-'],
  [383.4, 347.9, 'ml'],
  [383.4, 421.1, '03.11.2015'],
  [383.4, 536.4, 'nur i.m., nur durch instruierte'],
  [373.8, 536.4, 'Personen!'],
  [383.4, 660.1, 'Beruhigung'],
  [388.2, 735.1, 'Dr. Example Karl,'],
  [378.6, 735.1, 'Wängi'],
  [350.4, 39.9, 'SORTIS Filmtabl 20 mg'],
  [342, 39.9, 'Atorvastatin'],
  [346.2, 208.6, '-'],
  [346.2, 247.3, '-'],
  [346.2, 283, '1'],
  [346.2, 321.5, '-'],
  [351, 347.9, 'Milligramm'],
  [341.4, 347.9, 'Atorvastatin'],
  [346.2, 421.1, '01.03.2016'],
  [346.2, 660.1, 'Cholesterinsenker'],
  [351, 735.1, 'Dr. Arzt Hans,'],
  [341.4, 735.1, 'Münchenhausen'],
  [319.2, 39.9, 'CO-DIOVAN Filmtabl'],
  [309.6, 39.9, '160/12.5 mg'],
  [301.1, 39.9, 'Valsartan, Hydrochlorothiazid'],
  [310.2, 207.7, '1'],
  [310.2, 247.3, '-'],
  [310.2, 283.9, '-'],
  [310.2, 321.5, '-'],
  [310.2, 347.9, 'Stück'],
  [310.2, 421.1, '01.03.2016'],
  [310.2, 660.1, 'Bluthochdruck'],
  [315, 735.1, 'Dr. Arzt Hans,'],
  [305.4, 735.1, 'Münchhausen'],
  [278.9, 39.3, 'Reservemedikation'],
  [251.9, 39.9, 'Medikament'],
  [251.9, 205, 'Morgen'],
  [251.9, 246.4, 'Mittag'],
  [251.9, 282.4, 'Abend'],
  [256.7, 319.7, 'zur'],
  [247.1, 319.7, 'Nacht'],
  [251.9, 365.3, 'Einheit'],
  [251.9, 404.3, 'Von'],
  [251.9, 461.9, 'Bis u. mit'],
  [251.9, 519.6, 'Anleitung'],
  [251.9, 690.7, 'Grund'],
  [256.7, 742.9, 'Verordnet'],
  [247.1, 742.9, 'durch'],
  [224.3, 39.9, 'PANADOL S Filmtabl 500 mg'],
  [214.7, 39.9, '(#)'],
  [206.3, 39.9, 'Paracetamol'],
  [215.3, 218.2, '-'],
  [215.3, 256.9, '-'],
  [215.3, 293.6, '-'],
  [215.3, 335, '-'],
  [215.3, 365.3, 'Stück'],
  [215.3, 404.3, '09.09.2016'],
  [215.3, 519.6, 'bis zu max. 4 mal täglich 1 Tablette'],
  [205.7, 519.6, 'einnehmen'],
  [215.3, 690.7, 'Schmerzen'],
  [215.3, 742.9, 'Selbstmedikation'],
  [178.7, 39.9, 'Essigwickel'],
  [178.7, 218.2, '-'],
  [178.7, 256.9, '-'],
  [178.7, 293.6, '-'],
  [178.7, 335, '-'],
  [178.7, 365.3, '-'],
  [178.7, 404.3, '09.09.2016'],
  [173.9, 519.6, 'bei Bedarf'],
  [178.7, 690.7, 'Fieber'],
  [178.7, 742.9, 'Selbstmedikation'],
  [139.7, 33.3, 'Bemerkung :'],
  [114.4, 39.3, 'Der Patient ist vom Medikationsplan begeistert!'],
  [22.1, 34.5, 'Peter Muster (01.11.1943)'],
  [22.1, 366.5, 'eMediplan by HCI Solutions AG'],
  [22.1, 457.1, '(V1.0)'],
  [22.1, 769.9, 'Seite 1 von 1'],
];

/** One pipe-separated line per printed row, in header order. */
const REAL_PAGE_ROWS = [
  'erstellt von :',
  'Peter Muster',
  '01.11.1943 (M)',
  '2, Seidenhofstrasse, Altstadt, 6002 Luzern',
  'Körpergrösse / Gewicht: 180 cm / 81 kg Der Schweizer Medikationsplan',
  'Niereninsuffizienz: leicht',
  'Diabetes: Unbekannt',
  'Allergie(n): Penicillin-Allergie, z.B. Amoxicillin, Flucloxacillin,',
  'Piperacillin',
  'Ausstellungsdatum: 27.10.2026 14:39',
  'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anleitung | Grund | Verordnet durch',
  'VALIUM Inj Lös 10 mg/2ml i.m./i.v. Diazepam | 2 | - | - | - | ml | 03.11.2015 |  | nur i.m., nur durch instruierte Personen! | Beruhigung | Dr. Example Karl, Wängi',
  'SORTIS Filmtabl 20 mg Atorvastatin | - | - | 1 | - | Milligramm Atorvastatin | 01.03.2016 |  |  | Cholesterinsenker | Dr. Arzt Hans, Münchenhausen',
  'CO-DIOVAN Filmtabl 160/12.5 mg Valsartan, Hydrochlorothiazid | 1 | - | - | - | Stück | 01.03.2016 |  |  | Bluthochdruck | Dr. Arzt Hans, Münchhausen',
  'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anleitung | Grund | Verordnet',
  'PANADOL S Filmtabl 500 mg (#) Paracetamol | - | - | - | - | Stück | 09.09.2016 |  | bis zu max. 4 mal täglich 1 Tablette einnehmen | Schmerzen | Selbstmedikation',
  'Essigwickel | - | - | - | - | - | 09.09.2016 |  | bei Bedarf | Fieber | Selbstmedikation',
];

describe('tabulateLayout', () => {
  it('rebuilds the real page geometry into one pipe-separated line per printed row', () => {
    const result = tabulateLayout(measuredItems(REAL_PAGE));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.text.split('\n')).toEqual(REAL_PAGE_ROWS);
    expect(result.medicationTableCount).toBe(2);
    expect(result.medicationRowCount).toBe(5);
    expect(result.columnCount).toBe(11);
  });

  it('keeps a multi-line medication cell in one row and stops at the comment section', () => {
    const result = tabulateLayout(measuredItems(REAL_PAGE));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const lines = result.text.split('\n');

    // Four to five physical lines, one row: brand, application form, substance
    // and the wrapped instruction all belong to the VALIUM row.
    expect(lines).toContain(
      'VALIUM Inj Lös 10 mg/2ml i.m./i.v. Diazepam | 2 | - | - | - | ml | 03.11.2015 |  | nur i.m., nur durch instruierte Personen! | Beruhigung | Dr. Example Karl, Wängi',
    );
    // The `(#)` placeholder and the substance line are part of the PANADOL row.
    expect(lines).toContain(
      'PANADOL S Filmtabl 500 mg (#) Paracetamol | - | - | - | - | Stück | 09.09.2016 |  | bis zu max. 4 mal täglich 1 Tablette einnehmen | Schmerzen | Selbstmedikation',
    );
    // Nothing after `Bemerkung :` / the footer is consumed, and the
    // `Reservemedikation` title is a marker rather than a medication row.
    expect(lines.some((line) => line.includes('begeistert'))).toBe(false);
    expect(lines.some((line) => line.startsWith('Reservemedikation'))).toBe(false);
    expect(lines.some((line) => line.includes('Seite 1 von 1'))).toBe(false);
  });

  it('derives the columns per table, so the drifting reserve table still lines up', () => {
    const result = tabulateLayout(measuredItems(REAL_PAGE));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // Table 2 columns drift by up to 30 pt (Einheit 347.9 -> 365.3, Von
    // 421.1 -> 404.3): both rows land in the same cells.
    expect(result.text.split('\n')[15]).toBe(
      'PANADOL S Filmtabl 500 mg (#) Paracetamol | - | - | - | - | Stück | 09.09.2016 |  | bis zu max. 4 mal täglich 1 Tablette einnehmen | Schmerzen | Selbstmedikation',
    );
    expect(result.text.split('\n')[16]).toBe(
      'Essigwickel | - | - | - | - | - | 09.09.2016 |  | bei Bedarf | Fieber | Selbstmedikation',
    );
  });

  it('merges a header band that is further away than one row tolerance', () => {
    const wrapped: readonly Measured[] = [
      [552.7, 495.6, 'erstellt von :'],
      [444.6, 33.3, 'Ausstellungsdatum: 27.10.2026 14:39'],
      // Header printed as two bands 16 pt apart (within HEADER_MERGE_GAP 18).
      [420.6, 39.9, 'Medikament'],
      [420.6, 195.4, 'Morgen'],
      [420.6, 236.8, 'Mittag'],
      [420.6, 272.8, 'Abend'],
      [425.4, 310.1, 'zur'],
      [404.6, 310.1, 'Nacht'],
      [404.6, 347.9, 'Einheit'],
      [404.6, 421.1, 'Von'],
      [404.6, 478.8, 'Bis u. mit'],
      [404.6, 536.4, 'Anleitung'],
      [404.6, 660.1, 'Grund'],
      [404.6, 735.1, 'Verordnet durch'],
      [380, 39.9, 'Ramipril 5 mg'],
      [380, 207.7, '1'],
      [380, 247.3, '-'],
      [380, 283.9, '-'],
      [380, 321.5, '-'],
      [380, 347.9, 'Stück'],
      [380, 421.1, '01.09.2026'],
      [380, 536.4, 'nach dem Essen'],
      [380, 660.1, 'Bluthochdruck'],
      [380, 735.1, 'Dr. med. A Muster'],
    ];

    const result = tabulateLayout(measuredItems(wrapped));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const lines = result.text.split('\n');
    expect(lines[2]).toBe(
      'Medikament | Morgen | Mittag | Abend | Nacht | Einheit | Von | Bis u. mit | Anleitung | Grund | Verordnet durch',
    );
    expect(lines[3]).toBe(
      'Ramipril 5 mg | 1 | - | - | - | Stück | 01.09.2026 |  | nach dem Essen | Bluthochdruck | Dr. med. A Muster',
    );
    expect(result.medicationTableCount).toBe(1);
    expect(result.medicationRowCount).toBe(1);
  });

  it('reads plain header lines per baseline, not per row band', () => {
    const result = tabulateLayout(measuredItems(REAL_PAGE));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const lines = result.text.split('\n');
    // 495.7 and 487.3 are one band (8.4 pt) but two printed `Label: value`
    // lines, so they must stay separate.
    expect(lines).toContain('Niereninsuffizienz: leicht');
    expect(lines).toContain('Diabetes: Unbekannt');
    expect(lines).toContain('Piperacillin');
  });

  it('fails closed when the page has no geometry or no medication header', () => {
    expect(tabulateLayout([])).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'no-geometry' })],
    });
    expect(tabulateLayout([{ type: 'beginMarkedContent' }, { str: 'x' }])).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'no-geometry' })],
    });

    const noHeader = measuredItems([
      [700, 100, 'Peter Muster'],
      [690, 100, 'Born on: 05.05.1980 (F)'],
    ]);
    expect(tabulateLayout(noHeader)).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'no-medication-header' })],
    });
  });

  it('fails closed on a page with too many rows', () => {
    const result = tabulateLayout(measuredItems(REAL_PAGE), { maxRows: 2 });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: 'layout-too-complex' })],
    });
  });

  it('honours a custom row tolerance', () => {
    const result = tabulateLayout(measuredItems(REAL_PAGE), { rowTolerance: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // One row per printed baseline: the multi-line cells split, so many more
    // rows are emitted than the five printed medication rows.
    expect(result.medicationRowCount).toBeGreaterThan(5);
  });

  it('does not throw on hostile item shapes', () => {
    const hostile: PdfTextItemLike[] = [
      { str: 'x'.repeat(10_000), transform: [0, 0, 0, 0, Number.NaN, Number.NaN] },
      { str: '\u0000\u0001', width: -1, height: -1, transform: [1, 0, 0, 1, 0, 0] },
      { str: 'Medikament', transform: [1, 0, 0, 1, 0, 0] },
      { str: 'Morgen', transform: [1, 0, 0, 1, 100, 0] },
      { str: 'Nacht', transform: [1, 0, 0, 1, 200, 0] },
      { str: 'Grund', transform: [1, 0, 0, 1, 300, 0] },
    ];

    expect(() => tabulateLayout(hostile)).not.toThrow();
  });
});
