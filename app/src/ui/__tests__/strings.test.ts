/**
 * Strings integrity.
 *
 * All user-visible text comes from `STRINGS`, so a broken entry means a blank
 * or half-translated UI. Panels are type-checked against the key union, and the
 * snapshot below makes adding/removing/renaming a key a deliberate change.
 */

import { describe, expect, it } from 'vitest';

import { STRINGS, format, text } from '../strings';

/** Declaration order, i.e. the order of `STRINGS` in `strings.ts`. */
const EXPECTED_KEYS = [
  'appTitle',
  'appDescription',
  'disclaimer',
  'tablistLabel',
  'tabJsonToChmed',
  'tabChmedToJson',
  'tabPdfToChmed',
  'jsonInputLabel',
  'jsonInputHint',
  'validateJson',
  'encodeToChmed',
  'validationHeading',
  'resultsHeading',
  'errorsLabel',
  'warningsLabel',
  'noFindings',
  'notValidated',
  'emptyInput',
  'analysisFailed',
  'clear',
  'clearInputAccessibleName',
  'clearOutputAccessibleName',
  'chmedOutputHeading',
  'chmedOutputLabel',
  'chmedOutputHint',
  'copy',
  'copyChmedAccessibleName',
  'download',
  'downloadChmedAccessibleName',
  'downloadPng',
  'downloadPngAccessibleName',
  'copied',
  'copyFailed',
  'chmedFilename',
  'jsonFilename',
  'qrFilename',
  'qrHeading',
  'qrEcLabel',
  'qrEcHint',
  'qrAriaLabel',
  'qrInfo',
  'qrOverflow',
  'qrEmpty',
  'qrPngFailed',
  'chmedInputLabel',
  'chmedInputHint',
  'decodeToJson',
  'scanHeading',
  'scanFileLabel',
  'scanFileHint',
  'scanNoQr',
  'scanImageFailed',
  'scanSuccess',
  'cameraStart',
  'cameraStop',
  'cameraPreview',
  'cameraPermissionHint',
  'cameraUnavailable',
  'jsonOutputHeading',
  'jsonOutputLabel',
  'jsonOutputHint',
  'copyJsonAccessibleName',
  'downloadJsonAccessibleName',
  'pdfFileLabel',
  'pdfFileHint',
  'pdfProcess',
  'pdfIdle',
  'pdfProcessing',
  'pdfSuccess',
  'pdfFindingsHeading',
  'pdfSuccessTextLayer',
  'pdfSuccessOcr',
  'pdfSuccessValidated',
  'pdfStageExtract',
  'pdfStageOcr',
  'pdfStageParse',
  'pdfStageParseValues',
  'pdfStageValidate',
  'pdfStageEncode',
  'pdfUnexpected',
  'pdfReadFailed',
  'pdfFileTooLarge',
  'pdfJsonOutputHeading',
  'pdfJsonOutputLabel',
  'pdfDraftHeading',
  'pdfDraftHint',
  'pdfDraftStatus',
  'pdfQrEmpty',
  'iconCheckLabel',
  'iconAlertLabel',
  'iconXLabel',
  'iconEyeLabel',
  'iconEyeOffLabel',
  'iconDownloadLabel',
  'iconCopyLabel',
  'iconCameraLabel',
  'iconUploadLabel',
  'iconQrLabel',
  'workbenchSubtitle',
  'skipToContent',
  'versionBadge',
  'homeHeading',
  'homeCardJsonDescription',
  'homeCardJsonBadge',
  'homeCardChmedDescription',
  'homeCardChmedBadge',
  'homeCardPdfDescription',
  'homeCardPdfBadge',
  'openFlowLabel',
  'infoLabel',
  'clearJsonOutputAccessibleName',
  'clearChmedOutputAccessibleName',
  'jsonInputDragHint',
  'dropFileUnsupported',
  'dropFileTooLarge',
  'dropMultipleFiles',
  'dropReadFailed',
  'jsonViewGroupLabel',
  'jsonViewStructured',
  'jsonViewRaw',
  'jsonDocumentSection',
  'jsonSectionItem',
  'jsonSectionItems',
  'jsonSectionKey',
  'jsonSectionKeys',
  'jsonSectionEmpty',
  'jsonTypeString',
  'jsonTypeNumber',
  'jsonTypeBoolean',
  'jsonTypeNull',
  'jsonTypeUnknown',
  'pdfStepIndicatorLabel',
  'pdfStepOf',
  'pdfStep1Label',
  'pdfStep2Label',
  'pdfStep3Label',
  'pdfPreviewHeading',
  'pdfPreviewAriaLabel',
  'pdfPreviewFailed',
  'pdfReviewCaption',
  'pdfReviewFieldHeader',
  'pdfReviewValueHeader',
  'pdfReviewStatusHeader',
  'pdfReviewPositionHeader',
  'pdfReviewIdHeader',
  'pdfReviewUnitHeader',
  'pdfReviewInstructionsHeader',
  'statusRecognized',
  'statusToVerify',
  'statusAbsent',
  'reviewValuePlaceholder',
  'reviewEditableHint',
  'reviewCellAriaLabel',
  'reviewMedicamentRow',
  'reviewInvalidEdit',
  'exportRecapHeading',
  'recapPatientLabel',
  'recapPrescriberLabel',
  'recapMedicamentsLabel',
  'recapExtractionLabel',
  'recapEditsLabel',
  'recapPatientBorn',
  'recapEdited',
  'recapValid',
  'recapBlocked',
  'taskHeading',
  'taskAddRequired',
  'taskGoToField',
  'taskFieldFallback',
  'technicalDetailsLabel',
  'reviewRequiredCount',
  'reviewRequiredBlocked',
  'recapFixField',
  'advisoryGlnHint',
  'advisoryDateFormatHint',
  'advisoryRequiredHint',
  'jsonMissingRequired',
  'taskGoToSectionData',
  'taskAddSectionData',
] as const;

