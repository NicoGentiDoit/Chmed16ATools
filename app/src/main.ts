import './ui/styles.css';

import { createLanguageSelector } from './ui/components/language-selector';
import { getLocale, initLocale, onLocaleChange, setLocale } from './ui/i18n';
import { mountChmedToJson } from './ui/panel-chmed-to-json';
import { mountJsonToChmed } from './ui/panel-json-to-chmed';
import { mountPdfToChmed } from './ui/panel-pdf-to-chmed';
import { format, text } from './ui/strings';
import type { UiStringKey } from './ui/strings';
import { createTabs } from './ui/tabs';

const TAB_JSON_TO_CHMED = 'json-to-chmed';
const TAB_CHMED_TO_JSON = 'chmed-to-json';
const TAB_PDF_TO_CHMED = 'pdf-to-chmed';

/**
 * The language has to be known before the first `text()` call below: every label
 * of the shell resolves against it. A stored choice wins over browser detection,
 * so a reload restores the user's language before the first paint and the
 * selector starts on the language the page is actually rendered in.
 */
initLocale();

/** Static home card markup in `index.html`, addressed by its id prefix. */
interface HomeCard {
  readonly key: string;
  readonly tabId: string;
  readonly titleKey: UiStringKey;
  readonly descriptionKey: UiStringKey;
  readonly badgeKey: UiStringKey;
}

/** One tab: its id, the key of its chip label and the panel it shows. */
interface TabDefinition {
  readonly id: string;
  readonly labelKey: UiStringKey;
  readonly panel: HTMLElement;
}

/**
 * Runtime surface of a panel.
 *
 * `refresh` is opt-in and label-only: a panel whose own strings are `text()`
 * calls rebuilds those labels in place on a locale change, keeping typed input,
 * decoded output and a running camera scan. All three panels provide it. Result
 * snapshots (decoded JSON, findings, the PDF recap) keep the language they were
 * produced in and are re-translated only by the next run. Remounting a panel
 * instead would drop exactly the state the switch must keep.
 */
interface PanelHandle {
  dispose(): void;
  refresh?(): void;
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing element #${id}`);
  }
  return element;
}

function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

function refreshIcons(): void {
  // lucide is available globally after the deferred script loads.
  const fn = (window as unknown as Record<string, unknown>).lucide as
    | { createIcons: () => void }
    | undefined;
  if (typeof fn?.createIcons === 'function') {
    fn.createIcons();
  }
}

/**
 * Every user-visible static string of the shell, mapped element → key and
 * re-applied on each locale change: document title, brand name and subtitle,
 * skip link, home heading and description, build version badge and the
 * disclaimer. The home cards and the tab chips have their own passes below
 * (their labels also feed the tab spec and the card actions).
 */
function applyStaticLabels(): void {
  // Screen readers announce the document language, so it follows the UI.
  document.documentElement.lang = getLocale();
  document.title = text('appTitle');
  setText('app-title', text('appTitle'));
  setText('app-subtitle', text('workbenchSubtitle'));
  setText('skip-link', text('skipToContent'));
  setText('home-heading', text('homeHeading'));
  setText('app-description', text('appDescription'));
  setText(
    'app-version',
    format(text('versionBadge'), { version: String(import.meta.env.VITE_APP_VERSION) }),
  );
  setText('app-disclaimer', text('disclaimer'));
}

const tablist = byId('tablist');
const homeView = byId('view-home');
const jsonToChmedPanel = byId('panel-json-to-chmed');
const chmedToJsonPanel = byId('panel-chmed-to-json');
const pdfToChmedPanel = byId('panel-pdf-to-chmed');

const jsonToChmed = mountJsonToChmed(jsonToChmedPanel);
const chmedToJson = mountChmedToJson(chmedToJsonPanel);
const pdfToChmed = mountPdfToChmed(pdfToChmedPanel);

/** Mounted panels, in mount order; each may opt into `refresh()` (see above). */
const panelHandles: readonly PanelHandle[] = [jsonToChmed, chmedToJson, pdfToChmed];

refreshIcons();

// One list for the switcher and for the relabel pass, so the two cannot drift.
const tabDefinitions: readonly TabDefinition[] = [
  { id: TAB_JSON_TO_CHMED, labelKey: 'tabJsonToChmed', panel: jsonToChmedPanel },
  { id: TAB_CHMED_TO_JSON, labelKey: 'tabChmedToJson', panel: chmedToJsonPanel },
  { id: TAB_PDF_TO_CHMED, labelKey: 'tabPdfToChmed', panel: pdfToChmedPanel },
];

