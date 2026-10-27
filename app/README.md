# ChMed16A Tools

> **Development and testing tool only — not a certified medical device, not for clinical use.**
> Everything runs in your browser; no document is ever uploaded.

A static, client-side-only validator, encoder, decoder and QR tool for CHMED16A eMediplan
documents. It is a vanilla TypeScript + Vite single-page app: no backend, no install, and ready
to publish on GitHub Pages at the project base path `/Chmed16ATools/`.

## What it is

The tool works on the `CHMED16A{Compression}{Data}` transmission format defined by
`ig-emediplan/specification`. It understands both the compressed (`CHMED16A1…`, standard
Base64 of gzipped JSON) and uncompressed (`CHMED16A0…`, plain JSON) variants, validates the
decoded document against a hand-written, spec-tolerant JSON Schema, and round-trips it back to
a CHMED string and a QR code.

Two tabs cover the whole workflow:

1. **JSON → CHMED16A** — validate a plan, encode it, copy/download the string and preview its
   QR code.
2. **CHMED16A → JSON** — type or paste a string, upload a QR image, or (optionally) scan with
   the camera, then read, copy or download the pretty-printed JSON.

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

Both tabs are keyboard-operable, use labelled controls with live regions for results, and keep
all UI text in `src/ui/strings.ts` so a later Italian localization only touches one file.

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
- **No persistence.** Documents live in the form fields for the lifetime of the page; nothing is
  written to `localStorage`, `sessionStorage`, IndexedDB or cookies.
- **Data never leaves the browser.** Encoding, decoding, validation and QR generation are pure
  in-browser computation; uploaded QR images are read locally with `createImageBitmap` and never
  transmitted. Clipboard and download use browser-local APIs only.
- **Camera needs HTTPS.** `getUserMedia` is only available in a secure context; GitHub Pages
  serves over HTTPS, so scanning works there. On `http://localhost` it also works. Image upload
  is always available as the fallback and requires no permission.
- After the first load the app works fully offline: it loads only its own bundled assets and
  system fonts, with no external requests.

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
encoder, decoder, validator and QR handling are an independent TypeScript implementation written
from the published specification, using the bundled open-source libraries `pako`, `ajv`, `jsqr`
and `qrcode-generator`.

## Disclaimer

This is a development and testing tool. It is **not** a certified medical device, has not
undergone regulatory review, and must not be used for clinical decisions, prescribing or patient
care. Always check results against the official specification and your certified software.