describe('UI strings', () => {
  it('has no empty values', () => {
    for (const [key, value] of Object.entries(STRINGS)) {
      expect(value.trim(), `string "${key}" must not be empty`).not.toBe('');
    }
  });

  it('keeps a stable key set', () => {
    expect(Object.keys(STRINGS)).toEqual([...EXPECTED_KEYS]);
  });

  it('differentiates an unrecognized layout from unreadable printed values', () => {
    // The parse-stage headline has two truthful outcomes (fix round 4): the
    // layout was not found at all, or it was found but its values were not
    // readable. Both keys must stay stable and distinct.
    expect(text('pdfStageParse')).toBe('No eMediplan prescription was found in the text.');
    expect(text('pdfStageParseValues')).toBe(
      'The eMediplan layout was recognised, but some printed values could not be read; review the errors.',
    );
    expect(text('pdfStageParseValues')).not.toBe(text('pdfStageParse'));
  });

  it('resolves every key through text()', () => {
    for (const key of EXPECTED_KEYS) {
      expect(text(key)).toBe(STRINGS[key]);
    }
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(format('Version {version} · {bytes} UTF-8 bytes', { version: 3, bytes: 42 })).toBe(
      'Version 3 · 42 UTF-8 bytes',
    );
    expect(format('level {level}', {})).toBe('level {level}');
  });

  it('gives the PDF panel two distinct clear-output names', () => {
    // The panel has one Clear button per output area, so the two accessible
    // names must not collide (the shared `clearOutputAccessibleName` stays for
    // the single-output panels).
    expect(text('clearJsonOutputAccessibleName')).not.toBe(text('clearChmedOutputAccessibleName'));
  });
});

describe('PDF step and preview strings (phase 7a)', () => {
  it('names three distinct steps and positions them in text', () => {
    const labels = [text('pdfStep1Label'), text('pdfStep2Label'), text('pdfStep3Label')];
    expect(labels).toEqual(['Upload', 'Review', 'Export']);
    expect(new Set(labels).size).toBe(3);
    // The indicator must not rely on colour: the position is spelled out.
    expect(format(text('pdfStepOf'), { current: 2 })).toBe('Step 2 of 3');
  });

  it('describes the preview and its non-blocking failure', () => {
    expect(text('pdfPreviewAriaLabel')).not.toBe('');
    expect(text('pdfPreviewFailed')).toBe(
      'The first page could not be previewed. Processing is unaffected.',
    );
  });
});

