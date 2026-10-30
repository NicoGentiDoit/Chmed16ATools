/**
 * Shared findings/validation view.
 *
 * Three levels in reading order: errors (blocking, export refused), warnings
 * (export allowed) and info (technical detail, e.g. what the PDF pipeline did).
 * Every level carries an icon, a text label and a count, so the severity is
 * never conveyed by colour alone.
 *
 * ## Guided tasks (plan 005, phase 1 — opt-in)
 *
 * When the caller passes `guidedTasks: true`, a missing-required error is also
 * presented as an actionable task ("Add patient" + a link to the field),
 * followed by a native "Technical details" disclosure that keeps the original
 * prose of every level byte-identical. Only the PDF panel opts in; flows 1 and 2
 * keep calling `render` exactly as before, so their DOM is unchanged. This layer
 * is presentation only: it never classifies, gates or re-words a finding. The
 * field nouns it names come from the locale dictionaries (`taskField*` keys), so
 * a language switch relabels the task copy through `relabel` below.
 *
 * The same flag turns on stable item ids (`task-row-N`, `finding-error-N`, ...)
 * which the review table uses for `aria-describedby`; the id builders are
 * exported so both components share one formula.
 *
 * ## In-place refresh (plan 005, phase 4)
 *
 * `render` still owns the public API and the full rebuild, but it rebuilds only
 * when the *shape* of the view changes. Shape = the number of tasks, the number
 * of items per level, and how each item reaches its finding (an anchor, a
 * `<code>` path, or nothing). While that shape is unchanged — the normal case
 * for an edit-revalidation, where a value changes but no task is added or
 * resolved — the existing nodes are updated in place: the summary text, a
 * level's count label, an item's id, its link label/href (re-linked in the
 * anchor map, the node is kept) and its message text node. Nothing is created,
 * removed or reordered.
 *
 * That is what keeps the live region calm (no re-announcement of a list that
 * only changed one word) and keeps the page scroll position and any focus that
 * sits inside the view exactly where it was.
 *
 * COMPATIBILITY CONTRACT — the DOM after an in-place refresh is node-for-node
 * identical to what a rebuild from the same findings would produce. It holds by
 * construction, in two steps:
 * - the rebuild path is the only code that authors nodes, and the structure it
 *   authors is a pure function of the shape signature (counts + lead kinds:
 *   summary always, `ok` paragraph iff all levels are empty, task list and
 *   `details` iff there are tasks, one `h4` + `ul` per non-empty level, one lead
 *   node iff the item has one, one message text node per level item);
 * - the refresh path only assigns `id`, `textContent`/`data` and `href` on the
 *   nodes that paint produced, from the same model.
 * So a refresh can only differ from a rebuild if the shape matched and the
 * content differs — and in that case the rebuild would author the very nodes a
 * refresh leaves untouched. A focused task/finding item that survives an update
 * therefore keeps its node (and its focus); an item that is *removed* because it
 * resolved is only ever removed by a rebuild, and the browser then drops focus
 * with it — accepted and documented in the plan.
 */

import { format, text } from '../strings';
import type { UiStringKey } from '../strings';
import { el } from './dom';

/** A validation finding flattened for rendering. */
export interface Finding {
  readonly path: string;
  readonly message: string;
  /**
   * Ajv keyword of the failed rule (`required`, `type`, ...). Additive: the
   * panels that pre-date guided tasks leave it out.
   */
  readonly keyword?: string;
  /**
   * Ajv `params.missingProperty` of a `required` failure (reported on the
   * parent object, naming the absent child). Additive, like `keyword`.
   */
  readonly missingProperty?: string;
}

/** Level an id-bearing finding item belongs to. */
export type FindingLevel = 'error' | 'warning' | 'info';

/**
 * Id of one level item. 1-based so the first item reads `finding-error-1`.
 * Exported because the review table references the very same ids in
 * `aria-describedby`; one builder keeps both sides from drifting.
 */
export function findingItemId(level: FindingLevel, index: number): string {
  return `finding-${level}-${index + 1}`;
}

