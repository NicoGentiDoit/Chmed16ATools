/**
 * Review-table field labels.
 *
 * Only the pure mapping is covered: building the table needs a DOM and the
 * interactive behaviour (edit → re-validate → relabel) is exercised through the
 * panel. What is asserted here is what a screen-reader user depends on: every
 * whitelisted field has a real catalogue label, the two labels that must not be
 * translated still read as their JSON keys, and the gender row keeps spelling out
 * the integers the schema stores.
 */

import { describe, expect, it } from 'vitest';

import { reviewFieldLabel } from '../review-table';
import { text } from '../../strings';

describe('review table field labels', () => {
  it('resolves every whitelisted patient field from the catalogue', () => {
    expect(reviewFieldLabel('Patient', 'Lng')).toBe(text('pdfReviewFieldLanguage'));
    expect(reviewFieldLabel('Patient', 'FName')).toBe(text('pdfReviewFieldFirstName'));
    expect(reviewFieldLabel('Patient', 'LName')).toBe(text('pdfReviewFieldLastName'));
    expect(reviewFieldLabel('Patient', 'BDt')).toBe(text('pdfReviewFieldBirthdate'));
    expect(reviewFieldLabel('Patient', 'Gender')).toBe(text('pdfReviewFieldGender'));
  });

  it('names the patient fields in words, not JSON keys', () => {
    expect(reviewFieldLabel('Patient', 'FName')).toBe('First name');
    expect(reviewFieldLabel('Patient', 'FName')).not.toBe('FName');
    // Two different fields never share a row label: the accessible name of a
    // cell is built from it ("Edit <field> (<row>)").
    expect(reviewFieldLabel('Patient', 'FName')).not.toBe(reviewFieldLabel('Patient', 'LName'));
  });

  it('spells out the encoded gender integers so the number is readable', () => {
    const gender = reviewFieldLabel('Patient', 'Gender');
    expect(gender).toContain('1 = ');
    expect(gender).toContain('2 = ');
  });

  it('reuses the column headers as the medicament row labels', () => {
    expect(reviewFieldLabel('Medicaments', 'Id')).toBe(text('pdfReviewIdHeader'));
    expect(reviewFieldLabel('Medicaments', 'Unit')).toBe(text('pdfReviewUnitHeader'));
    expect(reviewFieldLabel('Medicaments', 'AppInstr')).toBe(text('pdfReviewInstructionsHeader'));
  });

  it('keeps an encoding enum and an unknown key as their JSON names', () => {
    // `IdType` is an encoded enum (1 = none, 2 = GTIN, 3 = pharmacode), not prose;
    // the same fallback covers a schema key this table does not label yet.
    expect(reviewFieldLabel('Medicaments', 'IdType')).toBe('IdType');
    expect(reviewFieldLabel('Patient', 'NotALabelledField')).toBe('NotALabelledField');
  });
});
