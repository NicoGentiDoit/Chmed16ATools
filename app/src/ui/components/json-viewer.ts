/**
 * Structured, read-only view of a decoded JSON document.
 *
 * The viewer is presentation only: it receives the already-decoded value (an
 * `unknown` straight from `parseJsonText`, never re-read from the textarea) and
 * renders each TOP-LEVEL key inside a native `<details>` disclosure. The raw
 * textarea stays the canonical data holder for copy/download; this module never
 * touches it.
 *
 * Rendering strategy — escape first, wrap second:
 * - the formatted text is produced by the same `JSON.stringify(value, null, 2)`
 *   the panel uses for the textarea;
 * - the tokenizer walks that text, entity-escapes every gap and every token
 *   (`escapeHtml`), and only then concatenates the `<span>` wrappers. Because
 *   every piece of document text passes through `escapeHtml` before it becomes
 *   markup, a key or string containing `</pre><script>` can only ever render
 *   as literal text.
 *
 * No dependency: the tokenizer is a hand-written regular expression over valid
 * JSON output, and the disclosure uses the browser's native `<details>`/`<summary>`
 * semantics (keyboard operable, screen-reader safe) with the native marker —
 * no Lucide icon and no `refreshIcons()` call.
 *
 * ## Missing-required marks (plan 005, phase 3 — opt-in)
 *
 * A caller may pass `missingSections` (top-level section names derived from
 * required-missing findings it already holds — the viewer never validates). A
 * present section then gets a visible mark in its summary: a text badge (glyph +
 * `jsonMissingRequired` words), so the state never depends on colour alone. A
 * section that is absent from the document entirely cannot be marked inside its
 * own `<details>` — there is none — so it is rendered as a marked PLACEHOLDER
 * disclosure with the section name as its title and no content. The names are
 * data-informed (schema sections named by the findings), never invented values,
 * and every one of them is written with `textContent`.
 */

import { format, text } from '../strings';
import { el } from './dom';

/** Handle returned by {@link createJsonViewer}. */
export interface JsonViewerHandle {
  /**
   * Renders a decoded JSON value; replaces any previous content.
   *
   * `options` overrides the defaults the viewer was created with, so a caller
   * can refresh the missing-required marks on every edit without re-creating
   * the viewer.
   */
  render(value: unknown, options?: JsonViewerOptions): void;
  /** Empties the view (the DOM nodes are dropped, not hidden). */
  clear(): void;
  /**
   * Re-resolves the labels that are not document content for the current locale.
   *
   * In place, like the other components' `relabel`: the section hints, the
   * missing-required badge and the region's accessible name change, while every
   * `<details>` keeps its node and its open/closed state. Section titles are the
   * document's own keys and are never re-worded. Nothing has been rendered yet
   * (or the view was cleared) → only the accessible name is rewritten.
   */
  relabel(): void;
}

/** Optional presentation inputs for the viewer (defaults: none). */
export interface JsonViewerOptions {
  /**
   * Top-level section names whose required properties are missing. A section
   * present in the document gets a mark in its summary; a section absent from
   * the document is rendered as a marked placeholder disclosure.
   */
  readonly missingSections?: ReadonlySet<string>;
}

/** One rendered top-level disclosure. */
interface JsonSection {
  readonly title: string;
  readonly value: unknown;
}

/**
 * Matches, in order: a quoted string (optionally followed by `:` so keys are
 * recognisable), a JSON number, and the three literals. Runs over
 * `JSON.stringify` output only, so there is no need to handle comments,
 * single quotes or trailing commas.
 */
const TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** Entity map for JSON's significant characters. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for use as HTML element content or inside a double-quoted
 * attribute. This is the ONLY way document text becomes part of the markup
 * below: `highlightJson` calls it for the text between tokens and for every
 * token payload, and never interpolates the raw source.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

/**
 * Formats a value exactly like the panel formats the textarea content. JSON
 * cannot contain `undefined`, but `JSON.stringify(undefined)` returns
 * `undefined` at runtime, so the guard keeps the return type a plain string.
 */
