import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  resolve: { conditions: ['source'] },
  css: { modules: { generateScopedName: 'lm-[local]-[hash:base64:5]' } },
  test: {
    name: 'editor',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: { include: [/.+/], modules: { classNameStrategy: 'non-scoped' } },
  },
});
