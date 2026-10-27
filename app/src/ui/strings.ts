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
