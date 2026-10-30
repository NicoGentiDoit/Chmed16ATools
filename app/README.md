# ChMed16A Tools

> **Development and testing tool only — not a certified medical device, not for clinical use.**
> Everything runs in your browser; no document is ever uploaded.

A static, client-side-only validator, encoder, decoder, QR tool and PDF importer for CHMED16A
eMediplan documents. It is a vanilla TypeScript + Vite single-page app: no backend, no install, and
ready to publish on GitHub Pages at the project base path `/Chmed16ATools/`.

## What it is

The tool works on the `CHMED16A{Compression}{Data}` transmission format defined by
`ig-emediplan/specification`. It understands both the compressed (`CHMED16A1…`, standard
Base64 of gzipped JSON) and uncompressed (`CHMED16A0…`, plain JSON) variants, validates the
decoded document against a hand-written, spec-tolerant JSON Schema, and round-trips it back to
a CHMED string and a QR code. A printed eMediplan Medication Plan PDF can also be imported and
turned into a `MedType` 1 plan with the same JSON, string and QR.

Three tabs cover the whole workflow:

1. **JSON → CHMED16A** — validate a plan, encode it, copy/download the string and preview its
   QR code.
2. **CHMED16A → JSON** — type or paste a string, upload a QR image, or (optionally) scan with
   the camera, then read, copy or download the pretty-printed JSON.
3. **PDF → CHMED16A** — upload a printed Medication Plan PDF, extract the patient block and
   medication table, and get the validated Medication Plan JSON (`MedType` 1), the
   `CHMED16A1…` string and a QR preview. If validation blocks, the parsed JSON is shown as a
   draft and no string/QR is produced.

## Features

- **Validate JSON** — required fields, primitive types, enum values and cross-context rules for
  MP (`MedType` 1), PMC (`MedType` 2) and Rx (`MedType` 3), with per-field JSON Pointers.
- **Encode to CHMED16A** — canonical header (`CHMED16A` + uppercase sub-version + compression
  flag), UTF-8 JSON, deterministic gzip via pako and standard padded Base64; copy or download
  the result as `chmed16a.txt`.
- **Decode to JSON** — tolerant header/Base64 parsing, gzip inflation and JSON syntax checking
  with line/column on failure; copy or download the pretty-printed document as `chmed16a.json`.
- **Generate QR** — smallest fitting QR version 1–40 at a user-selectable error-correction level
  (L/M/Q/H, default M), rendered as an inline SVG with a 4-module quiet zone and a
  version/byte-count readout.
- **Scan QR** — decode an uploaded PNG/JPEG (or any image the browser can read), or scan live
  with `getUserMedia`; a successful scan fills the input and decodes immediately. The camera
  only starts on an explicit button press and stops on tab switch or page hide.
