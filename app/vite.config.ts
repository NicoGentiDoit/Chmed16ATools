import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/Chmed16ATools/',
  test: {
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
  },
});
