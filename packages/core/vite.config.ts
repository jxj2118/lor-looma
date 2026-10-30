import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const deps = [
  ...Object.keys((pkg as { dependencies?: Record<string, string> }).dependencies ?? {}),
  ...Object.keys((pkg as { peerDependencies?: Record<string, string> }).peerDependencies ?? {}),
];

export default defineConfig({
  build: {
    lib: {
      entry: { index: 'src/index.ts', ai: 'src/ai/index.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    sourcemap: true,
    rolldownOptions: {
      external: (id) => deps.some((d) => id === d || id.startsWith(`${d}/`)),
    },
  },
});
