import { gzip, ungzip } from 'pako';
import { describe, expect, it } from 'vitest';

import { decodeBase64, encodeBase64 } from '../base64';
import { chmedToJson } from '../decode';
import { jsonToChmed } from '../encode';
import { parseHeader, serializeHeader } from '../header';
import {
  OFFICIAL_COMPRESSED,
  OFFICIAL_PRETTY_JSON,
  OFFICIAL_UNCOMPRESSED,
} from './fixtures/official';

type JsonObject = Record<string, unknown>;

const OFFICIAL_OBJECT: unknown = JSON.parse(OFFICIAL_PRETTY_JSON);

const OFFICIAL_PAYLOAD = OFFICIAL_COMPRESSED.slice('CHMED16A1'.length);

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function officialObject(): JsonObject {
  const value: unknown = JSON.parse(OFFICIAL_PRETTY_JSON);
  if (!isRecord(value)) {
    throw new Error('the official fixture is not a JSON object');
  }
  return value;
}

function child(object: JsonObject, key: string): JsonObject {
  const value = object[key];
  if (!isRecord(value)) {
    throw new Error(`expected "${key}" to be an object`);
  }
  return value;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function decodedJson(chmed: string): unknown {
  const decoded = chmedToJson(chmed);
  if (!decoded.ok) {
    throw new Error(`decode failed: ${JSON.stringify(decoded.errors)}`);
  }
  return JSON.parse(decoded.jsonText);
}

describe('parseHeader', () => {
  it('parses the official compressed example', () => {
    const header = parseHeader(OFFICIAL_COMPRESSED);
    if (!header.ok) {
      throw new Error(`unexpected header error: ${header.code}`);
    }
    expect(header.releaseYear).toBe(16);
    expect(header.subVersion).toBe('A');
    expect(header.compression).toBe(1);
    expect(header.payload).toBe(OFFICIAL_PAYLOAD);
    expect(serializeHeader(header)).toBe(OFFICIAL_COMPRESSED);
  });

  it('parses the official uncompressed example', () => {
    const header = parseHeader(OFFICIAL_UNCOMPRESSED);
    if (!header.ok) {
      throw new Error(`unexpected header error: ${header.code}`);
    }
    expect(header.subVersion).toBe('A');
    expect(header.compression).toBe(0);
    expect(header.payload).toBe(OFFICIAL_UNCOMPRESSED.slice('CHMED16A0'.length));
    expect(serializeHeader(header)).toBe(OFFICIAL_UNCOMPRESSED);
  });

  it('parses lowercase case-insensitively and serializes uppercase', () => {
    const header = parseHeader('chmed16a1AAAA');
    if (!header.ok) {
      throw new Error(`unexpected header error: ${header.code}`);
    }
    expect(header.subVersion).toBe('A');
    expect(header.compression).toBe(1);
    expect(serializeHeader(header)).toBe('CHMED16A1AAAA');
    expect(serializeHeader({ subVersion: 'b', compression: 0, payload: '{}' })).toBe('CHMED16B0{}');
  });

  it('trims only the edges of the whole input', () => {
    const header = parseHeader(' \n CHMED16A0{"a":1} \n ');
    if (!header.ok) {
      throw new Error(`unexpected header error: ${header.code}`);
    }
    expect(header.payload).toBe('{"a":1}');
  });

  it('keeps interior newlines of an uncompressed payload intact', () => {
    const document = 'CHMED16A0{\n  "a": 1\n}';
    const header = parseHeader(document);
    if (!header.ok) {
      throw new Error(`unexpected header error: ${header.code}`);
    }
    expect(header.payload).toBe('{\n  "a": 1\n}');
    expect(serializeHeader(header)).toBe(document);
  });

  it('rejects unlisted release years as unknown-year', () => {
    const chunked = parseHeader('CHMED23A.H4sIAAAAAAAACg==');
    expect(chunked.ok).toBe(false);
    if (chunked.ok) {
      return;
    }
    expect(chunked.code).toBe('unknown-year');

    const twenty = parseHeader('CHMED20AF{"a":1}');
    expect(twenty.ok).toBe(false);
    if (twenty.ok) {
      return;
    }
    expect(twenty.code).toBe('unknown-year');
  });

  it('rejects a missing subversion as bad-prefix', () => {
    for (const input of ['CHMED16', 'CHMED16{}', 'CHMED', '{"a":1}']) {
      const header = parseHeader(input);
      expect(header.ok).toBe(false);
      if (!header.ok) {
        expect(header.code).toBe('bad-prefix');
      }
    }
  });

  it('rejects an invalid compression digit as bad-compression', () => {
    for (const input of ['CHMED16A2{"a":1}', 'CHMED16A']) {
      const header = parseHeader(input);
      expect(header.ok).toBe(false);
      if (header.ok) {
        continue;
      }
      expect(header.code).toBe('bad-compression');
    }
  });
});

describe('base64', () => {
  it('encodes with the standard alphabet and padding', () => {
    expect(encodeBase64(new Uint8Array())).toBe('');
    expect(encodeBase64(utf8('a'))).toBe('YQ==');
    expect(encodeBase64(utf8('ab'))).toBe('YWI=');
    expect(encodeBase64(utf8('abc'))).toBe('YWJj');
    expect(encodeBase64(utf8('ü'))).toBe('w7w=');
  });

  it('round-trips bytes, including multi-byte UTF-8', () => {
    const text = 'Müller 🎉 – Zoë';
    const bytes = utf8(text);
    const decoded = decodeBase64(encodeBase64(bytes));
    if (!decoded.ok) {
      throw new Error(`unexpected base64 error: ${decoded.message}`);
    }
    expect(Array.from(decoded.bytes)).toEqual(Array.from(bytes));
    expect(utf8Text(decoded.bytes)).toBe(text);
  });

  it('decodes the official payload segment standalone', () => {
    const decoded = decodeBase64(OFFICIAL_PAYLOAD);
    if (!decoded.ok) {
      throw new Error(`unexpected base64 error: ${decoded.message}`);
    }
    expect(JSON.parse(utf8Text(ungzip(decoded.bytes)))).toEqual(OFFICIAL_OBJECT);
  });

  it('tolerates line wrapping and missing trailing padding', () => {
    const wrapped = OFFICIAL_PAYLOAD.replace(/(.{76})/g, '$1\n');
    const unwrapped = decodeBase64(OFFICIAL_PAYLOAD);
    const decodedWrapped = decodeBase64(wrapped);
    if (!unwrapped.ok || !decodedWrapped.ok) {
      throw new Error('expected both variants to decode');
    }
    expect(Array.from(decodedWrapped.bytes)).toEqual(Array.from(unwrapped.bytes));

    const unpadded = OFFICIAL_PAYLOAD.replace(/=+$/, '');
    expect(unpadded).not.toBe(OFFICIAL_PAYLOAD);
    const decodedUnpadded = decodeBase64(unpadded);
    if (!decodedUnpadded.ok) {
      throw new Error(`unexpected base64 error: ${decodedUnpadded.message}`);
    }
    expect(Array.from(decodedUnpadded.bytes)).toEqual(Array.from(unwrapped.bytes));
  });

  it('rejects non-alphabet characters', () => {
    for (const input of ['!', 'QUJD!', '_-', 'QU JD?']) {
      const decoded = decodeBase64(input);
      expect(decoded.ok).toBe(false);
      if (!decoded.ok) {
        expect(decoded.code).toBe('bad-base64');
      }
    }
  });

  it('rejects a data length of 1 mod 4', () => {
    const decoded = decodeBase64('QUJDR');
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.code).toBe('bad-base64');
    }
  });

  it('rejects misaligned and excessive padding', () => {
    for (const input of ['QQ=', 'AB=C', 'QQ===', '====']) {
      const decoded = decodeBase64(input);
      expect(decoded.ok).toBe(false);
      if (!decoded.ok) {
        expect(decoded.code).toBe('bad-base64');
      }
    }
  });
});