describe('PDF review table strings (phase 7b)', () => {
  it('names three distinct, non-colour field statuses and a placeholder', () => {
    const statuses = [text('statusRecognized'), text('statusToVerify'), text('statusAbsent')];
    expect(statuses).toEqual(['Recognized', 'To verify', 'Absent']);
    // A status is always a word; the icon and the tint only reinforce it.
    expect(new Set(statuses).size).toBe(3);
    expect(text('reviewValuePlaceholder')).toBe('—');
  });

  it('builds the section heading and both table captions from one template', () => {
    const caption = (section: string): string =>
      format(text('pdfReviewCaption'), { section });
    expect(caption('prescription data')).toBe('Review extracted prescription data');
    expect(caption('patient and prescriber data')).toBe(
      'Review extracted patient and prescriber data',
    );
    expect(caption('medicaments')).toBe('Review extracted medicaments');
    expect(text('pdfReviewIdHeader')).toBe('Id / GTIN');
  });
});

describe('PDF inline editing strings (phase 7c)', () => {
  it('states when an edit is committed and labels a cell by field and row', () => {
    // The commit is on leaving the field, not on every keystroke: the hint is
    // the only place the user learns that, so it must actually say it.
    expect(text('reviewEditableHint')).toMatch(/leave the field/i);
    expect(format(text('reviewCellAriaLabel'), { field: 'Birthdate', row: 'Patient' })).toBe(
      'Edit Birthdate (Patient)',
    );
    // "First name" exists for the patient and for the prescriber: the row hint
    // is what keeps the two accessible names distinct.
    const patientFirst = format(text('reviewCellAriaLabel'), {
      field: 'First name',
      row: 'Patient',
    });
    const prescriberFirst = format(text('reviewCellAriaLabel'), {
      field: 'First name',
      row: 'Prescriber',
    });
    expect(patientFirst).not.toBe(prescriberFirst);
  });

  it('names a medication row and reports an edit that could not be checked', () => {
    expect(format(text('reviewMedicamentRow'), { position: 2 })).toBe('Medicament 2');
    expect(text('reviewInvalidEdit')).toBe(
      'The edited prescription could not be checked, so nothing was encoded.',
    );
    // A check failure is not a schema error and must not reuse a stage wording.
    expect(text('reviewInvalidEdit')).not.toBe(text('pdfStageValidate'));
  });
});

