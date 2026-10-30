/**
 * `CHMED16A{Compression}{Data}` → JSON text.
 *
 * Pipeline (`chtransmissionformat/README.md:95-99`):
 * - `Compression = 0`: the payload is the plain JSON document;
 * - `Compression = 1`: the payload is standard Base64 of the gzipped document.
 *
 * The output is the JSON *text*, not a pretty-printed rendering: the UI decides
 * how to display it. JSON syntax errors carry the line/column computed by the
 * shared parser in `validate.ts`, so decoding and validation never disagree.
 *
 * gzip output is not normative (`chtransmissionformat/README.md:99-100`), so the
 * decoder only ever compares decoded JSON, never Base64 bytes.
 */

import { ungzip } from 'pako';

import { decodeBase64 } from './base64';
import { parseHeader } from './header';
import type { Header, HeaderError } from './header';
import { parseJsonText } from './validate';
import type { ValidationError } from './validate';

/** Distinct blocking reasons a CHMED document can fail to decode. */
export type DecodeErrorCode =
  | 'unknown-year'
  | 'bad-prefix'
  | 'bad-compression'
  | 'bad-base64'
  | 'bad-gzip'
  | 'bad-json';

/**
 * Stable sub-code of a decode failure whose `code` covers more than one message.
 *
 * Only `bad-json` needs one: the code is shared with the JSON syntax errors of
 * the validator (whose text is the schema engine's own and stays English), while
 * the UTF-8 rejection below is this module's prose and is localized.
 */
export type DecodeErrorMessageDetail = 'not-utf8';

export interface DecodeError {
  readonly code: DecodeErrorCode;
  /** English fallback wording; the UI resolves `code`/`detail` to its locale. */
  readonly message: string;
  /** Narrows a multi-message `code` to one stable message (see above). */
  readonly detail?: DecodeErrorMessageDetail;
  /** Values a localized template interpolates (`{reason}`); never prose. */
  readonly params?: Readonly<Record<string, string | number>>;
  /** 1-based, only for `bad-json`. */
  readonly line?: number;
  readonly column?: number;
}

export interface DecodeSuccess {
  readonly ok: true;
  readonly header: Header;
  /** UTF-8 JSON text (the payload for compression 0, the gunzipped bytes for 1). */
  readonly jsonText: string;
}

export interface DecodeFailure {
  readonly ok: false;
  readonly errors: DecodeError[];
}

export type DecodeResult = DecodeSuccess | DecodeFailure;

/** Extra, locale-agnostic facts of a decode failure (never prose). */
interface DecodeFailureDetail {
  readonly detail?: DecodeErrorMessageDetail;
  readonly params?: Readonly<Record<string, string | number>>;
}

function failure(
  code: DecodeErrorCode,
  message: string,
  extra: DecodeFailureDetail = {},
): DecodeFailure {
  const { detail, params } = extra;
  const error: DecodeError = {
    code,
    message,
    ...(detail === undefined ? {} : { detail }),
    ...(params === undefined ? {} : { params }),
  };
  return { ok: false, errors: [error] };
}

/**
 * Forwards a header failure unchanged.
 *
 * The header owns both the code and the `{year}` parameter, so the decoder must
 * not fold them away: the UI resolves `code` + `params` to a localized message
 * and would otherwise fall back to the (correct but English) `message`.
 */
function headerFailure(header: HeaderError): DecodeFailure {
  return failure(
    header.code,
    header.message,
    header.params === undefined ? {} : { params: header.params },
  );
}

function jsonFailure(error: ValidationError): DecodeFailure {
  const line = typeof error.params.line === 'number' ? error.params.line : undefined;
  const column = typeof error.params.column === 'number' ? error.params.column : undefined;
  return { ok: false, errors: [{ code: 'bad-json', message: error.message, line, column }] };
}

/**
 * Decompresses gzip bytes into UTF-8 text.
 *
 * Invalid gzip data is `bad-gzip`; valid gzip whose content is not UTF-8 cannot
 * be a JSON document and is reported as `bad-json` (`README.md:44`), with the
 * `not-utf8` detail so the UI does not attribute the validator's JSON syntax
 * wording to it.
 */
function gunzipToText(bytes: Uint8Array): { ok: true; text: string } | DecodeFailure {
  let inflated: Uint8Array;
  try {
    inflated = ungzip(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failure('bad-gzip', `Invalid gzip data: ${reason}`, { params: { reason } });
  }

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(inflated) };
  } catch {
    return failure(
      'bad-json',
      'The decompressed data is not valid UTF-8, so it cannot be a JSON document.',
      { detail: 'not-utf8' },
    );
  }
}

/**
 * Decodes a ChTransmissionFormat document into JSON text without parsing it for
 * the caller beyond the syntax check.
 */
export function chmedToJson(input: string): DecodeResult {
  const header = parseHeader(input);
  if (!header.ok) {
    return headerFailure(header);
  }

  let jsonText: string;
  if (header.compression === 0) {
    jsonText = header.payload;
  } else {
    const decoded = decodeBase64(header.payload);
    if (!decoded.ok) {
      return failure(decoded.code, decoded.message);
    }
    const inflated = gunzipToText(decoded.bytes);
    if (!inflated.ok) {
      return inflated;
    }
    jsonText = inflated.text;
  }

  const parsed = parseJsonText(jsonText);
  if (!parsed.ok) {
    return jsonFailure(parsed.error);
  }

  return { ok: true, header, jsonText };
}