describe('chmedToJson', () => {
  it('decodes the official compressed example', () => {
    const decoded = chmedToJson(OFFICIAL_COMPRESSED);
    if (!decoded.ok) {
      throw new Error(`decode failed: ${JSON.stringify(decoded.errors)}`);
    }
    expect(decoded.header.subVersion).toBe('A');
    expect(decoded.header.compression).toBe(1);
    expect(JSON.parse(decoded.jsonText)).toEqual(OFFICIAL_OBJECT);
  });

  it('decodes the official uncompressed example', () => {
    const decoded = chmedToJson(OFFICIAL_UNCOMPRESSED);
    if (!decoded.ok) {
      throw new Error(`decode failed: ${JSON.stringify(decoded.errors)}`);
    }
    expect(decoded.header.subVersion).toBe('A');
    expect(decoded.header.compression).toBe(0);
    expect(JSON.parse(decoded.jsonText)).toEqual(OFFICIAL_OBJECT);
  });

  it('feeds both official variants through the same decoder to the same object', () => {
    expect(decodedJson(OFFICIAL_COMPRESSED)).toEqual(decodedJson(OFFICIAL_UNCOMPRESSED));
  });

  it('returns the plain payload text for compression 0', () => {
    const document = 'CHMED16A0{\n  "a": 1\n}';
    const decoded = chmedToJson(document);
    if (!decoded.ok) {
      throw new Error(`decode failed: ${JSON.stringify(decoded.errors)}`);
    }
    expect(decoded.jsonText).toBe('{\n  "a": 1\n}');
  });

  it('reports bad-base64 before attempting gzip', () => {
    const decoded = chmedToJson(`CHMED16A1${OFFICIAL_PAYLOAD.slice(0, 40)}!`);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) {
      return;
    }
    expect(decoded.errors[0]?.code).toBe('bad-base64');
  });

  it('reports bad-gzip for base64 of random bytes', () => {
    const decoded = chmedToJson(`CHMED16A1${encodeBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))}`);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) {
      return;
    }
    expect(decoded.errors[0]?.code).toBe('bad-gzip');
  });

  it('reports bad-gzip for a truncated gzip stream', () => {
    const truncated = gzip(utf8('{"x":1}')).slice(0, 10);
    const decoded = chmedToJson(`CHMED16A1${encodeBase64(truncated)}`);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) {
      return;
    }
    expect(decoded.errors[0]?.code).toBe('bad-gzip');
  });

  it('reports bad-json with line and column for malformed JSON', () => {
    const decoded = chmedToJson('CHMED16A0{a:}');
    expect(decoded.ok).toBe(false);
    if (decoded.ok) {
      return;
    }
    const error = decoded.errors[0];
    expect(error?.code).toBe('bad-json');
    expect(error?.line).toBe(1);
    expect(error?.column).toBe(2);
  });

  it('reports bad-json when the decompressed bytes are not JSON', () => {
    const decoded = chmedToJson(`CHMED16A1${encodeBase64(gzip(utf8('not json')))}`);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) {
      return;
    }
    expect(decoded.errors[0]?.code).toBe('bad-json');
  });

  it('propagates header error codes', () => {
    for (const [document, code] of [
      ['CHMED23A.H4sIAAAAAAAACg==', 'unknown-year'],
      ['CHMED16', 'bad-prefix'],
      ['CHMED16A9{"a":1}', 'bad-compression'],
    ] as const) {
      const decoded = chmedToJson(document);
      expect(decoded.ok).toBe(false);
      if (!decoded.ok) {
        expect(decoded.errors[0]?.code).toBe(code);
      }
    }
  });
});

