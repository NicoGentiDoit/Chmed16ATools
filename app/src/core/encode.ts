/**
 * JSON text/object → `CHMED16A{Compression}{Data}`.
 *
 * Validation runs first and blocks encoding on any `ok: false` finding: a
 * document that is not a valid CHMED16A object must never be wrapped into a
 * transmission document (plan 001, feature 2). Warnings are non-blocking and are
 * passed through to the caller.
 *
 * Unknown fields are preserved (lossless round-trip; forward compatibility,
 * `README.md:49-53`). The JSON payload is always the compact
 * `JSON.stringify` form because the result is meant for a size-limited QR code;
 * gzip level and header bytes stay at pako's defaults, since gzip output is not
 * normative (`chtransmissionformat/README.md:99-100`).
 */

import { gzip } from 'pako';

import { encodeBase64 } from './base64';
import { serializeHeader } from './header';
import { parseJsonText, validateObject } from './validate';
import type { ValidationError, ValidationWarning } from './validate';

export interface EncodeOptions {
  /** Emit `CHMED16A1` + Base64(gzip(JSON)). Defaults to `true`. */
  readonly compress?: boolean;
}

export interface EncodeSuccess {
  readonly ok: true;
  readonly chmed: string;
  /** Non-blocking findings from validation; encoding still happened. */
  readonly warnings: ValidationWarning[];
}

export interface EncodeFailure {
  readonly ok: false;
  /** Blocking findings (JSON syntax or schema), so nothing was encoded. */
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
}

export type EncodeResult = EncodeSuccess | EncodeFailure;

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Encodes a JSON text or an already parsed object as a CHMED16A document.
 *
 * @param input   JSON text or a parsed CHMED16A object.
 * @param options `compress: false` emits `CHMED16A0` + compact JSON instead of
 *                the default compressed form.
 */
export function jsonToChmed(input: string | object, options: EncodeOptions = {}): EncodeResult {
  let value: unknown = input;
  if (typeof input === 'string') {
    const parsed = parseJsonText(input);
    if (!parsed.ok) {
      return { ok: false, errors: [parsed.error], warnings: [] };
    }
    value = parsed.value;
  }

  const validation = validateObject(value);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }

  const json = JSON.stringify(value);
  const compress = options.compress ?? true;
  const payload = compress ? encodeBase64(gzip(utf8Bytes(json))) : json;

  return {
    ok: true,
    chmed: serializeHeader({ subVersion: 'A', compression: compress ? 1 : 0, payload }),
    warnings: validation.warnings,
  };
}