/** Id of one guided task row. 1-based, same reasoning as {@link findingItemId}. */
export function taskRowId(index: number): string {
  return `task-row-${index + 1}`;
}

/** The part of a finding that decides whether it becomes a guided task. */
export interface TaskFindingShape {
  readonly keyword?: string;
  readonly missingProperty?: string;
}

/**
 * True when a finding names a required value that is absent. Ajv reports a
 * `required` failure on the parent object, so either signal is enough; the
 * review table uses the same predicate to point an input at its task row.
 */
export function isTaskFinding(finding: TaskFindingShape): boolean {
  return finding.keyword === 'required' || finding.missingProperty !== undefined;
}

/**
 * Moves focus to an anchor target and brings it into view.
 *
 * Exported so the PDF recap's "Fix ... data" buttons use exactly the same
 * motion as the findings links: hash navigation is always prevented by the
 * caller, and reduced-motion users get an instant jump instead of a smooth one.
 */
export function focusAnchorTarget(target: HTMLElement): void {
  target.focus();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

/**
 * Maps a finding to the control its path points at.
 *
 * A panel that has no sensible target can omit the resolver; the path is then
 * rendered as plain text, exactly as before this level was introduced.
 */
export type FindingAnchorResolver = (finding: Finding) => HTMLElement | null;

export interface FindingsViewOptions {
  /** Anchor resolver; `null` results (and empty paths) keep the plain path. */
  readonly getAnchorTarget?: FindingAnchorResolver;
  /**
   * Enables the guided task layer and item ids. Off by default: the two JSON
   * flows keep their byte-identical rendering.
   */
  readonly guidedTasks?: boolean;
}

export interface FindingsView {
  /**
   * Renders the summary, then one list per non-empty level.
   *
   * `successes` is optional so the two flows without an info level keep calling
   * this with two arguments; an empty list appends no DOM at all and leaves the
   * summary byte-identical to the two-level wording.
   */
  render(
    errors: readonly Finding[],
    warnings: readonly Finding[],
    successes?: readonly Finding[],
  ): void;
  /** Shows a single neutral message instead of findings. */
  message(value: string): void;
  /**
   * Re-resolves every label for the current locale.
   *
   * Unlike `render`, a locale change is presentation-only, so this replaces the
   * painted nodes (through the same authoring path) instead of updating them in
   * place: the empty-state wording and the `details` summary are text nodes a
   * refresh cannot rewrite without rebuilding. A message state has no labels of
   * its own and is left to the caller, which re-issues its key.
   */
  relabel(headingText: string): void;
}

/** Variant used for both the level heading and its list. */
type FindingVariant = 'is-error' | 'is-warning' | 'is-success';

/**
 * Icon per level. Kept to long-standing Lucide names: an unknown name makes
 * `createIcons` a no-op, which degrades gracefully to the text label because
 * the empty placeholder is hidden by CSS.
 */
type FindingIconName = 'circle-alert' | 'triangle-alert' | 'info' | 'circle-check';

/**
 * Human wording for the object/property a missing-required finding names.
 *
 * The task label only needs a short, readable noun, so the map holds dictionary
 * KEYS rather than text: the nouns ("patient", "birthdate", ...) are part of the
 * guided-task copy, which must follow the selected locale like every other
 * label. Unknown keys fall back to the raw JSON key (which the technical details
 * spell out anyway), so a schema addition can never blank a task.
 */
const TASK_FIELD_LABELS: Readonly<Record<string, UiStringKey>> = {
  Patient: 'taskFieldPatient',
  Medicaments: 'taskFieldMedicaments',
  FName: 'taskFieldFName',
  LName: 'taskFieldLName',
  BDt: 'taskFieldBDt',
  Gln: 'taskFieldGln',
  Name: 'taskFieldName',
  Id: 'taskFieldId',
};

/**
 * Required keys the review table actually renders as an editable field.
 *
 * The task list derives from the core findings, which name schema requirements
 * the table cannot surface (a medicament's `IdType`, for example).
 * Such a task has no field to point at, so its label names the section instead
 * ("Go to medicament data") rather than a field the page never shows. Keep in
 * step with the review table's editable whitelist (its header comment).
 */
const RENDERED_REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Patient: ['FName', 'LName', 'BDt'],
  Medicaments: ['Id'],
};