describe('PDF export recap strings (phase 7d)', () => {
  it('gives the recap its own heading and row labels', () => {
    // The recap is a third-step summary, not a second CHMED output section:
    // reusing that heading would make the two blocks indistinguishable.
    expect(text('exportRecapHeading')).toBe('Export summary');
    expect(text('exportRecapHeading')).not.toBe(text('chmedOutputHeading'));
    expect(text('exportRecapHeading')).not.toBe(text('pdfJsonOutputHeading'));

    const labels = [
      text('recapPatientLabel'),
      text('recapPrescriberLabel'),
      text('recapMedicamentsLabel'),
      text('recapExtractionLabel'),
      text('recapEditsLabel'),
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('states the patient birthdate, the edit badge and both verdicts as text', () => {
    expect(format(text('recapPatientBorn'), { name: 'Anna Muster', date: '1980-01-31' })).toBe(
      'Anna Muster · born 1980-01-31',
    );
    expect(text('recapEdited')).toBe('Edited');

    // The two verdicts must stay distinct and spell out their counts: colour is
    // never the only signal, and "blocked" is never mistaken for "valid".
    expect(format(text('recapValid'), { warnings: 2 })).toBe('Valid (2 warnings)');
    expect(format(text('recapBlocked'), { errors: 1, warnings: 2 })).toBe(
      'Blocked: 1 errors, 2 warnings',
    );
    expect(text('recapValid')).not.toBe(text('recapBlocked'));
  });
});

describe('guided task strings (phase 8a)', () => {
  it('names tasks and their field links as text', () => {
    // The task layer leads with a verb and always names the target; the link
    // spells out where it goes, so two tasks are never announced identically.
    expect(format(text('taskAddRequired'), { field: 'prescriber' })).toBe('Add prescriber');
    expect(format(text('taskGoToField'), { field: 'prescriber' })).toBe(
      'Go to prescriber field',
    );
    expect(format(text('taskGoToField'), { field: 'organisation' })).not.toBe(
      format(text('taskGoToField'), { field: 'prescriber' }),
    );
    expect(text('technicalDetailsLabel')).toBe('Technical details');
    expect(text('taskFieldFallback')).not.toBe('');
  });

  it('states the honest required count and the blocking suffix', () => {
    expect(format(text('reviewRequiredCount'), { done: 3, total: 8 })).toBe(
      '3 of 8 required fields completed',
    );
    // Gated export must never read as complete: the suffix always says so.
    expect(format(text('reviewRequiredBlocked'), { n: 2 })).toBe(
      'Export still blocked: 2 blocking issues',
    );
    expect(format(text('recapFixField'), { section: 'prescriber' })).toBe(
      'Fix prescriber data',
    );
  });
});

describe('advisory inline hint strings (phase 8b)', () => {
  it('guides the GLN shape, the birthdate format and required emptiness', () => {
    // The GLN hint names the shape and who confirms it: the advisory is not the
    // verdict, and the wording must not pretend otherwise.
    expect(text('advisoryGlnHint')).toBe(
      'GLN must be a 13-digit number — the validator will confirm on save.',
    );
    expect(text('advisoryGlnHint')).toContain('13-digit');
    expect(text('advisoryGlnHint')).toMatch(/validator/i);
    expect(text('advisoryDateFormatHint')).toBe('Use the YYYY-MM-DD format.');
    expect(text('advisoryRequiredHint')).toContain('Required');
  });

  it('keeps the three hints distinct from each other and from a verdict', () => {
    // One line per input: the hints never collapse into the same sentence, and
    // none of them reuses a status or verdict wording (they are guidance, not a
    // judgement — the core findings and recap own that language).
    const hints = [
      text('advisoryGlnHint'),
      text('advisoryDateFormatHint'),
      text('advisoryRequiredHint'),
    ];
    expect(new Set(hints).size).toBe(hints.length);
    for (const hint of hints) {
      expect(hint).not.toBe(text('statusToVerify'));
      expect(hint).not.toBe(text('recapBlocked'));
      expect(hint).not.toBe(text('pdfStageValidate'));
    }
  });
});

describe('structured JSON missing-required marks (phase 8c)', () => {
  it('marks a section with words, not a bare symbol', () => {
    // The viewer's mark pairs a glyph with this label, so the state is readable
    // as text and never depends on colour or on an icon alone.
    expect(text('jsonMissingRequired')).toBe('missing required properties');
    expect(text('jsonMissingRequired')).not.toBe(text('statusAbsent'));
  });

  it('reuses the existing view-toggle labels instead of adding new ones', () => {
    // The PDF panel mirrors the CHMED16A → JSON toggle; both flows share these
    // keys, so phase 3 adds exactly one string.
    expect(text('jsonViewGroupLabel')).toBe('Output view');
    expect(text('jsonViewStructured')).toBe('Structured');
    expect(text('jsonViewRaw')).toBe('Raw JSON');
  });
});

describe('guided task section-level labels (phase 8d)', () => {
  it('names the section for a required key the table never renders', () => {
    // HcOrg Street/Zip/City (and a medicament's IdType) have no editable row:
    // the link and the action name the section, never a field the page lacks.
    expect(text('taskGoToSectionData')).toBe('Go to {section} data');
    expect(text('taskAddSectionData')).toBe('Add {section} data');
    expect(format(text('taskGoToSectionData'), { section: 'organisation' })).toBe(
      'Go to organisation data',
    );
    expect(format(text('taskAddSectionData'), { section: 'organisation' })).toBe(
      'Add organisation data',
    );
    // The templates take a section, never a field: no `{field}` placeholder may
    // survive a call that only supplies the section.
    expect(text('taskGoToSectionData')).not.toContain('{field}');
    expect(text('taskAddSectionData')).not.toContain('{field}');
    // A rendered field keeps the field-level wording; the two never collapse.
    expect(format(text('taskGoToField'), { field: 'organisation' })).not.toBe(
      format(text('taskGoToSectionData'), { section: 'organisation' }),
    );
  });
});
