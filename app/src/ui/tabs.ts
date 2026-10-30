/**
 * Accessible tab switcher.
 *
 * The markup shells (header, tablist, panels) live in `index.html`; this module
 * only adds the buttons, keeps `aria-selected`/`tabindex`/`hidden` in sync and
 * implements the keyboard model of the WAI-ARIA tabs pattern: Left/Right arrows
 * move and activate, Home/End jump to the first/last tab, and only the selected
 * tab is in the tab order (roving tabindex).
 *
 * The chips row is also hidden while the home view is displayed: the home cards
 * are the navigation there, and the tab list reappears as soon as a flow is
 * selected (see {@link TabsHandle.clearSelection}).
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
  /**
   * Landing view shown while no tab is selected. It is hidden as soon as a tab
   * becomes active and shown again by {@link TabsHandle.clearSelection}.
   */
  readonly home?: HTMLElement;
  /**
   * Called after the selection changes (including the initial selection).
   * A cleared selection reports `null`.
   */
  readonly onSelect?: (id: string | null) => void;
}

export interface TabsHandle {
  /**
   * Selects a tab by its `id`. Unknown ids are ignored. Pass `focus` to move
   * keyboard focus to the newly selected tab (used when the trigger is about to
   * be hidden, e.g. a home card).
   */
  select(id: string, focus?: boolean): void;
  /**
   * Deselects every tab, hides every panel and shows the home view. The chips
   * row is hidden with it (home is the navigation there) and focus inside the
   * row moves to the first home card action. The first tab stays in the tab
   * order so the tab list is still reachable when it comes back.
   */
  clearSelection(): void;
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
  const { tablist, tabs, label, home, onSelect } = options;

  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', label);

  // The whole chips row, hidden while the home view is the only navigation
  // (the three cards are then the flow switcher). Derived from the tablist
  // itself so no caller has to pass a second reference: `index.html` wraps it
  // in `.app-tabs`; a bare tablist without that wrapper degrades to hiding
  // just the tablist element.
  const row = tablist.closest('.app-tabs');
  const tablistRow: HTMLElement = row instanceof HTMLElement ? row : tablist;

  /**
   * Moves focus out of the chips row that is about to be hidden.
   *
   * `home` is the only navigation left there, so focus lands on its first card
   * action. Focus is deliberately left alone when: it is not inside the
   * tablist (the user's place is elsewhere), the home view is absent, or the
   * home cards are not in the DOM yet — never park it on an arbitrary element,
   * and never throw during the hide.
   */
  function moveFocusOutOfTablist(): void {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !tablist.contains(focused)) {
      return;
    }
    const next = home?.querySelector('.home-card-action');
    if (next instanceof HTMLElement) {
      next.focus();
    }
  }

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
      if (active) {
        entry.button.setAttribute('aria-current', 'true');
      } else {
        entry.button.removeAttribute('aria-current');
      }
      entry.button.tabIndex = active ? 0 : -1;
      entry.button.classList.toggle('is-active', active);
      entry.spec.panel.hidden = !active;
    });
    if (home !== undefined) {
      home.hidden = true;
    }
    // A flow is active again: the chips row is the persistent in-workspace
    // navigation. Unhide before the optional focus moves into it below.
    tablistRow.hidden = false;
    if (focus) {
      target.button.focus();
    }
    onSelect?.(target.spec.id);
  }

  function clearSelection(): void {
    entries.forEach((entry) => {
      entry.button.setAttribute('aria-selected', 'false');
      entry.button.removeAttribute('aria-current');
      entry.button.classList.remove('is-active');
      entry.button.tabIndex = -1;
      entry.spec.panel.hidden = true;
    });
    // Keep exactly one tab in the tab order: with nothing selected the roving
    // tabindex would otherwise drop the whole tab list out of the tab order.
    const first = entries[0];
    if (first !== undefined) {
      first.button.tabIndex = 0;
    }
    if (home !== undefined) {
      // Home is the only navigation while it is visible, so the chips row goes
      // away with it. Focus is redirected *before* the row becomes
      // `display: none`, otherwise the browser would drop focus to <body> and a
      // keyboard user who activated the brand would lose their place. Both
      // steps happen even when there is no `onSelect` (the callback stays last:
      // it owns the panel disposal pass).
      home.hidden = false;
      moveFocusOutOfTablist();
      tablistRow.hidden = true;
    }
    onSelect?.(null);
  }

  function select(id: string, focus = false): void {
    const index = entries.findIndex((entry) => entry.spec.id === id);
    if (index !== -1) {
      selectIndex(index, focus);
    }
  }

  // `main.ts` calls `clearSelection()` immediately after wiring the home cards,
  // still in the same synchronous module run: both transitions happen before
  // the first paint, so the chips row is never visibly shown on the landing
  // home view.
  selectIndex(0);

  return { select, clearSelection };
}