/** Last non-empty path segment, used when a task carries no property name. */
function lastPathSegment(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '');
  return segments.at(-1) ?? text('taskFieldFallback');
}

/** Section a task belongs to: the path's first segment, or the missing root key. */
function taskSectionKey(finding: Finding): string {
  if (finding.path === '') {
    return finding.missingProperty ?? '';
  }
  return finding.path.replace(/^\/+/, '').split('/')[0] ?? '';
}

/**
 * Readable section for a task whose missing key has no rendered field, else
 * `null`.
 *
 * Only a missing *leaf* of a known section qualifies: a bare field key (path
 * `/Patient`, missing `Lng`) or a missing whole section (path `''`, missing
 * `Patient`) already reads as a section and keeps its existing wording, and so
 * does every key the table does render.
 */
function taskSectionDataLabel(finding: Finding): string | null {
  const missing = finding.missingProperty;
  if (missing === undefined) {
    return null;
  }
  const section = taskSectionKey(finding);
  const rendered = RENDERED_REQUIRED_FIELDS[section];
  const nameKey = TASK_FIELD_LABELS[section];
  if (rendered === undefined || nameKey === undefined) {
    return null;
  }
  if (missing === section || rendered.includes(missing)) {
    return null;
  }
  return text(nameKey);
}

/** Readable noun for a guided task ("patient", "birthdate", ...). */
function taskFieldLabel(finding: Finding): string {
  const missing = finding.missingProperty;
  if (missing === undefined) {
    return lastPathSegment(finding.path);
  }
  const nameKey = TASK_FIELD_LABELS[missing];
  return nameKey === undefined ? missing : text(nameKey);
}

/**
 * A resolved lead: an anchor when a control resolves, a `<code>` path when the
 * path exists but nothing focuses it, and nothing at all for an empty path.
 */
type Lead =
  | { readonly kind: 'link'; readonly target: HTMLElement; readonly label: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'none' };

/** One row of the rendered model, before any node exists. */
interface RenderedItem {
  readonly id: string | null;
  readonly finding: Finding;
  readonly lead: Lead;
}

/** One level of the rendered model (`Errors`, `Warnings`, `Info`). */
interface RenderedLevel {
  readonly level: FindingLevel;
  readonly label: string;
  readonly variant: FindingVariant;
  readonly iconName: FindingIconName;
  readonly items: readonly RenderedItem[];
}

/** Everything one `render` call describes: the content, never the nodes. */
interface Rendered {
  readonly summary: string;
  readonly empty: boolean;
  readonly tasks: readonly RenderedItem[];
  readonly errors: RenderedLevel;
  readonly warnings: RenderedLevel;
  readonly successes: RenderedLevel;
}

/** A painted row plus the nodes a refresh rewrites in place. */
interface PaintedItem {
  readonly item: HTMLLIElement;
  /** The anchor or `<code>` at the head of the item, or `null` when it has none. */
  readonly lead: HTMLElement | null;
  /** The message text node; `null` on a task row, whose text is the action. */
  readonly message: Text | null;
  /** The task's action label; `null` on a level item. */
  readonly action: HTMLElement | null;
}

/** A painted level: its count label and its rows. */
interface PaintedLevel {
  readonly level: FindingLevel;
  readonly label: HTMLElement;
  readonly items: readonly PaintedItem[];
}

/**
 * What is on screen, plus the shape signature that decides whether the next
 * `render` may update it in place. `null` until the container is first painted
 * (and again after `message`, which replaces the whole container).
 */
interface Painted {
  readonly signature: string;
  readonly summary: HTMLParagraphElement;
  readonly tasks: readonly PaintedItem[];
  readonly levels: readonly PaintedLevel[];
}

