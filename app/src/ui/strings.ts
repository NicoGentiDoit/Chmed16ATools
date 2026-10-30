/**
 * Compatibility re-export for every user-visible string of the tools UI.
 *
 * The catalogue now lives in `ui/i18n/messages/en.ts` (the single source of truth
 * for keys) and is resolved per locale by `ui/i18n/index.ts`. Panels keep
 * importing `text()`, `format()`, `STRINGS` and `UiStringKey` from here unchanged
 * — this module holds no literals and no logic of its own.
 *
 * See `ui/i18n/index.ts` for the resolution chain (locale → en → key name).
 */

export { STRINGS, format, text } from './i18n';
export type { UiStringKey } from './i18n';
