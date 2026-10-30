/**
 * Localized rendering of the findings the core modules return (i18n plan 007,
 * phases 7 and 8).
 *
 * The core stays locale-agnostic: it returns a stable `code` (plus a `detail`
 * sub-code where one code covers several messages and the values a template
 * needs as `params`), and the English `message` it always carried stays as the
 * fallback. This module is the only place that turns that into UI text, so core
 * never imports a dictionary and the UI never parses core prose.
 *
 * Resolution chain, in the resolver's own spirit (never blank):
 * 1. `detail` → key, then `code` → key (the localized template, `format()`ed
 *    with the error's `params`);
 * 2. the error's English `message` — a code with no key (schema-engine text,
 *    validator warnings) keeps exactly today's wording;
 * 3. the `code` itself, as the last resort.
 *
 * A `detail` is what keeps the shared codes honest: the pipeline's
 * `pdf-corrupt` and the parser's `unknown-field`/`invalid-value`/
 * `missing-field`/`empty-string` each cover several messages, and the
 * validator uses the same `unknown-field`/`empty-string` names for findings
 * that stay English. Validator findings never carry a detail, so they can never
 * pick up a parser template.
 *
 * What is deliberately NOT mapped here: everything the schema engine writes
 * (`validate.ts`/`schema.ts`: JSON syntax errors, `instancePath` compositions,
 * Ajv `message` strings) and the validator's own placeholders advisories
 * (`empty-string` for `Lng`/`Unit`, `unknown-field` for an unknown JSON key).
 * Those keep their English text — documented limitation of the plan: fall back
 * to English, never blank.
 */

import { format } from './format';
import { text } from './index';
import type { MessageKey } from './messages/en';

/**
 * The structural shape of a core finding.
 *
 * Declared here rather than imported from core so the mapping stays usable with
 * every module's own error type (they all carry `code` + `message`, some add
 * `detail`/`params`) without the UI depending on a core union.
 */
export interface CoreMessage {
  readonly code: string;
  readonly message?: string;
  readonly detail?: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * Keys of the sub-codes that narrow a shared `code`.
 *
 * A `detail` always wins over its `code`: `pdf-corrupt` covers four different
 * reader bounds, `bad-json` is shared with the validator's JSON syntax text,
 * and the parser's coarse `unknown-field`/`invalid-value`/`missing-field`/
 * `empty-string` each author a dozen different findings — so the code alone
 * would attribute the wrong advice.
 *
 * The `coreParse*` entries are plan 007 phase 8 (`prescription-parse.ts`). Their
 * details are that module's `ParseErrorDetail`/`ParserWarningDetail` unions;
 * no detail name is shared with another module, so one map stays total.
 */
const DETAIL_KEYS: Readonly<Record<string, MessageKey>> = {
  'not-utf8': 'coreDecodeBadJsonUtf8',
  unreadable: 'corePdfUnreadable',
  'page-limit': 'corePdfTooManyPages',
  'item-limit': 'corePdfTooManyItems',
  'text-limit': 'corePdfTooMuchText',
  unexpected: 'corePdfUnexpected',

  /* prescription-parse: blocking findings */
  'empty-text': 'coreParseEmptyText',
  'no-layout': 'coreParseNoLayout',
  'bad-start-date': 'coreParseBadStartDate',
  'bad-end-date': 'coreParseBadEndDate',
  'bad-dose': 'coreParseBadDose',
  'bad-birth-date': 'coreParseBadBirthDate',
  'missing-first-name': 'coreParseMissingFirstName',
  'missing-last-name': 'coreParseMissingLastName',
  'missing-birth-date': 'coreParseMissingBirthDate',
  'no-rows': 'coreParseNoRows',
  'missing-issue-date': 'coreParseMissingIssueDate',
  incomplete: 'coreParseIncomplete',
  'no-crypto': 'coreParseNoCrypto',
  'unreadable-text': 'coreParseUnreadableText',

  /* prescription-parse: non-blocking findings */
  'missing-weight': 'coreParseMissingWeight',
  'missing-height': 'coreParseMissingHeight',
  'renal-unknown': 'coreParseRenalUnknown',
  'diabetes-unknown': 'coreParseDiabetesUnknown',
  'diabetes-unmatched': 'coreParseDiabetesUnmatched',
  'allergy-unknown': 'coreParseAllergyUnknown',
  'unit-unknown': 'coreParseUnitUnknown',
  'unit-identity-leak': 'coreParseUnitLeak',
  'missing-dtfrom': 'coreParseMissingStartDate',
  'route-undetermined': 'coreParseRouteUndetermined',
  'annotation-desync': 'coreParseAnnotationDesync',
  'language-undetected': 'coreParseLanguageUndetected',
};

/**
 * Keys of the codes that identify exactly one message.
 *
 * `internal` is the pipeline's own defensive finding (a stage that threw), not
 * a schema keyword, so it is mapped like the code it is.
 */
const CODE_KEYS: Readonly<Record<string, MessageKey>> = {
  'unknown-year': 'coreDecodeUnknownYear',
  'bad-prefix': 'coreDecodeBadPrefix',
  'bad-compression': 'coreDecodeBadCompression',
  'bad-base64': 'coreDecodeBadBase64',
  'bad-gzip': 'coreDecodeBadGzip',
  'not-pdf': 'corePdfNotPdf',
  'pdf-password': 'corePdfPassword',
  'pdf-corrupt': 'corePdfUnreadable',
  'render-failed': 'corePdfRenderFailed',
  'ocr-failed': 'corePdfOcrFailed',
  'ocr-low-confidence': 'coreOcrLowConfidence',
  internal: 'corePdfUnexpected',
};

/** The localized key of a core finding, or `undefined` when none is mapped. */
export function coreMessageKey(code: string, detail?: string): MessageKey | undefined {
  if (detail !== undefined) {
    const byDetail = DETAIL_KEYS[detail];
    if (byDetail !== undefined) {
      return byDetail;
    }
  }
  return CODE_KEYS[code];
}

/**
 * One core finding as display text, in the current locale.
 *
 * The chain above is what makes "never blank" structural rather than a promise:
 * a mapped key resolves through the dictionary chain (locale → en → key name),
 * an unmapped one falls back to the English message the core sent, and a
 * finding with neither shows its code. A whitespace-only result is treated as
 * missing, so an empty template can never erase a finding.
 */
export function coreMessageText(finding: CoreMessage): string {
  const key = coreMessageKey(finding.code, finding.detail);
  const localized = key === undefined ? '' : format(text(key), finding.params ?? {});
  if (localized.trim() !== '') {
    return localized;
  }
  const fallback = finding.message ?? '';
  if (fallback.trim() !== '') {
    return fallback;
  }
  return finding.code;
}
