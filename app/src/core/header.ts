/**
 * `CHMED16{SubVersion}{Compression}{Data}` header parsing and serialization.
 *
 * Anchors (`chtransmissionformat/README.md`):
 * - generic header `CHMED{ReleaseYear}{SubVersion}{AdditionalMetaData}{Data}` (`:47`)
 *   with regex `^CHMED([0-9]{2})([A-Z]+)(.*)$` (`:53`);
 * - ReleaseYear 16 header `CHMED16{SubVersion}{Compression}{Data}` (`:80`) with
 *   regex `^CHMED16([A-Z])([0-1])(.*)$` (`:86`);
 * - prefix and SubVersion are case-insensitive on parse and uppercase on
 *   serialization (`:61-67,91`); Compression is the digit `0` or `1` (`:92-94`);
 * - years not listed in the specification MUST NOT be accepted (`:74`).
 *
 * The module is framework-free and DOM-free.
 */

/** `Compression` digit of the ReleaseYear 16 header (`README.md:92-94`). */
export type Compression = 0 | 1;

/** A successfully parsed ReleaseYear 16 header. */
export interface Header {
  readonly ok: true;
  readonly releaseYear: 16;
  /** Uppercase subversion letter (`README.md:61-67,91`). */
  readonly subVersion: string;
  readonly compression: Compression;
  /** Everything after `CHMED16{SubVersion}{Compression}`, characters intact. */
  readonly payload: string;
}

/** Blocking header findings. */
export type HeaderErrorCode = 'bad-prefix' | 'unknown-year' | 'bad-compression';

export interface HeaderError {
  readonly ok: false;
  readonly code: HeaderErrorCode;
  readonly message: string;
}

/**
 * The ReleaseYear 16 regex from `chtransmissionformat/README.md:86`, applied to
 * the whole input. Flags: `i` for the case-insensitive prefix/subversion
 * (`:61-67`). The data part uses `[\s\S]` instead of `.` so an uncompressed,
 * multi-line JSON payload is captured verbatim (`:96-97`).
 */
const CHMED16_PATTERN = /^CHMED16([A-Z])([0-1])([\s\S]*)$/i;

const RELEASE_YEAR_PATTERN = /^CHMED(\d{2})/i;
const SUB_VERSION_PATTERN = /^CHMED16[A-Z]/i;

function headerError(code: HeaderErrorCode, message: string): HeaderError {
  return { ok: false, code, message };
}

/**
 * Parses a ChTransmissionFormat document header.
 *
 * Only leading/trailing whitespace of the whole input is trimmed; the payload
 * keeps every interior character. Unlisted release years (e.g. `CHMED23A…`,
 * `CHMED20AF…`) are rejected as blocking `unknown-year` errors
 * (`chtransmissionformat/README.md:74`).
 */
export function parseHeader(input: string): Header | HeaderError {
  const text = input.trim();

  const year = RELEASE_YEAR_PATTERN.exec(text);
  if (year !== null && year[1] !== '16') {
    return headerError(
      'unknown-year',
      `ReleaseYear ${year[1] ?? '?'} is not defined by ChTransmissionFormat; only 16 is supported (chtransmissionformat/README.md:74).`,
    );
  }

  const match = CHMED16_PATTERN.exec(text);
  if (match === null) {
    if (SUB_VERSION_PATTERN.test(text)) {
      return headerError(
        'bad-compression',
        'Compression must be the digit 0 or 1 right after the subversion (chtransmissionformat/README.md:92-94).',
      );
    }
    return headerError(
      'bad-prefix',
      'Expected a CHMED16 document: "CHMED16", one subversion letter and the compression digit 0 or 1 (chtransmissionformat/README.md:80-94).',
    );
  }

  const [, subVersion = '', compression = '', payload = ''] = match;

  return {
    ok: true,
    releaseYear: 16,
    subVersion: subVersion.toUpperCase(),
    compression: compression === '1' ? 1 : 0,
    payload,
  };
}

/** Parts needed to serialize a header; `payload` defaults to no data. */
export interface HeaderParts {
  readonly subVersion: string;
  readonly compression: Compression;
  readonly payload?: string;
}

/**
 * Serializes a ReleaseYear 16 header. The subversion is always emitted in
 * uppercase (`chtransmissionformat/README.md:61-67,91`).
 */
export function serializeHeader(header: HeaderParts): string {
  return `CHMED16${header.subVersion.toUpperCase()}${header.compression}${header.payload ?? ''}`;
}
