/**
 * Every user-visible string of the tools UI.
 *
 * Keeping all text in one module means a later Italian localization only has to
 * translate this file: panels request keys through `text()`, so a missing key is
 * a compile error rather than a blank label. Templates use `{name}`
 * placeholders and are filled by `format()`.
 *
 * Wording stays short and factual; the app is a development/testing tool, never
 * a medical device (see `disclaimer`).
 */

export const STRINGS = {
  appTitle: 'CHMED16A Tools',
  appDescription:
    'Validate, encode, decode, generate and scan CHMED16A documents entirely in your browser.',
  disclaimer:
    'Development and testing tool only — not a certified medical device, not for clinical use. Your data never leaves this browser.',

  tablistLabel: 'Tool mode',
  tabJsonToChmed: 'JSON → CHMED16A',
  tabChmedToJson: 'CHMED16A → JSON',
  tabPdfToChmed: 'PDF → CHMED16A',

  jsonInputLabel: 'CHMED16A JSON document',
  jsonInputHint:
    'Paste or type a CHMED16A prescription document. Nothing is sent to a server.',
  validateJson: 'Validate JSON',
  encodeToChmed: 'Encode to CHMED16A',

  validationHeading: 'Validation results',
  resultsHeading: 'Decode and validation results',
  errorsLabel: 'Errors',
  warningsLabel: 'Warnings',
  noFindings: 'No problems found.',
  notValidated: 'Not checked yet.',
  emptyInput: 'Enter a document first.',
  analysisFailed: 'The document could not be analyzed.',
  clear: 'Clear',
  clearInputAccessibleName: 'Clear the input document',
  clearOutputAccessibleName: 'Clear the output result',

  chmedOutputHeading: 'Encoded CHMED16A string',
  chmedOutputLabel: 'CHMED16A string',
  chmedOutputHint: 'Read-only result. Use Copy or Download to reuse it.',
  copy: 'Copy',
  copyChmedAccessibleName: 'Copy encoded CHMED16A string',
  download: 'Download',
  downloadChmedAccessibleName: 'Download encoded CHMED16A string as a .txt file',
  downloadPng: 'Download PNG',
  downloadPngAccessibleName: 'Download the QR code as a PNG image',
  copied: 'Copied to the clipboard.',
  copyFailed: 'Clipboard unavailable. Select the text and copy it manually.',
  chmedFilename: 'chmed16a.txt',
  jsonFilename: 'chmed16a.json',
  qrFilename: 'chmed16a-qr.png',

  qrHeading: 'QR code',
  qrEcLabel: 'QR error-correction level',
  qrEcHint: 'Higher levels survive more damage but hold less data. Default M.',
  qrAriaLabel: 'CHMED16A QR code, error correction level {level}',
  qrInfo: 'Version {version} · {bytes} UTF-8 bytes',
  qrOverflow:
    'The document does not fit a QR code at error-correction level {level} ({bytes} UTF-8 bytes). Choose a lower level or shorten the document.',
  qrEmpty: 'Encode a document to see its QR code.',
  qrPngFailed:
    'The QR code could not be exported as a PNG image. Try again or take a screenshot of the preview.',

  chmedInputLabel: 'CHMED16A document',
  chmedInputHint:
    'Compressed (CHMED16A1…) and uncompressed (CHMED16A0…) documents are both accepted.',
  decodeToJson: 'Decode to JSON',

  scanHeading: 'Scan a QR code',
  scanFileLabel: 'QR code image file',
  scanFileHint:
    'PNG, JPEG or any image the browser can read. Upload always works; the camera is optional.',
  scanNoQr: 'No QR code found in that image. Try a sharper, closer photo.',
  scanImageFailed: 'The image could not be read. Choose a PNG or JPEG file.',
  scanSuccess: 'QR code read.',
  cameraStart: 'Start camera',
  cameraStop: 'Stop camera',
  cameraPreview: 'Camera preview',
  cameraPermissionHint:
    'The camera only starts when you press Start camera, and stops when you leave this tab.',
  cameraUnavailable:
    'Camera unavailable. Check the browser permission and that a camera is connected — or use the image upload instead.',

  jsonOutputHeading: 'Decoded JSON',
  jsonOutputLabel: 'Decoded JSON document',
  jsonOutputHint: 'Read-only, pretty-printed JSON.',
  copyJsonAccessibleName: 'Copy decoded JSON document',
  downloadJsonAccessibleName: 'Download decoded JSON document as a .json file',

  pdfFileLabel: 'eMediplan PDF document',
  pdfFileHint:
    'Printed eMediplan paper layout. Text-based PDFs are read directly; scanned PDFs are recognized offline, page by page.',
  pdfProcess: 'Process PDF',
  pdfIdle: 'Choose a PDF file to extract its ePrescription.',
  pdfProcessing:
    'Reading the PDF. Scanned documents are recognized offline and may take a while.',
  pdfSuccess: 'Prescription extracted from {pages} page(s).',
  pdfFindingsHeading: 'Extraction results',
  pdfSuccessTextLayer: 'Text read directly from the PDF text layer ({pages} page(s)).',
  pdfSuccessOcr: 'Text recognized from {pages} scanned page(s) with offline OCR.',
  pdfSuccessValidated: 'The extracted prescription is valid and was encoded successfully.',
  pdfStageExtract: 'The PDF could not be read.',
  pdfStageOcr: 'The scanned pages could not be recognized.',
  pdfStageParse: 'No eMediplan prescription was found in the text.',
  pdfStageParseValues:
    'The eMediplan layout was recognised, but some printed values could not be read; review the errors.',
  pdfStageValidate: 'The extracted prescription is not valid.',
  pdfStageEncode: 'The prescription could not be encoded.',
  pdfUnexpected: 'The PDF could not be processed.',
  pdfReadFailed: 'The selected file could not be read.',
  pdfFileTooLarge:
    'The selected PDF is larger than 25 MB. Choose a smaller file.',
  pdfJsonOutputHeading: 'Extracted ePrescription JSON',
  pdfJsonOutputLabel: 'ePrescription JSON',
  pdfDraftHeading: 'Draft ePrescription JSON (not encoded)',
  pdfDraftHint:
    'Draft — the parsed prescription is shown for review; fix the listed errors to enable the CHMED16A output.',
  pdfDraftStatus: 'Draft only: the extracted prescription is not valid, so no CHMED16A output was produced.',
  pdfQrEmpty: 'Extract a prescription to see its QR code.',

  /* ── icon accessible names (for aria-label on button wrappers) ── */
  iconCheckLabel: 'Success',
  iconAlertLabel: 'Warning',
  iconXLabel: 'Error',
  iconEyeLabel: 'Show',
  iconEyeOffLabel: 'Hide',
  iconDownloadLabel: 'Download',
  iconCopyLabel: 'Copy',
  iconCameraLabel: 'Camera',
  iconUploadLabel: 'Upload file',
  iconQrLabel: 'QR code',

  /* ── workbench shell: brand, skip link, home (appended in phase 2) ── */
  workbenchSubtitle: 'Converti e valida piani terapeutici svizzeri',
  skipToContent: 'Skip to content',
  versionBadge: 'v{version}',
  homeHeading: 'Choose a flow',
  homeCardJsonDescription:
    'Paste or type a CHMED16A JSON document, validate it and encode it into a CHMED16A string with its QR code.',
  homeCardJsonBadge: 'JSON',
  homeCardChmedDescription:
    'Decode a compressed or uncompressed CHMED16A string, or scan its QR code, back into readable JSON.',
  homeCardChmedBadge: 'CHMED16A',
  homeCardPdfDescription:
    'Extract an ePrescription from a printed eMediplan PDF. Scanned pages are recognized offline.',
  homeCardPdfBadge: 'PDF',
  openFlowLabel: 'Open {flow}',

  /* ── phase 4b: three-level findings, distinct PDF output clears (append-only) ── */
  infoLabel: 'Info',
  clearJsonOutputAccessibleName: 'Clear the extracted JSON output',
  clearChmedOutputAccessibleName: 'Clear the encoded CHMED16A string',

  /* ── phase 5: JSON input drop zone (append-only) ── */
  jsonInputDragHint: 'You can also drop a .json or .txt file here; its text replaces the field content.',
  dropFileUnsupported: '"{name}" is not a .json or .txt text file. Nothing was loaded.',
  dropFileTooLarge: '"{name}" is larger than 1 MiB. Nothing was loaded.',
  dropMultipleFiles: 'Drop one file at a time. "{name}" was not loaded.',
  dropReadFailed: 'The dropped file could not be read. Nothing was loaded.',

  /* ── phase 6: CHMED16A → JSON structured view (append-only) ── */
  jsonViewGroupLabel: 'Output view',
  jsonViewStructured: 'Structured',
  jsonViewRaw: 'Raw JSON',
  jsonDocumentSection: 'Document',
  jsonSectionItem: '{count} item',
  jsonSectionItems: '{count} items',
  jsonSectionKey: '{count} key',
  jsonSectionKeys: '{count} keys',
  jsonSectionEmpty: 'empty',
  jsonTypeString: 'string',
  jsonTypeNumber: 'number',
  jsonTypeBoolean: 'boolean',
  jsonTypeNull: 'null',
  jsonTypeUnknown: 'value',

  /* ── phase 7a: PDF steps + first-page preview (append-only) ── */
  pdfStepIndicatorLabel: 'PDF processing steps',
  pdfStepOf: 'Step {current} of 3',
  pdfStep1Label: 'Upload',
  pdfStep2Label: 'Review',
  pdfStep3Label: 'Export',
  pdfPreviewHeading: 'First page preview',
  pdfPreviewAriaLabel: 'First page of the selected PDF',
  pdfPreviewFailed: 'The first page could not be previewed. Processing is unaffected.',

  /* ── phase 7b: read-only review table (append-only) ── */
  pdfReviewCaption: 'Review extracted {section}',
  pdfReviewFieldHeader: 'Field',
  pdfReviewValueHeader: 'Value',
  pdfReviewStatusHeader: 'Status',
  pdfReviewPositionHeader: 'Pos',
  pdfReviewIdHeader: 'Id / GTIN',
  pdfReviewUnitHeader: 'Unit',
  pdfReviewInstructionsHeader: 'Instructions',
  statusRecognized: 'Recognized',
  statusToVerify: 'To verify',
  statusAbsent: 'Absent',
  reviewValuePlaceholder: '—',

  /* ── phase 7c: inline editing of the review table (append-only) ── */
  reviewEditableHint:
    'Edit a value, then leave the field: the prescription is checked again and the CHMED16A output follows its result.',
  reviewCellAriaLabel: 'Edit {field} ({row})',
  reviewMedicamentRow: 'Medicament {position}',
  reviewInvalidEdit: 'The edited prescription could not be checked, so nothing was encoded.',

  /* ── phase 7d: export recap at step 3 (append-only) ── */
  exportRecapHeading: 'Export summary',
  recapPatientLabel: 'Patient',
  recapPrescriberLabel: 'Prescriber / Organisation',
  recapMedicamentsLabel: 'Medicaments',
  recapExtractionLabel: 'Extraction',
  recapEditsLabel: 'Edits',
  recapPatientBorn: '{name} · born {date}',
  recapEdited: 'Edited',
  recapValid: 'Valid ({warnings} warnings)',
  recapBlocked: 'Blocked: {errors} errors, {warnings} warnings',

  /* ── phase 8a: guided tasks, required counter, recap shortcuts (append-only) ── */
  taskHeading: 'Required actions',
  taskAddRequired: 'Add {field}',
  taskGoToField: 'Go to {field} field',
  taskFieldFallback: 'field',
  technicalDetailsLabel: 'Technical details',
  reviewRequiredCount: '{done} of {total} required fields completed',
  reviewRequiredBlocked: 'Export still blocked: {n} blocking issues',
  recapFixField: 'Fix {section} data',

  /* ── phase 8b: advisory inline hints under editable fields (append-only) ── */
  advisoryGlnHint: 'GLN must be a 13-digit number — the validator will confirm on save.',
  advisoryDateFormatHint: 'Use the YYYY-MM-DD format.',
  advisoryRequiredHint: 'Required — the validator lists this under Required actions.',

  /* ── phase 8c: structured JSON missing-required marks (append-only) ── */
  jsonMissingRequired: 'missing required properties',

  /* ── phase 8d: honest section-level labels for unrendered required keys (append-only) ── */
  taskGoToSectionData: 'Go to {section} data',
  taskAddSectionData: 'Add {section} data',
} as const;

/** Every key of {@link STRINGS}; panels may only request these. */
export type UiStringKey = keyof typeof STRINGS;

/** Looks up a single UI string. */
export function text(key: UiStringKey): string {
  return STRINGS[key];
}

/** Replaces `{name}` placeholders in a template with the given values. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder: string, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}
