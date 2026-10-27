/**
 * Accessible tab switcher.
 *
 * The markup shells (header, tablist, panels) live in `index.html`; this module
 * only adds the buttons, keeps `aria-selected`/`tabindex`/`hidden` in sync and
 * implements the keyboard model of the WAI-ARIA tabs pattern: Left/Right arrows
 * move and activate, Home/End jump to the first/last tab, and only the selected
 * tab is in the tab order (roving tabindex).
 */

export interface TabSpec {
  /** Stable identifier, also used for the generated element ids. */
  readonly id: string;
  /** Visible tab label. */
  readonly label: string;
  /** The panel element to show/hide. */
  readonly panel: HTMLElement;
}

export interface TabsOptions {
  readonly tablist: HTMLElement;
  readonly tabs: readonly TabSpec[];
  /** Accessible name for the tab list. */
  readonly label: string;
  /** Called after the selection changes (including the initial selection). */
  readonly onSelect?: (id: string) => void;
}

export interface TabsHandle {
  /** Selects a tab by its `id`. Unknown ids are ignored. */
  select(id: string): void;
}

interface TabEntry {
  readonly spec: TabSpec;
  readonly button: HTMLButtonElement;
}

function panelIdOf(spec: TabSpec): string {
  if (spec.panel.id === '') {
    spec.panel.id = `panel-${spec.id}`;
  }
  return spec.panel.id;
}

export function createTabs(options: TabsOptions): TabsHandle {
  const { tablist, tabs, label, onSelect } = options;

  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', label);

  const entries: TabEntry[] = tabs.map((spec, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `tab-${spec.id}`;
    button.className = 'tab';
    button.textContent = spec.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelIdOf(spec));
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;

    spec.panel.setAttribute('role', 'tabpanel');
    spec.panel.setAttribute('aria-labelledby', button.id);
    spec.panel.tabIndex = 0;

    button.addEventListener('click', () => {
      selectIndex(index);
    });

    button.addEventListener('keydown', (event: KeyboardEvent) => {
      const count = entries.length;
      let next: number;
      switch (event.key) {
        case 'ArrowRight':
          next = (index + 1) % count;
          break;
        case 'ArrowLeft':
          next = (index - 1 + count) % count;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      selectIndex(next, true);
    });

    tablist.append(button);
    return { spec, button };
  });

  function selectIndex(next: number, focus = false): void {
    const target = entries[next];
    if (target === undefined) {
      return;
    }
    entries.forEach((entry, index) => {
      const active = index === next;
      entry.button.setAttribute('aria-selected', active ? 'true' : 'false');
      entry.button.tabIndex = active ? 0 : -1;
      entry.button.classList.toggle('is-active', active);
      entry.spec.panel.hidden = !active;
    });
    if (focus) {
      target.button.focus();
    }
    onSelect?.(target.spec.id);
  }

  function select(id: string): void {
    const index = entries.findIndex((entry) => entry.spec.id === id);
    if (index !== -1) {
      selectIndex(index);
    }
  }

  selectIndex(0);

  return { select };
}
