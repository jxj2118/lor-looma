import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { conditions: ['source'] },
  test: { name: 'core', environment: 'node', include: ['src/**/*.test.ts'] },
});