describe('jsonToChmed', () => {
  it('round-trips the official JSON with compression by default', () => {
    const encoded = jsonToChmed(OFFICIAL_PRETTY_JSON);
    if (!encoded.ok) {
      throw new Error(`encode failed: ${JSON.stringify(encoded.errors)}`);
    }
    expect(encoded.chmed.startsWith('CHMED16A1')).toBe(true);
    expect(decodedJson(encoded.chmed)).toEqual(OFFICIAL_OBJECT);
  });

  it('round-trips the official JSON without compression', () => {
    const encoded = jsonToChmed(OFFICIAL_PRETTY_JSON, { compress: false });
    if (!encoded.ok) {
      throw new Error(`encode failed: ${JSON.stringify(encoded.errors)}`);
    }
    expect(encoded.chmed).toBe(`CHMED16A0${JSON.stringify(officialObject())}`);
    expect(decodedJson(encoded.chmed)).toEqual(OFFICIAL_OBJECT);
  });

  it('round-trips an already parsed object', () => {
    const object = officialObject();
    const encoded = jsonToChmed(object);
    if (!encoded.ok) {
      throw new Error(`encode failed: ${JSON.stringify(encoded.errors)}`);
    }
    expect(decodedJson(encoded.chmed)).toEqual(object);
  });

  it('round-trips non-ASCII content through UTF-8 and both compression modes', () => {
    const object = officialObject();
    const patient = child(object, 'Patient');
    patient.FName = 'Müller 🎉 Zoë';
    object.Rmk = 'Grüße – 日本語';

    for (const compress of [true, false]) {
      const encoded = jsonToChmed(object, { compress });
      if (!encoded.ok) {
        throw new Error(`encode failed: ${JSON.stringify(encoded.errors)}`);
      }
      const decoded = chmedToJson(encoded.chmed);
      if (!decoded.ok) {
        throw new Error(`decode failed: ${JSON.stringify(decoded.errors)}`);
      }
      expect(JSON.parse(decoded.jsonText)).toEqual(object);
      expect(decoded.jsonText).toContain('Müller 🎉 Zoë');
      expect(decoded.jsonText).toContain('Grüße – 日本語');
      expect(utf8Text(utf8(decoded.jsonText))).toBe(decoded.jsonText);
    }
  });

  it('blocks encoding when validation reports a blocking error', () => {
    const object = officialObject();
    delete object.Dt;

    const encoded = jsonToChmed(object);
    expect(encoded.ok).toBe(false);
    if (encoded.ok) {
      return;
    }
    expect(encoded.errors.length).toBeGreaterThan(0);
    expect(encoded.errors.some((error) => error.keyword === 'required')).toBe(true);
  });

  it('blocks encoding when the input is not valid JSON text', () => {
    const encoded = jsonToChmed('{"Dt":');
    expect(encoded.ok).toBe(false);
    if (encoded.ok) {
      return;
    }
    expect(encoded.errors[0]?.keyword).toBe('json-syntax');
  });

  it('passes warnings through and preserves unknown fields losslessly', () => {
    const object = officialObject();
    object.XTest = 'keep me';

    const encoded = jsonToChmed(object);
    if (!encoded.ok) {
      throw new Error(`encode failed: ${JSON.stringify(encoded.errors)}`);
    }
    expect(encoded.warnings.some((warning) => warning.code === 'unknown-field')).toBe(true);
    expect(encoded.warnings.some((warning) => warning.path === '/XTest')).toBe(true);

    const decoded = chmedToJson(encoded.chmed);
    if (!decoded.ok) {
      throw new Error(`decode failed: ${JSON.stringify(decoded.errors)}`);
    }
    expect(JSON.parse(decoded.jsonText)).toEqual(object);
  });
});
