/**
 * Swiss German (`de-CH`) delta over the German dictionary.
 *
 * Policy (locked): `de-CH` is a UI/parse vocabulary variant only — the parser
 * keeps using `de`. This file therefore holds ONLY the entries that differ from
 * `de` (ß → ss spellings and Swiss phrasing); everything else is inherited.
 *
 * `uiLanguageLabel` is inherited too: "Sprache" is identical in `de` and
 * `de-CH`, so it is not part of the delta (phase 10 trimmed the duplicate that
 * phase 2 had added). The invariant is enforced fail-closed in
 * `__tests__/completeness.test.ts`: the raw delta may only hold English keys,
 * every delta value must differ from its `de` counterpart, and `de` + delta must
 * still cover the full English key set.
 */

import type { MessageDelta } from './en';

export const deCH: MessageDelta = {
  /* ── i18n phase 3: JSON→CHMEDA panel and shared components ── */
  // Swiss spelling: no ß. Everything else in this phase's scope is inherited.
  dropFileTooLarge: '"{name}" ist grösser als 1 MiB. Es wurde nichts geladen.',

  /* ── i18n phase 4: CHMED→JSON panel (decode, scan, camera) ── */
  // No delta: no key of this phase carries ß and the German wording is already
  // the neutral Swiss phrasing, so every entry is inherited unchanged.

  /* ── i18n phase 5: PDF panel + review table ── */
  // Swiss spelling: no ß. `pdfFileTooLarge` is the only entry of this phase whose
  // German wording carries one ("größer"); every other label of the phase is
  // inherited unchanged from `de`.
  pdfFileTooLarge: 'Das ausgewählte PDF ist grösser als 25 MB. Eine kleinere Datei wählen.',

  /* ── i18n phase 7: core decode/header/pdf-extract findings ── */
  // No delta: the German entries of this phase avoid ß by wording alone
  // ("höchstens", "passwortgeschützt", "beschädigt"), so every one of them is
  // inherited unchanged from `de`.

  /* ── i18n phase 8: core prescription-parse findings ── */
  // Swiss spelling: no ß. Only the two height/weight advisories carry one in
  // German ("Größen-…", "Größenwert"); every other entry of this phase is
  // inherited unchanged from `de`.
  coreParseMissingWeight:
    'Die gedruckte Grössen-/Gewichtszeile enthält keinen lesbaren Gewichtswert; er wird weggelassen, statt erfunden zu werden.',
  coreParseMissingHeight:
    'Die gedruckte Grössen-/Gewichtszeile enthält keinen lesbaren Grössenwert; er wird weggelassen, statt erfunden zu werden.',
};
