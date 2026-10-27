/**
 * Standard Base64 with `=` padding, implemented byte-wise.
 *
 * Encoding uses the standard alphabet (`A-Za-z0-9+/`) and always pads to a
 * multiple of four. Decoding is tolerant the way the plan requires: missing or
 * redundant padding, whitespace and line wrapping are accepted, while anything
 * outside the alphabet, more than two padding characters or misaligned padding
 * is a blocking error.
 *
 * `btoa`/`atob` are deliberately not used: they only handle Latin-1 and are not
 * available in every runtime the core is exercised in. Callers encode UTF-8 with
 * `TextEncoder` first, which keeps the codec byte-exact for non-ASCII payloads.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const PADDING = '=';

const DECODE_TABLE = new Uint8Array(128).fill(0xff);
for (let index = 0; index < ALPHABET.length; index += 1) {
  DECODE_TABLE[ALPHABET.charCodeAt(index)] = index;
}

/** Alphabet plus optional trailing padding; nothing else is accepted. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

const WHITESPACE_PATTERN = /\s+/g;

export type Base64ErrorCode = 'bad-base64';

export interface Base64Error {
  readonly ok: false;
  readonly code: Base64ErrorCode;
  readonly message: string;
}

export type Base64DecodeResult = { readonly ok: true; readonly bytes: Uint8Array } | Base64Error;

function base64Error(message: string): Base64Error {
  return { ok: false, code: 'bad-base64', message };
}

/** Encodes bytes as standard Base64 with `=` padding. */
export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const byte0 = bytes[index] ?? 0;
    const byte1 = remaining > 1 ? (bytes[index + 1] ?? 0) : 0;
    const byte2 = remaining > 2 ? (bytes[index + 2] ?? 0) : 0;

    output += ALPHABET.charAt(byte0 >> 2);
    output += ALPHABET.charAt(((byte0 & 0x03) << 4) | (byte1 >> 4));
    output += remaining > 1 ? ALPHABET.charAt(((byte1 & 0x0f) << 2) | (byte2 >> 6)) : PADDING;
    output += remaining > 2 ? ALPHABET.charAt(byte2 & 0x3f) : PADDING;
  }
  return output;
}

function charValue(data: string, index: number): number {
  if (index >= data.length) {
    return 0;
  }
  return DECODE_TABLE[data.charCodeAt(index)] ?? 0;
}

/**
 * Decodes Base64 text, tolerating whitespace, line wrapping and absent or
 * redundant `=` padding.
 *
 * Rejected as blocking `bad-base64` errors: characters outside the standard
 * alphabet (including URL-safe `-`/`_`), more than two padding characters,
 * padding that is not at the end, and a data length of `1 mod 4`.
 */
export function decodeBase64(text: string): Base64DecodeResult {
  const compact = text.replace(WHITESPACE_PATTERN, '');
  if (!BASE64_PATTERN.test(compact)) {
    return base64Error(
      'Not standard Base64: expected only A-Z, a-z, 0-9, "+", "/" and at most two trailing "=" padding characters.',
    );
  }

  const paddingIndex = compact.indexOf(PADDING);
  const data = paddingIndex === -1 ? compact : compact.slice(0, paddingIndex);
  const padding = compact.length - data.length;
  const remainder = data.length % 4;

  if (remainder === 1) {
    return base64Error(
      'Not standard Base64: a data length of 1 mod 4 cannot represent whole bytes.',
    );
  }
  if (padding > 0 && (data.length + padding) % 4 !== 0) {
    return base64Error('Not standard Base64: the padding does not align the data to a multiple of four.');
  }

  const bytes = new Uint8Array(Math.floor((data.length * 3) / 4));
  let byteIndex = 0;
  for (let index = 0; index < data.length; index += 4) {
    const char0 = charValue(data, index);
    const char1 = charValue(data, index + 1);
    const char2 = charValue(data, index + 2);
    const char3 = charValue(data, index + 3);

    if (byteIndex < bytes.length) {
      bytes[byteIndex] = (char0 << 2) | (char1 >> 4);
      byteIndex += 1;
    }
    if (byteIndex < bytes.length) {
      bytes[byteIndex] = ((char1 & 0x0f) << 4) | (char2 >> 2);
      byteIndex += 1;
    }
    if (byteIndex < bytes.length) {
      bytes[byteIndex] = ((char2 & 0x03) << 6) | char3;
      byteIndex += 1;
    }
  }

  return { ok: true, bytes };
}
