import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const deps = [
  ...Object.keys((pkg as { dependencies?: Record<string, string> }).dependencies ?? {}),
  ...Object.keys((pkg as { peerDependencies?: Record<string, string> }).peerDependencies ?? {}),
];

export default defineConfig({
  plugins: [react()],
  css: { modules: { generateScopedName: 'lm-[local]-[hash:base64:5]' } },
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'style' },
    sourcemap: true,
    rolldownOptions: {
      external: (id) =>
        id === 'react/jsx-runtime' || deps.some((d) => id === d || id.startsWith(`${d}/`)),
    },
  },
});
