import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', 'docs/superpowers/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/viewer/**/*.{ts,tsx}', 'packages/editor/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/playground/**/*.{ts,tsx}'],
    ignores: ['apps/playground/playwright.config.ts', 'apps/playground/e2e/**'],
    plugins: { 'react-refresh': reactRefresh },
    rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
  },
  {
    files: ['*.{js,ts}', '**/vite.config.ts', '**/vitest.config.ts', '**/playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/playground/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