function formatJson(value: unknown): string {
  const formatted: unknown = JSON.stringify(value, null, 2);
  return typeof formatted === 'string' ? formatted : 'null';
}

/** Splits the formatted text into tokens and wraps each one in a span. */
function highlightJson(source: string): string {
  let html = '';
  let cursor = 0;
  TOKEN_PATTERN.lastIndex = 0;

  for (let match = TOKEN_PATTERN.exec(source); match !== null; match = TOKEN_PATTERN.exec(source)) {
    const raw = match[0] ?? '';
    const quoted = match[1];
    const colon = match[2];
    const number = match[3];
    const literal = match[4];

    // Escape the formatting between tokens (indentation, punctuation, commas).
    html += escapeHtml(source.slice(cursor, match.index));

    if (quoted !== undefined) {
      // A quoted token followed by `:` is an object key; the colon itself stays
      // uncoloured. Both parts are escaped before they are wrapped/concatenated.
      html += `<span class="json-key">${escapeHtml(quoted)}</span>`;
      if (colon !== undefined) {
        html += escapeHtml(colon);
      }
    } else if (number !== undefined) {
      html += `<span class="json-number">${escapeHtml(number)}</span>`;
    } else if (literal !== undefined) {
      const className = literal === 'null' ? 'json-null' : 'json-boolean';
      html += `<span class="${className}">${escapeHtml(literal)}</span>`;
    } else {
      // Unreachable for JSON output; keep the text escaped rather than dropping it.
      html += escapeHtml(raw);
    }

    cursor = match.index + raw.length;
  }

  html += escapeHtml(source.slice(cursor));
  return html;
}

/** `true` for a plain JSON object (never `null`, never an array). */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Compact type/size hint shown next to the section title, e.g. "5 items". */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    const template = value.length === 1 ? text('jsonSectionItem') : text('jsonSectionItems');
    return format(template, { count: value.length });
  }
  if (isJsonObject(value)) {
    const count = Object.keys(value).length;
    if (count === 0) {
      return text('jsonSectionEmpty');
    }
    const template = count === 1 ? text('jsonSectionKey') : text('jsonSectionKeys');
    return format(template, { count });
  }
  if (value === null) {
    return text('jsonTypeNull');
  }
  switch (typeof value) {
    case 'string':
      return text('jsonTypeString');
    case 'number':
      return text('jsonTypeNumber');
    case 'boolean':
      return text('jsonTypeBoolean');
    default:
      return text('jsonTypeUnknown');
  }
}

/**
 * Top-level sections: one per key of a non-empty object, otherwise the whole
 * document as a single "Document" section (empty object, array or scalar).
 */
function topLevelSections(value: unknown): JsonSection[] {
  if (isJsonObject(value)) {
    const entries = Object.entries(value);
    if (entries.length > 0) {
      return entries.map(([title, entry]) => ({ title, value: entry }));
    }
  }
  return [{ title: text('jsonDocumentSection'), value }];
}

/**
 * One painted disclosure plus the label nodes `relabel` rewrites in place.
 *
 * `hint` is the translated type/size hint and `value` is the value it describes;
 * a whole-section placeholder has no content, hence no hint. `markLabel` is the
 * word half of the missing-required badge, when the section carries one.
 */
interface PaintedSection {
  readonly node: HTMLElement;
  readonly hint: HTMLElement | null;
  readonly value: unknown;
  readonly markLabel: HTMLElement | null;
}

/** One `<details>` with its summary and highlighted `<pre>`. */
function createSection(title: string, value: unknown, missing: boolean): PaintedSection {
  const details = el('details', 'json-section');
  // Every section starts collapsed: a native `<details>` without `open` is
  // closed by default, so the summary alone is shown until the user expands it.

  const summary = el('summary', 'json-section-summary');
  const titleNode = el('span', 'json-section-title');
  titleNode.textContent = title;
  const hintNode = el('span', 'json-section-hint');
  hintNode.textContent = `(${describeValue(value)})`;
  summary.append(titleNode, hintNode);
  const mark = missing ? createMissingMark() : null;
  if (mark !== null) {
    summary.append(mark.node);
  }

  const code = el('pre', 'json-code');
  // Safe: `highlightJson` escapes every token and every gap before wrapping it
  // in a span, so no document text reaches the DOM as live markup.
  code.innerHTML = highlightJson(formatJson(value));

  details.append(summary, code);
  return { node: details, hint: hintNode, value, markLabel: mark?.label ?? null };
}