- **Import PDF** — upload a printed eMediplan Medication Plan (`Der Schweizer Medikationsplan`),
  parse its patient block and medication table, then validate, encode and preview the result.
  The output is always a Medication Plan (`MedType` 1), never an Rx. Text-layer PDFs are read
  directly and the medication table is reconstructed from the text-item geometry (per-table
  column bands), so layouts with oscillating column gaps and the German title vocabulary
  (`Medikament`, `Morgen`...`Nacht`, `Einheit`, `Von`, `Bis u. mit`, `Anleitung`, `Grund`,
  `Verordnet durch`, plus the 2023 layout's `Anwendungsinstruktion`, `Anwendungsgrund`) are read
  too. Printed patient measurements and risk categories fill `Patient.Med` where the spec table
  gives an unambiguous mapping; unmappable printed text is reported as a warning, never guessed.
- **Swissmedic ids from link annotations** — when the text-layer PDF carries link annotations
  over the medication rows, the referenced Swissmedic product number is attached to that row as
  `IdType` 4. Without a matching annotation — a text-only print, or an OCR result with no vector
  geometry — the id stays the printed text with `IdType` 1.
- **Per-row prescriber** — each medication row keeps the printed `Verordnet durch` value as
  `PrscbBy`. The document `Auth` is the printed provider GLN when the document states one and
  the literal `patient` otherwise; nothing is synthesized from a row into a document identity.
- **Draft mode** — when the extracted prescription does not validate (for example a printed
  patient field that could not be read), the parsed JSON is still shown, clearly marked as a
  draft, together with the blocking findings. The CHMED textarea, its copy/download buttons and
  the QR code stay empty and disabled: encoding is strictly gated on validation success.
- **OCR fallback** — PDFs with a text layer are parsed directly, without OCR. Scanned or
  image-only PDFs are recognized in the browser by a bundled tesseract.js worker (English +
  German traineddata), page by page; OCR-derived text is reported with a low-confidence warning
  so it is never mistaken for a clean text extraction. OCR has no vector geometry, so its
  product ids stay text-based (`IdType` 1).

All three tabs are keyboard-operable, use labelled controls with live regions for results, and keep
every user-visible string in `src/ui/i18n/messages/`, behind the `text()`/`format()` helpers of
`src/ui/i18n/` — see [Languages](#languages).

## Languages

The interface ships five locales as static modules bundled with the app — no fetch, no extra
dependency, no runtime network — and a switch repaints the whole shell without a page reload.

| Locale | Selector label | Dictionary |
| --- | --- | --- |
| `it` | Italiano | complete |
| `de` | Deutsch | complete |
| `fr` | Français | complete |
| `en` | English | complete — the source of truth for keys |
| `de-CH` | Deutsch (Schweiz) | `de` plus a four-entry delta |

- **Selector.** A labelled `<select>` in the header switches the language; the static labels,
  the home cards, the tab chips and the open panel repaint in place, and the document's `lang`
  attribute follows. The open tab keeps its state: typed JSON or CHMED text, decoded output and
  a running camera scan survive the switch. A result already produced (decoded JSON, findings,
  the PDF recap) keeps the language it was produced in; the next run renders in the current one.
- **First visit.** With nothing stored, the browser's language order decides — a `de-CH` tag
  wins over its `de` parent, then `it`, `de`, `fr`, `en` — and an unsupported or empty
  preference falls back to `en`. Auto-detection is not persisted, so a later browser-language
  change is still honoured until the user chooses explicitly.
- **Persistence.** An explicit choice is written under the `localStorage` key `chmed-locale`
  and restored before the first paint of the next visit. Storage access is guarded: where it is
  denied (private window, sandboxed frame) the switch still works and simply does not survive a
  reload.
- **Completeness is enforced.** `src/ui/i18n/messages/en.ts` is the key source; every complete
  dictionary must carry exactly that key set, and
  `src/ui/i18n/__tests__/completeness.test.ts` fails if a key is missing or empty. Resolution
  is locale entry → English entry → the key name, so a gap would degrade to English rather than
  to a blank control.
- **`de-CH` is a delta, not a second translation.** `src/ui/i18n/messages/de-CH.ts` holds only
  the entries that differ from `de` — currently four, all ß → ss spellings (two size-limit
  messages and the two height/weight findings). The resolver merges it over `de` once and
  caches the result, and the tests assert that each delta value really differs from its `de`
  counterpart, so a copied entry fails instead of drifting. `de-CH` is a UI vocabulary variant;
  the PDF parser stays on the `de` vocabulary.

### Known limitation: engine text stays English

Two kinds of English text remain untranslated in every locale, by design: the messages produced
by the bundled JSON Schema engine (Ajv) for rules the app's own schema does not phrase itself,
and the validator advisory wording that quotes those engine messages. The app's own findings,
stage labels, recap and guided-task text are localized; third-party engine output is left as
produced rather than machine-translated.

### Parser vocabulary: French and Italian

The PDF importer still targets the one printed paper layout documented in `chmed16a/README.md`;
what changed is vocabulary. Its tables now recognise the French and Italian seed vocabulary that
already existed in the matchers: the medication-table titles (`Médicament`/`Farmaco`,
`Matin`/`Mattina`, `Midi`/`Mezzogiorno`, `Soir`/`Sera`, `Nuit`/`Notte`,
`Quantité`/`Quantità`, `Du`/`Dal`, `Au`, `Instructions`/`Indicazioni`, `Raison`/`Motivo`,
`Prescrit par`/`Prescritto`), the patient-block labels, the issue-date label, the
self-medication tokens (`Automédication`, `Automedicazione`) and part of the risk vocabulary
(`insuffisance rénale`/`insufficienza renale`, `légère`/`leggera`, `aucune`/`nessuna`, …).

This is vocabulary coverage, not verified parsing:

- **No French or Italian PDF has been parsed.** The repository prints the paper titles in
  English only and points to the external IG eMediplan site for the translations, so no further
  token could be taken from the specification. The seed tokens' behaviour is pinned by
  vocabulary-level tests; a real FR/IT sample remains a follow-up.
- **`Lng` stays empty for FR/IT.** Only German and English evidence is scored, so a French or
  Italian page keeps the `''` placeholder and is flagged `language-undetected` instead of being
  guessed as `de`.
- **Deliberately unfilled gaps**, left open rather than invented: the Italian `Al` column title
  (only `Fino` matches `upTo`), Italian provider/organisation labels (`prescritto da`,
  `farmacia`, `studio`), French and Italian page markers (`Page 1 sur 1`, `Pagina 1 di 1`),
  comment stop words and reserve-table titles beyond the German/English ones. A document
  printing those is not supported and fails with a parse finding rather than a guess.

## Quick start

Node 22 is what CI uses.

```sh
cd app
npm ci
npm run dev      # local dev server
npm run build    # type-check + production build into app/dist
npm run preview  # serve the built app locally
npm run lint
npm run test
```

`vite.config.ts` sets `base: '/Chmed16ATools/'` because GitHub Pages serves this repository as a
**project site** under `https://<user>.github.io/Chmed16ATools/`; without that base the hashed
asset URLs would 404. For a user/organization site or a custom domain, change `base` to `/`.

Deployment is handled by the workflows at the repository root: `.github/workflows/ci.yml` runs
lint, test and build on pushes and pull requests that touch `app/`, and
`.github/workflows/deploy.yml` publishes `app/dist` with `actions/deploy-pages` on pushes to
`main` (or manually via *Run workflow*). Select **GitHub Actions** as the Pages source once in
the repository settings. The workflows only take effect after you push this repository to your
own GitHub remote — this checkout's `origin` still points at the upstream
`ig-emediplan/specification` repository.

## Privacy

- **No backend.** There is no server component and no API call of any kind; the app is a static
  bundle of HTML, CSS and JavaScript.
- **No telemetry and no analytics.** No third-party scripts, pixels or error reporting.
- **No document persistence.** Documents live in the form fields for the lifetime of the page;
  no document, extracted value or result is written to `localStorage`, `sessionStorage`,
  IndexedDB or cookies. The only stored value is the UI language tag (`chmed-locale`, see
  [Languages](#languages)). PDFs are read into memory and discarded when the page is closed.
- **No document or extracted data is ever transmitted.** Encoding, decoding, validation, QR
  generation, PDF parsing and OCR are in-browser computation; uploaded QR images are read locally
  with `createImageBitmap`, PDF bytes never leave the page, and no document or extracted data is
  sent anywhere. Clipboard and download use browser-local APIs only.
- **The OCR engine is bundled, not fetched.** The tesseract.js worker, the LSTM WASM cores and the
  English/German traineddata are shipped under `public/tesseract/`, and Vite builds the pdf.js
  worker into the app's own asset directory. The libraries' default CDN endpoints are overridden and
  language caching is disabled, so recognizing a scanned PDF performs no external request.
- **Camera needs HTTPS.** `getUserMedia` is only available in a secure context; GitHub Pages
  serves over HTTPS, so scanning works there. On `http://localhost` it also works. Image upload
  is always available as the fallback and requires no permission.
- **Findings may quote input.** A finding can echo a short clipped fragment of PDF- or OCR-derived
  text (for example an unreadable date); it is rendered as text only, never as markup. The page
  shell (Lucide icons and the Inter web font) is loaded from a CDN, while the PDF/OCR pipeline
  itself is fully offline.
- After the shell assets have loaded the app works fully offline: it then loads only its own bundled
  assets and system fonts, with no further external requests.

## Limits and assumptions

- **QR capacity is runtime-computed.** The specification only calls the payload size "limited"
  and gives no number, so the encoder asks `qrcode-generator` for the smallest version that
  fits and reports capacity as UTF-8 bytes. Observed version-40 ceilings for byte mode are about
  **L ≈ 2953, M ≈ 2331, Q ≈ 1663, H ≈ 1273 characters** for ASCII payloads (fewer for
  multi-byte text). A document that does not fit at the chosen level is a blocking
  `qr-overflow` result that shows the byte count and suggests a lower level; no symbol is drawn.
- **No chunking for 16A.** Multi-symbol chunking exists only for release year 23; there is no
  16A equivalent, so an oversized document cannot be split across several QR codes.
- **Rx revision 1 is validated leniently.** The revision tables for Rx rev1 (and the extra rev2
  wording) are absent from the public spec repository, so rev1 is validated as a minimally
  constrained "MP-flavoured Rx" and reported with a `rev1-assumption` warning. Rev2 is treated
  as rev3 minus `IndC`; an unknown revision ≥ 4 is validated as rev3 with a warning, since
  revisions are additive.
- **Unknown fields are preserved losslessly.** Decoding does not strip anything and re-encoding
  keeps the same JSON, so forward-compatible fields survive a round-trip; the validator warns
  (`unknown-field`) instead of failing.
- **Gzip byte parameters are non-normative.** The official examples' gzip headers (e.g. MTIME)
  differ from common tool defaults, so only the *decoded JSON* is guaranteed to round-trip.
  Do not expect byte-identical Base64 across tools; the app never compares or emits Base64 as a
  canonical value.
- **PDF import targets one printed layout family.** Only the Swiss Medication Plan paper layout
  (`Der Schweizer Medikationsplan`, documented in `chmed16a/README.md`) is understood. Free-form
  doctor letters, other generators' layouts and multi-prescription pages are out of scope and
  fail with a parse finding ("no eMediplan prescription was found") instead of a guess. The German
  layout is the only one verified against a real PDF and a committed reference; French and Italian
  paper layouts are recognised by vocabulary only and remain ground-truth-untested — a planned
  follow-up, not a delivered feature. [Languages](#languages) lists that vocabulary and the gaps
  that stay open.
- **A multi-page medication table is not recomposed.** Each page is tabulated on its own and
  joined in page order. A repeated column header is treated as a continuation, but a row that
  physically splits across a page break is not stitched back together.
- **Swissmedic ids depend on link annotations.** `IdType` 4 is used only when a link annotation on
  the same page geometrically overlaps a medication row. A text-only print with no product links,
  an OCR result (no vector geometry), or an id whose printed text does not parse keeps the printed
  id text and `IdType` 1. Pairing annotations needs both a text layer and the tabulated row bands,
  so the annotation path requires a text layer; an OCR document never has one.
- **The committed examples are public sample identities.** The reference PDF and its derived
  fixture come from the public "Der Schweizer Medikationsplan" HCI material; the patient,
  prescriber and medication names in it are fictitious examples, not patient data.
- **Encoding requires validation.** A prescription that fails `validateObject` is never encoded:
  the UI shows the rejected JSON as a draft and keeps the CHMED string, its copy/download buttons
  and the QR code empty, so a draft can never be mistaken for a transmittable document.
- **PDF work is bounded.** Files larger than 25 MB are refused before they are read, at most 200
  pages are accepted for text extraction, at most 20 pages are rasterized and OCR'd, and the
  accumulated text is capped (2 MiB characters, 50 000 text items per page); larger documents fail
  closed rather than locking the tab.
- **OCR is a lower-confidence path.** OCR text can misread digits, decimal separators and
  fractions, so a result obtained through OCR is flagged with a low-confidence warning. Always
  compare it against the paper original before trusting the encoded string.
- **OCR languages are fixed at build time.** The bundle ships English and German traineddata
  (`eng+deu`, the default); requests for other languages are rejected rather than downloaded.
- **Password-protected and corrupt PDFs fail closed.** The app reports a clean finding for an
  unreadable, encrypted or truncated PDF; it never throws and never emits a partial prescription.
- Smaller assumptions: `D` (doses) has 0–4 entries in morning/noon/evening/night order; Base64
  uses standard padding on encode and tolerates missing/extra padding and surrounding whitespace
  on decode; the sub-version letter is case-insensitive on parse and uppercased on serialize;
  `Measurement.Val` is a string and its unit must pair with the measurement type; a printed QR
  code should be at least 4 × 4 cm; the physical scanner is out of scope — scanning is camera or
  image based.

## Validation policy

- **Blocking (errors, red, encode disabled):** missing required properties, wrong JSON types,
  enum values outside the tables, malformed Rx `IndC`, an `Auth` GLN that is not repeated in
  `HcPerson.Gln`, and any header/Base64/gzip/JSON-syntax failure while decoding.
- **Non-blocking (warnings, amber, output still produced):** unknown or context-inappropriate
  fields, non-lowercase `Lng`, risk ids outside the listed table (external codes), empty-string
  optionals, unparseable or mismatched `Measurement` values, more than four `D` entries,
  private fields ignored because `PSchema` is empty, the rev1 assumption and unknown revisions.

Warnings never change the bytes of the output; they only tell you what a stricter reader might
notice.

## License

The specification text and examples this tool implements come from
[`ig-emediplan/specification`](https://github.com/ig-emediplan/specification), which is released
under the MIT license; that license is respected, and the code cites the relevant specification
anchors next to each rule. **No proprietary DLL or vendor code was copied or decompiled** — the
encoder, decoder, validator, PDF importer and QR handling are an independent TypeScript
implementation written from the published specification, using the bundled open-source libraries
`pako`, `ajv`, `jsqr`, `qrcode-generator`, `pdfjs-dist` (Apache-2.0) and `tesseract.js`
The dependency and derogation record is maintained locally (git-ignored TECH_STACK/TECH_DECISIONS) and is intentionally not committed.

## Disclaimer

This is a development and testing tool. It is **not** a certified medical device, has not
undergone regulatory review, and must not be used for clinical decisions, prescribing or patient
care. Always check results against the official specification and your certified software.
