/**
 * Locale persistence fallback.
 *
 * `localStorage` can be denied (private mode, sandboxed iframe) or throw on
 * access. A denied storage must degrade to "no persistence" — never a crash —
 * so every helper is exercised with a throwing facade, injected rather than
 * stubbed on the global object.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  browserStorage,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  writeStoredLocale,
  type StorageFacade,
} from '../storage';

function memoryStorage(initial: Record<string, string> = {}): StorageFacade & {
  values: Record<string, string>;
} {
  const values = { ...initial };
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

describe('locale storage', () => {
  it('uses one documented key', () => {
    expect(LOCALE_STORAGE_KEY).toBe('chmed-locale');
  });

  it('round-trips a value through an injected storage', () => {
    const storage = memoryStorage();
    writeStoredLocale('de-CH', storage);
    expect(readStoredLocale(storage)).toBe('de-CH');
    expect(storage.values[LOCALE_STORAGE_KEY]).toBe('de-CH');
  });

  it('returns null when nothing was stored', () => {
    expect(readStoredLocale(memoryStorage())).toBeNull();
  });

  it('returns null and never throws when reading fails', () => {
    const storage: StorageFacade = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => undefined,
    };
    expect(() => readStoredLocale(storage)).not.toThrow();
    expect(readStoredLocale(storage)).toBeNull();
  });

  it('swallows write failures', () => {
    const setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    const storage: StorageFacade = { getItem: () => null, setItem };

    expect(() => writeStoredLocale('fr', storage)).not.toThrow();
    expect(setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'fr');
  });

  it('is a no-op when no storage is available', () => {
    expect(readStoredLocale(null)).toBeNull();
    expect(() => writeStoredLocale('it', null)).not.toThrow();
  });

  it('reports no browser storage outside a browser', () => {
    // Node has no `localStorage` (Vitest runs in the node environment), which is
    // exactly the "storage unavailable" branch: persistence simply stays off.
    expect(browserStorage()).toBeNull();
  });
});
