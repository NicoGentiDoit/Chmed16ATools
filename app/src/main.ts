import './ui/styles.css';

import { mountChmedToJson } from './ui/panel-chmed-to-json';
import { mountJsonToChmed } from './ui/panel-json-to-chmed';
import { mountPdfToChmed } from './ui/panel-pdf-to-chmed';
import { format, text } from './ui/strings';
import { createTabs } from './ui/tabs';

const TAB_JSON_TO_CHMED = 'json-to-chmed';
const TAB_CHMED_TO_JSON = 'chmed-to-json';
const TAB_PDF_TO_CHMED = 'pdf-to-chmed';

/** Static home card markup in `index.html`, addressed by its id prefix. */
interface HomeCard {
  readonly key: string;
  readonly tabId: string;
  readonly title: string;
  readonly description: string;
  readonly badge: string;
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

document.title = text('appTitle');
setText('app-title', text('appTitle'));
setText('app-subtitle', text('workbenchSubtitle'));
setText('skip-link', text('skipToContent'));
setText('home-heading', text('homeHeading'));
setText('app-description', text('appDescription'));
setText('app-version', format(text('versionBadge'), {
  version: String(import.meta.env.VITE_APP_VERSION),
}));
setText('app-disclaimer', text('disclaimer'));

const tablist = byId('tablist');
const homeView = byId('view-home');
const jsonToChmedPanel = byId('panel-json-to-chmed');
const chmedToJsonPanel = byId('panel-chmed-to-json');
const pdfToChmedPanel = byId('panel-pdf-to-chmed');

const jsonToChmed = mountJsonToChmed(jsonToChmedPanel);
const chmedToJson = mountChmedToJson(chmedToJsonPanel);
const pdfToChmed = mountPdfToChmed(pdfToChmedPanel);

refreshIcons();

const tabs = createTabs({
  tablist,
  home: homeView,
  label: text('tablistLabel'),
  tabs: [
    { id: TAB_JSON_TO_CHMED, label: text('tabJsonToChmed'), panel: jsonToChmedPanel },
    { id: TAB_CHMED_TO_JSON, label: text('tabChmedToJson'), panel: chmedToJsonPanel },
    { id: TAB_PDF_TO_CHMED, label: text('tabPdfToChmed'), panel: pdfToChmedPanel },
  ],
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

const homeCards: readonly HomeCard[] = [
  {
    key: 'json',
    tabId: TAB_JSON_TO_CHMED,
    title: text('tabJsonToChmed'),
    description: text('homeCardJsonDescription'),
    badge: text('homeCardJsonBadge'),
  },
  {
    key: 'chmed',
    tabId: TAB_CHMED_TO_JSON,
    title: text('tabChmedToJson'),
    description: text('homeCardChmedDescription'),
    badge: text('homeCardChmedBadge'),
  },
  {
    key: 'pdf',
    tabId: TAB_PDF_TO_CHMED,
    title: text('tabPdfToChmed'),
    description: text('homeCardPdfDescription'),
    badge: text('homeCardPdfBadge'),
  },
];

for (const card of homeCards) {
  setText(`home-card-${card.key}-title`, card.title);
  setText(`home-card-${card.key}-description`, card.description);
  setText(`home-card-${card.key}-badge`, card.badge);

  const action = byId(`home-card-${card.key}-action`);
  action.textContent = format(text('openFlowLabel'), { flow: card.title });
  action.addEventListener('click', () => {
    // The card disappears with the home view, so focus follows the flow.
    tabs.select(card.tabId, true);
  });
}

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
