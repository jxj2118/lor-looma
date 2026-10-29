import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/test/**', '**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});
