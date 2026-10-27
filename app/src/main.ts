import './ui/styles.css';

import { mountChmedToJson } from './ui/panel-chmed-to-json';
import { mountJsonToChmed } from './ui/panel-json-to-chmed';
import { text } from './ui/strings';
import { createTabs } from './ui/tabs';

const TAB_JSON_TO_CHMED = 'json-to-chmed';
const TAB_CHMED_TO_JSON = 'chmed-to-json';

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

document.title = text('appTitle');
setText('app-title', text('appTitle'));
setText('app-description', text('appDescription'));
setText('app-tagline', text('disclaimer'));
setText('app-disclaimer', text('disclaimer'));

const tablist = byId('tablist');
const jsonToChmedPanel = byId('panel-json-to-chmed');
const chmedToJsonPanel = byId('panel-chmed-to-json');

const jsonToChmed = mountJsonToChmed(jsonToChmedPanel);
const chmedToJson = mountChmedToJson(chmedToJsonPanel);

createTabs({
  tablist,
  label: text('tablistLabel'),
  tabs: [
    { id: TAB_JSON_TO_CHMED, label: text('tabJsonToChmed'), panel: jsonToChmedPanel },
    { id: TAB_CHMED_TO_JSON, label: text('tabChmedToJson'), panel: chmedToJsonPanel },
  ],
  onSelect: (id) => {
    if (id === TAB_JSON_TO_CHMED) {
      chmedToJson.dispose();
    } else {
      jsonToChmed.dispose();
    }
  },
});

window.addEventListener('pagehide', () => {
  jsonToChmed.dispose();
  chmedToJson.dispose();
});