/**
 * The task row's action label ("Add patient"), section-level ("Add
 * medicament data") when the missing key is not a rendered field.
 */
function taskActionLabel(finding: Finding): string {
  const section = taskSectionDataLabel(finding);
  return section === null
    ? format(text('taskAddRequired'), { field: taskFieldLabel(finding) })
    : format(text('taskAddSectionData'), { section });
}

/**
 * The task row's link label ("Go to patient field"), section-level ("Go to
 * medicament data") in the same no-rendered-field case. The link target is
 * unchanged: the resolver still decides it.
 */
function taskLinkLabel(finding: Finding): string {
  const section = taskSectionDataLabel(finding);
  return section === null
    ? format(text('taskGoToField'), { field: taskFieldLabel(finding) })
    : format(text('taskGoToSectionData'), { section });
}

export function createFindingsView(
  parent: HTMLElement,
  headingText: string,
  options: FindingsViewOptions = {},
): FindingsView {
  const section = el('section', 'panel-section');
  const heading = el('h3');
  heading.textContent = headingText;

  const container = el('div', 'findings');
  container.setAttribute('aria-live', 'polite');

  section.append(heading, container);
  parent.append(section);

  const getAnchorTarget = options.getAnchorTarget;
  const guidedTasks = options.guidedTasks === true;
  /** Anchor → the control it focuses; avoids relying on ids at click time. */
  const anchorTargets = new WeakMap<HTMLAnchorElement, HTMLElement>();

  const createAnchorLink = (target: HTMLElement, label: string): HTMLAnchorElement => {
    const link = el('a', 'finding-link');
    link.href = `#${target.id}`;
    link.textContent = label;
    anchorTargets.set(link, target);
    return link;
  };

  /**
   * The control a path link may point at, or `null` when nothing does.
   *
   * Pure: it resolves the target but creates no node, so the shape of a render
   * can be decided (and compared) before anything is painted.
   */
  const anchorTargetFor = (finding: Finding): HTMLElement | null => {
    if (getAnchorTarget === undefined || finding.path === '') {
      return null;
    }
    const target = getAnchorTarget(finding);
    return target === null || target.id === '' ? null : target;
  };

  /** The same for a task's "Go to ..." link, which never needs a non-empty path. */
  const taskTargetFor = (finding: Finding): HTMLElement | null => {
    if (getAnchorTarget === undefined) {
      return null;
    }
    const target = getAnchorTarget(finding);
    return target === null || target.id === '' ? null : target;
  };

  /** Lead of a level item: the path as a link, as code, or nothing. */
  const levelLeadOf = (finding: Finding): Lead => {
    const target = anchorTargetFor(finding);
    if (target !== null) {
      return { kind: 'link', target, label: finding.path };
    }
    return finding.path === '' ? { kind: 'none' } : { kind: 'code', text: finding.path };
  };

  /** Lead of a task row: its "Go to ..." link, or nothing. */
  const taskLeadOf = (finding: Finding): Lead => {
    const target = taskTargetFor(finding);
    return target === null
      ? { kind: 'none' }
      : { kind: 'link', target, label: taskLinkLabel(finding) };
  };

  /** Creates the node a lead describes; `null` for an empty lead. */
  const createLead = (lead: Lead): HTMLElement | null => {
    if (lead.kind === 'link') {
      return createAnchorLink(lead.target, lead.label);
    }
    if (lead.kind === 'code') {
      const path = el('code', 'finding-path');
      path.textContent = lead.text;
      return path;
    }
    return null;
  };

  container.addEventListener('click', (event) => {
    const clicked = event.target;
    if (!(clicked instanceof Element)) {
      return;
    }
    const link = clicked.closest('a.finding-link');
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    const target = anchorTargets.get(link);
    if (target === undefined) {
      return;
    }
    // Keep focus deterministic: never let the hash navigation move the viewport
    // by itself, so the scroll below is the only motion.
    event.preventDefault();
    focusAnchorTarget(target);
  });

  /**
   * Replaces the whole container with one neutral message (idle, processing).
   *
   * A reset/initial-state path, not a findings update: it drops the painted
   * registry too, so the next `render` paints instead of trying to refresh
   * nodes that no longer exist.
   */
  const message = (value: string): void => {
    container.replaceChildren();
    painted = null;
    lastInput = null;
    const paragraph = el('p', 'findings-summary');
    paragraph.textContent = value;
    container.append(paragraph);
  };

  /** What the container currently holds; see {@link Painted}. */
  let painted: Painted | null = null;

  /**
   * The findings last handed to `render`, kept so `relabel` can rebuild the
   * labels without the caller re-supplying them. `null` while a message is
   * shown, because a message has no level labels to re-resolve.
   */
  let lastInput: {
    readonly errors: readonly Finding[];
    readonly warnings: readonly Finding[];
    readonly successes: readonly Finding[];
  } | null = null;

  /** One level of the model; ids follow the shared 1-based formula. */
  const renderedLevel = (
    findings: readonly Finding[],
    label: string,
    variant: FindingVariant,
    iconName: FindingIconName,
    level: FindingLevel,
  ): RenderedLevel => ({
    level,
    label,
    variant,
    iconName,
    items: findings.map((finding, index) => ({
      id: guidedTasks ? findingItemId(level, index) : null,
      finding,
      lead: levelLeadOf(finding),
    })),
  });

  /**
   * The whole content of one render, as data.
   *
   * Building it calls no DOM API, so the shape of a render can be compared with
   * the painted one before anything is written.
   */
  const buildRendered = (
    errors: readonly Finding[],
    warnings: readonly Finding[],
    successes: readonly Finding[],
  ): Rendered => {
    const counts = `${text('errorsLabel')}: ${errors.length} · ${text('warningsLabel')}: ${warnings.length}`;
    // Guided tasks exist only in the opted-in panel; flows 1 and 2 therefore
    // never see a task list, a disclosure or an item id.
    const tasks = guidedTasks ? errors.filter(isTaskFinding) : [];
    return {
      // Additive only: the two-level wording stays byte-identical when the panel
      // has no info level (flows 1 and 2).
      summary:
        successes.length === 0 ? counts : `${counts} · ${text('infoLabel')}: ${successes.length}`,
      empty: errors.length === 0 && warnings.length === 0 && successes.length === 0,
      tasks: tasks.map((finding, index) => ({
        id: taskRowId(index),
        finding,
        lead: taskLeadOf(finding),
      })),
      errors: renderedLevel(errors, text('errorsLabel'), 'is-error', 'circle-alert', 'error'),
      warnings: renderedLevel(
        warnings,
        text('warningsLabel'),
        'is-warning',
        'triangle-alert',
        'warning',
      ),
      successes: renderedLevel(successes, text('infoLabel'), 'is-success', 'info', 'info'),
    };
  };

  /** One letter per item: how it reaches its finding. */
  const leadKinds = (items: readonly RenderedItem[]): string =>
    items
      .map((item) => (item.lead.kind === 'link' ? 'L' : item.lead.kind === 'code' ? 'C' : '-'))
      .join('');

  /**
   * The structure a render would author — the one thing an in-place refresh
   * cannot change. Equal signatures mean the painted nodes are exactly the
   * nodes a rebuild would create, so the refresh may write into them.
   */
  const shapeOf = (rendered: Rendered): string =>
    [
      rendered.empty ? 'empty' : 'content',
      `tasks:${rendered.tasks.length}:${leadKinds(rendered.tasks)}`,
      ...[rendered.errors, rendered.warnings, rendered.successes].map(
        (level) => `${level.level}:${level.items.length}:${leadKinds(level.items)}`,
      ),
    ].join('|');

  /**
   * The guided task list: one row per missing-required error, in error order.
   *
   * The row id is what the implicated input points at with `aria-describedby`;
   * the ordinal matches `taskRowId(index)` in this very array, which is also
   * what the review table recomputes from the same finding list.
   */
  const paintTasks = (
    items: readonly RenderedItem[],
  ): { readonly wrapper: HTMLElement; readonly items: readonly PaintedItem[] } => {
    const wrapper = el('div', 'findings-tasks');

    const taskHeading = el('h4', 'findings-heading is-error');
    const taskLabel = el('span', 'findings-heading-label');
    taskLabel.textContent = `${text('taskHeading')} (${items.length})`;
    taskHeading.append(createIcon('circle-alert'), taskLabel);

    const list = el('ul', 'finding-tasks');
    const paintedItems = items.map((item) => {
      const row = el('li', 'finding-task');
      if (item.id !== null) {
        row.id = item.id;
      }

      const body = el('span', 'finding-task-text');
      const action = el('strong', 'finding-task-action');
      action.textContent = taskActionLabel(item.finding);
      body.append(action);

      const lead = createLead(item.lead);
      if (lead !== null) {
        body.append(document.createTextNode(' — '), lead);
      }

      row.append(createIcon('circle-alert'), body);
      list.append(row);
      return { item: row, lead, message: null, action };
    });

    wrapper.append(taskHeading, list);
    return { wrapper, items: paintedItems };
  };

  /** One level: its heading (the count lives in the label) and its rows. */
  const paintLevel = (target: HTMLElement, level: RenderedLevel): PaintedLevel | null => {
    if (level.items.length === 0) {
      return null;
    }

    const levelHeading = el('h4', `findings-heading ${level.variant}`);
    const label = el('span', 'findings-heading-label');
    label.textContent = `${level.label} (${level.items.length})`;
    levelHeading.append(createIcon(level.iconName), label);

    const list = el('ul', `findings-list ${level.variant}`);
    const items = level.items.map((item) => {
      const row = el('li', 'finding');
      if (item.id !== null) {
        row.id = item.id;
      }
      row.append(createIcon(level.iconName));

      const body = el('span', 'finding-text');
      const lead = createLead(item.lead);
      if (lead !== null) {
        body.append(lead, document.createTextNode(' '));
      }
      const messageNode = document.createTextNode(item.finding.message);
      body.append(messageNode);
      row.append(body);
      list.append(row);
      return { item: row, lead, message: messageNode, action: null };
    });

    target.append(levelHeading, list);
    return { level: level.level, label, items };
  };

  /**
   * Full rebuild — the only code in this module that authors nodes.
   *
   * Reached on the first render, whenever the shape changes, and after a
   * `message` (which nulls the registry, so the next render lands here).
   */
  const paint = (rendered: Rendered): void => {
    container.replaceChildren();
    painted = null;

    const summary = el('p', 'findings-summary');
    summary.textContent = rendered.summary;
    container.append(summary);

    if (rendered.empty) {
      const ok = el('p', 'findings-ok');
      ok.append(createIcon('circle-check'), document.createTextNode(text('noFindings')));
      container.append(ok);
      // Registered too: a repeated "nothing to report" render must not churn
      // the live region, and any later finding changes the signature anyway.
      painted = { signature: shapeOf(rendered), summary, tasks: [], levels: [] };
      refreshIcons();
      return;
    }

    const taskList = rendered.tasks.length > 0 ? paintTasks(rendered.tasks) : null;
    if (taskList !== null) {
      container.append(taskList.wrapper);
    }

    // Errors first, always: export-blocking findings must lead the reading order.
    // With tasks on screen the error prose moves under a native disclosure: it
    // stays reachable, but the actionable layer leads. Warnings and info are not
    // actions and keep rendering exactly as before.
    let errorParent: HTMLElement = container;
    if (taskList !== null) {
      const technical = el('details', 'findings-technical');
      const technicalSummary = el('summary', 'findings-technical-summary');
      technicalSummary.textContent = text('technicalDetailsLabel');
      technical.append(technicalSummary);
      container.append(technical);
      errorParent = technical;
    }

    const levels = [
      paintLevel(errorParent, rendered.errors),
      paintLevel(container, rendered.warnings),
      paintLevel(container, rendered.successes),
    ].filter((level): level is PaintedLevel => level !== null);

    painted = {
      signature: shapeOf(rendered),
      summary,
      tasks: taskList?.items ?? [],
      levels,
    };
    refreshIcons();
  };

  /**
   * Re-points an existing lead node.
   *
   * The node itself is never replaced — the click map is keyed by it — so only
   * its label, its href and its target mapping change. An edit can resolve a
   * different control (a re-rendered table), and the mapping follows it.
   */
  const syncLead = (current: PaintedItem, next: Lead): void => {
    const node = current.lead;
    if (node === null) {
      return;
    }
    if (next.kind === 'link' && node instanceof HTMLAnchorElement) {
      if (node.textContent !== next.label) {
        node.textContent = next.label;
      }
      node.href = `#${next.target.id}`;
      anchorTargets.set(node, next.target);
      return;
    }
    if (next.kind === 'code' && !(node instanceof HTMLAnchorElement)) {
      if (node.textContent !== next.text) {
        node.textContent = next.text;
      }
    }
  };

  /** Rewrites one painted row from the model, keeping its nodes (and focus). */
  const syncItem = (current: PaintedItem, next: RenderedItem): void => {
    if (next.id !== null && current.item.id !== next.id) {
      current.item.id = next.id;
    }
    syncLead(current, next.lead);
    if (current.action !== null) {
      const label = taskActionLabel(next.finding);
      if (current.action.textContent !== label) {
        current.action.textContent = label;
      }
    }
    if (current.message !== null && current.message.data !== next.finding.message) {
      current.message.data = next.finding.message;
    }
  };

  /**
   * Applies a model to the painted DOM, rebuilding only when the shape changed.
   *
   * The shape check is what makes the update safe: equal signatures mean a
   * rebuild would create the very nodes that are already mounted, so writing
   * their text/href/id yields the same tree without touching the nodes — and
   * therefore without moving the scroll position or dropping focus.
   */
  const sync = (rendered: Rendered): void => {
    const current = painted;
    if (current === null || current.signature !== shapeOf(rendered)) {
      paint(rendered);
      return;
    }

    if (current.summary.textContent !== rendered.summary) {
      current.summary.textContent = rendered.summary;
    }

    rendered.tasks.forEach((item, index) => {
      const currentItem = current.tasks[index];
      if (currentItem !== undefined) {
        syncItem(currentItem, item);
      }
    });

    const nextLevels: Readonly<Record<FindingLevel, RenderedLevel>> = {
      error: rendered.errors,
      warning: rendered.warnings,
      info: rendered.successes,
    };
    for (const currentLevel of current.levels) {
      const next = nextLevels[currentLevel.level];
      const label = `${next.label} (${next.items.length})`;
      if (currentLevel.label.textContent !== label) {
        currentLevel.label.textContent = label;
      }
      next.items.forEach((item, index) => {
        const currentItem = currentLevel.items[index];
        if (currentItem !== undefined) {
          syncItem(currentItem, item);
        }
      });
    }
  };

  const render = (
    errors: readonly Finding[],
    warnings: readonly Finding[],
    successes: readonly Finding[] = [],
  ): void => {
    lastInput = { errors, warnings, successes };
    sync(buildRendered(errors, warnings, successes));
  };

  const relabel = (headingText: string): void => {
    heading.textContent = headingText;
    if (lastInput === null) {
      return;
    }
    paint(buildRendered(lastInput.errors, lastInput.warnings, lastInput.successes));
  };

  return { render, message, relabel };
}

/** Static Lucide placeholder; `createIcons` swaps it for the inline SVG. */
function createIcon(name: FindingIconName): HTMLElement {
  const icon = el('i', 'finding-icon');
  icon.setAttribute('data-lucide', name);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/**
 * Re-runs Lucide for the rows just rendered. The markup above is static, so a
 * missing script only leaves empty placeholders, which the CSS hides: the text
 * label and the count still carry the level.
 */
function refreshIcons(): void {
  const lucide = (window as unknown as Record<string, unknown>).lucide as
    | { createIcons: () => void }
    | undefined;
  if (typeof lucide?.createIcons === 'function') {
    lucide.createIcons();
  }
}
