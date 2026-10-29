import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const deps = [
  ...Object.keys((pkg as { dependencies?: Record<string, string> }).dependencies ?? {}),
  ...Object.keys((pkg as { peerDependencies?: Record<string, string> }).peerDependencies ?? {}),
];

export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    sourcemap: true,
    rolldownOptions: {
      external: (id) => deps.some((d) => id === d || id.startsWith(`${d}/`)),
    },
  },
});
