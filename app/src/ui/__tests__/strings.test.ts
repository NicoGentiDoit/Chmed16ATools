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
});