/** A painted missing-required badge: its node plus the word node it carries. */
interface MissingMark {
  readonly node: HTMLElement;
  readonly label: HTMLElement;
}

/**
 * Visible missing-required badge: a glyph plus the words, both built through
 * the DOM API.
 *
 * No `PanelIconName` in `buttons.ts` conveys absence, and adding one is outside
 * this phase's file scope, so the marker is a text glyph in a span (`aria-hidden`,
 * because the words right after it carry the meaning) followed by the label.
 * The returned `label` is kept so `relabel` can re-word it without rebuilding
 * the badge.
 */
function createMissingMark(): MissingMark {
  const mark = el('span', 'json-section-missing');
  const glyph = el('span', 'json-section-missing-icon');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '!';
  const label = el('span', 'json-section-missing-label');
  label.textContent = text('jsonMissingRequired');
  mark.append(glyph, label);
  return { node: mark, label };
}

/**
 * Placeholder disclosure for a top-level section that is absent entirely.
 *
 * The title is a section name the findings already named; nothing is invented,
 * and an empty section needs no `<pre>` content. This is the only way a missing
 * WHOLE section can be marked, since it has no `<details>` of its own.
 */
function createMissingSection(title: string): PaintedSection {
  // Native `<details>` default: no `open`, so the placeholder starts collapsed too.
  const details = el('details', 'json-section json-section-absent');

  const summary = el('summary', 'json-section-summary');
  const titleNode = el('span', 'json-section-title');
  titleNode.textContent = title;
  const mark = createMissingMark();
  summary.append(titleNode, mark.node);

  details.append(summary);
  return { node: details, hint: null, value: undefined, markLabel: mark.label };
}

/**
 * Mounts a viewer inside `container` and returns its handle.
 *
 * The root is a labelled `region` (not a `tree`): the document structure is
 * already conveyed by the nested `<details>` elements, and a tree role would
 * require a full keyboard model this read-only view does not need.
 */
export function createJsonViewer(
  container: HTMLElement,
  defaults: JsonViewerOptions = {},
): JsonViewerHandle {
  const root = el('div', 'json-viewer');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', text('jsonOutputLabel'));
  container.append(root);

  /** The disclosures last painted, so `relabel` can re-word their labels. */
  let painted: readonly PaintedSection[] = [];

  const render = (value: unknown, options?: JsonViewerOptions): void => {
    const missingSections = options?.missingSections ?? defaults.missingSections;
    const sections = topLevelSections(value);
    const present = new Set(sections.map((section) => section.title));
    const paintedSections = sections.map((section) =>
      createSection(
        section.title,
        section.value,
        missingSections?.has(section.title) === true,
      ),
    );
    if (missingSections !== undefined) {
      // Whole-section absences get a marked placeholder, in the order the
      // findings named them. They are appended after the real sections so the
      // document's own order is never reshuffled.
      for (const title of missingSections) {
        if (!present.has(title)) {
          paintedSections.push(createMissingSection(title));
        }
      }
    }
    painted = paintedSections;
    root.replaceChildren(...paintedSections.map((section) => section.node));
  };

  const relabel = (): void => {
    root.setAttribute('aria-label', text('jsonOutputLabel'));
    for (const section of painted) {
      if (section.hint !== null) {
        section.hint.textContent = `(${describeValue(section.value)})`;
      }
      if (section.markLabel !== null) {
        section.markLabel.textContent = text('jsonMissingRequired');
      }
    }
  };

  const clear = (): void => {
    root.replaceChildren();
    painted = [];
  };

  return { render, clear, relabel };
}
