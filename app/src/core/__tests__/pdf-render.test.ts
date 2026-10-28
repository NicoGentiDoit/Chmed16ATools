/**
 * `pageRenderScale` decision table.
 *
 * The canvas adapter is DOM-dependent and stays out of the node test run; the
 * scale math is pure, so the three branches that guard against hostile PDFs are
 * pinned here: the DPI cap, the pixel-budget reduction and the fail-closed
 * sentinel for an unusable page box.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OCR_DPI,
  INVALID_PAGE_SCALE,
  MAX_RENDER_PIXELS,
  MAX_RENDER_SCALE,
  pageRenderScale,
} from '../pdf-render';

describe('pageRenderScale', () => {
  it('uses the default 200 DPI on a page that fits the pixel budget', () => {
    const scale = pageRenderScale({ width: 595, height: 842 });

    expect(scale).toBeCloseTo(DEFAULT_OCR_DPI / 72, 10);
    expect(595 * 842 * scale * scale).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });

  it('caps the DPI-derived scale at MAX_RENDER_SCALE', () => {
    // 600 DPI would be 8.33 device pixels per point; a 100x100 page stays well
    // inside the pixel budget, so only the cap can limit it.
    const scale = pageRenderScale({ width: 100, height: 100 }, { targetDpi: 600 });

    expect(scale).toBe(MAX_RENDER_SCALE);
    expect(100 * 100 * scale * scale).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });

  it('reduces the scale so a huge page still fits the pixel budget', () => {
    const width = 10_000;
    const height = 10_000;
    const scale = pageRenderScale({ width, height });

    expect(scale).toBeCloseTo(Math.sqrt(MAX_RENDER_PIXELS / (width * height)), 10);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(DEFAULT_OCR_DPI / 72);
    expect(width * height * scale * scale).toBeCloseTo(MAX_RENDER_PIXELS, 6);
  });

  it('honours an explicit pixel budget', () => {
    const maxPixels = 1_000_000;
    const scale = pageRenderScale({ width: 2000, height: 2000 }, { maxPixels });

    expect(2000 * 2000 * scale * scale).toBeCloseTo(maxPixels, 6);
  });

  it('fails closed on non-finite or non-positive page sizes', () => {
    const invalidPages = [
      { width: 0, height: 800 },
      { width: 600, height: 0 },
      { width: -595, height: 842 },
      { width: 595, height: -842 },
      { width: Number.NaN, height: 842 },
      { width: 595, height: Number.NaN },
      { width: Number.POSITIVE_INFINITY, height: 842 },
      { width: 595, height: Number.POSITIVE_INFINITY },
      { width: Number.NEGATIVE_INFINITY, height: Number.NEGATIVE_INFINITY },
    ];

    for (const page of invalidPages) {
      expect(pageRenderScale(page), JSON.stringify(page)).toBe(INVALID_PAGE_SCALE);
      // The sentinel is a failure, never a scale to render at.
      expect(pageRenderScale(page)).toBe(0);
    }
  });

  it('falls back to the defaults for unusable option values', () => {
    const page = { width: 100, height: 100 };

    expect(pageRenderScale(page, { targetDpi: Number.NaN })).toBe(
      pageRenderScale(page),
    );
    expect(pageRenderScale(page, { maxPixels: 0 })).toBe(pageRenderScale(page));
    expect(pageRenderScale(page, { maxPixels: -1 })).toBe(pageRenderScale(page));
  });
});
