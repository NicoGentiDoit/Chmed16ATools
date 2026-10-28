import './ui/styles.css';

import { mountChmedToJson } from './ui/panel-chmed-to-json';
import { mountJsonToChmed } from './ui/panel-json-to-chmed';
import { mountPdfToChmed } from './ui/panel-pdf-to-chmed';
import { text } from './ui/strings';
import { createTabs } from './ui/tabs';

const TAB_JSON_TO_CHMED = 'json-to-chmed';
const TAB_CHMED_TO_JSON = 'chmed-to-json';
const TAB_PDF_TO_CHMED = 'pdf-to-chmed';

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
setText('app-description', text('appDescription'));
setText('app-tagline', text('disclaimer'));
setText('app-disclaimer', text('disclaimer'));

const tablist = byId('tablist');
const jsonToChmedPanel = byId('panel-json-to-chmed');
const chmedToJsonPanel = byId('panel-chmed-to-json');
const pdfToChmedPanel = byId('panel-pdf-to-chmed');

const jsonToChmed = mountJsonToChmed(jsonToChmedPanel);
const chmedToJson = mountChmedToJson(chmedToJsonPanel);
const pdfToChmed = mountPdfToChmed(pdfToChmedPanel);

refreshIcons();

createTabs({
  tablist,
  label: text('tablistLabel'),
  tabs: [
    { id: TAB_JSON_TO_CHMED, label: text('tabJsonToChmed'), panel: jsonToChmedPanel },
    { id: TAB_CHMED_TO_JSON, label: text('tabChmedToJson'), panel: chmedToJsonPanel },
    { id: TAB_PDF_TO_CHMED, label: text('tabPdfToChmed'), panel: pdfToChmedPanel },
  ],
  onSelect: (id) => {
    refreshIcons();
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

window.addEventListener('pagehide', () => {
  jsonToChmed.dispose();
  chmedToJson.dispose();
  pdfToChmed.dispose();
});
