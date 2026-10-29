import { describe, expect, it } from 'vitest';
import * as api from './index';

const surface = api as Record<string, unknown>;

const RUNTIME_EXPORTS = [
  'LOOMA_SCHEMA_VERSION',
  'parseDocument',
  'parseInline',
  'serializeInline',
  'normalizeInline',
  'inlineToPlainText',
  'isSafeHref',
  'createId',
  'isValidId',
  'ID_PATTERN',
  'ID_PREFIX',
  'LoomaDocumentSchema',
  'LoomaCardSchema',
  'LoomaNodeSchema',
  'LoomaAssetSchema',
  'LoomaThemeSchema',
  'ThemeOverridesSchema',
  'validateDocumentSemantics',
  'formatIssue',
  'BLOCK_TYPES',
  'CONTAINER_TYPES',
  'THEME_PRESETS',
  'INLINE_COLORS',
  'HIGHLIGHT_COLORS',
  'FONT_STACKS',
  'MAX_CONTAINER_DEPTH',
  'MAX_LIST_DEPTH',
] as const;

describe('public API', () => {
  it.each(RUNTIME_EXPORTS)('exports %s', (name) => {
    expect(surface[name]).toBeDefined();
  });

  it('does not export internal helpers', () => {
    expect(surface).not.toHaveProperty('runMigrations');
    expect(surface).not.toHaveProperty('zodIssuesToParseIssues');
    expect(surface).not.toHaveProperty('formatPath');
  });
});