const tabs = createTabs({
  tablist,
  home: homeView,
  label: text('tablistLabel'),
  tabs: tabDefinitions.map(({ id, labelKey, panel }) => ({
    id,
    label: text(labelKey),
    panel,
  })),
  onSelect: (id) => {
    refreshIcons();
    // `id` is `null` on the home view, so every panel is disposed — the same
    // per-panel semantics a flow switch already used.
    if (id !== TAB_JSON_TO_CHMED) {
      jsonToChmed.dispose();
    }
    if (id !== TAB_CHMED_TO_JSON) {
      chmedToJson.dispose();
    }
    if (id !== TAB_PDF_TO_CHMED) {
      pdfToChmed.dispose();
    }
  },
});

/**
 * Re-labels the tab chips in place.
 *
 * `createTabs` builds each chip once (`#tab-<id>`, the id convention `tabs.ts`
 * documents) and has no relabel API, so this rewrites exactly the two texts the
 * switcher owns — the tab list's accessible name and the chip labels — and
 * touches no selection, `tabindex` or focus state.
 */
function applyTabLabels(): void {
  tablist.setAttribute('aria-label', text('tablistLabel'));
  for (const definition of tabDefinitions) {
    const button = document.getElementById(`tab-${definition.id}`);
    if (button !== null) {
      button.textContent = text(definition.labelKey);
    }
  }
}

const homeCards: readonly HomeCard[] = [
  {
    key: 'json',
    tabId: TAB_JSON_TO_CHMED,
    titleKey: 'tabJsonToChmed',
    descriptionKey: 'homeCardJsonDescription',
    badgeKey: 'homeCardJsonBadge',
  },
  {
    key: 'chmed',
    tabId: TAB_CHMED_TO_JSON,
    titleKey: 'tabChmedToJson',
    descriptionKey: 'homeCardChmedDescription',
    badgeKey: 'homeCardChmedBadge',
  },
  {
    key: 'pdf',
    tabId: TAB_PDF_TO_CHMED,
    titleKey: 'tabPdfToChmed',
    descriptionKey: 'homeCardPdfDescription',
    badgeKey: 'homeCardPdfBadge',
  },
];

/**
 * Home view labels, re-applied on every locale change. A card title is also the
 * `{flow}` of its action label, so the two always agree.
 */
function applyHomeCards(): void {
  for (const card of homeCards) {
    const title = text(card.titleKey);
    setText(`home-card-${card.key}-title`, title);
    setText(`home-card-${card.key}-description`, text(card.descriptionKey));
    setText(`home-card-${card.key}-badge`, text(card.badgeKey));
    setText(`home-card-${card.key}-action`, format(text('openFlowLabel'), { flow: title }));
  }
}

// Click handlers are wired once: a locale change rewrites the labels, not the
// buttons.
for (const card of homeCards) {
  byId(`home-card-${card.key}-action`).addEventListener('click', () => {
    // The card disappears with the home view, so focus follows the flow.
    tabs.select(card.tabId, true);
  });
}

const languageSelector = createLanguageSelector(byId('app-header-meta'), {
  locale: getLocale(),
  label: text('uiLanguageLabel'),
  onChange: (locale) => {
    // Persists the explicit choice and notifies `applyLocale` below, which owns
    // the whole repaint. No reload, no second render path to keep in sync.
    setLocale(locale);
  },
});

/**
 * The single re-apply path of a locale change: every static label, the home
 * cards, the tab chips, the selector's own accessible name, and each panel's own
 * labels through its optional `refresh()`.
 */
function applyLocale(): void {
  applyStaticLabels();
  applyHomeCards();
  applyTabLabels();
  languageSelector.sync(getLocale(), text('uiLanguageLabel'));
  for (const panel of panelHandles) {
    panel.refresh?.();
  }
}

// Subscribed for the lifetime of the page: the shell outlives every panel.
onLocaleChange(applyLocale);

// First paint with the restored/detected locale, before the initial selection.
applyLocale();

// Start on the home view. `createTabs` still performs today's initial
// `selectIndex(0)` (and its onSelect dispose pass for the two idle panels);
// clearing it again before the first paint lands on home with no visible
// change in panel state.
tabs.clearSelection();

byId('home-button').addEventListener('click', () => {
  tabs.clearSelection();
  refreshIcons();
});

window.addEventListener('pagehide', () => {
  jsonToChmed.dispose();
  chmedToJson.dispose();
  pdfToChmed.dispose();
});
