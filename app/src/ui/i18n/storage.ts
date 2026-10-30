/**
 * Locale persistence.
 *
 * `localStorage` can be denied or unavailable (private mode, sandboxed iframe,
 * storage disabled, server-side rendering): every access is guarded, so a
 * failure degrades to "no persistence" instead of crashing the locale switch.
 *
 * {@link browserStorage} is the only function that touches the browser API; the
 * readers/writers accept an injectable {@link StorageFacade} so the fallback
 * behaviour is unit-tested without stubbing globals.
 */

/** Storage key holding the chosen locale. */
export const LOCALE_STORAGE_KEY = 'chmed-locale';

/** Minimal storage surface the persistence helpers need. */
export interface StorageFacade {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Returns `localStorage` when it is usable, `null` when it is missing or its
 * access throws (some browsers throw on the property read itself).
 */
export function browserStorage(): StorageFacade | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Reads the persisted locale tag, or `null` when absent/unavailable. */
export function readStoredLocale(
  storage: StorageFacade | null = browserStorage(),
): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persists the locale tag. Never throws: the switch must work even when the
 * storage is denied, it just will not survive a reload.
 */
export function writeStoredLocale(
  value: string,
  storage: StorageFacade | null = browserStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // Persistence is a convenience; a denied storage must not break the switch.
  }
}
