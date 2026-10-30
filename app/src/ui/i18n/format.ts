/**
 * Placeholder interpolation for localized templates.
 *
 * Single implementation, moved out of `ui/strings.ts` in phase 1 and re-exported
 * from both `ui/strings.ts` and `ui/i18n/index.ts` — no locale-aware formatting
 * (numbers, dates) is added here, by design: `{name}` placeholders only.
 */

/** Replaces `{name}` placeholders in a template with the given values. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder: string, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}
