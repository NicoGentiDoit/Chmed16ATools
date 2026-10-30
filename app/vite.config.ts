// @ts-expect-error -- Node builtins are available to the Vite config at build time; @types/node is not a project dependency.
import { readFileSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

/**
 * Version shown in the header. Reading `package.json` here keeps it the single
 * source of truth; Vite replaces `import.meta.env.VITE_APP_VERSION` with the
 * literal at build time (and in dev).
 */
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  base: '/Chmed16ATools/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  test: {
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
  },
});
