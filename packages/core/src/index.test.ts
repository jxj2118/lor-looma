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
  'CALLOUT_TONES',
  'CONTAINER_TYPES',
  'THEME_PRESETS',
  'INLINE_COLORS',
  'HIGHLIGHT_COLORS',
  'FONT_STACKS',
  'MAX_CONTAINER_DEPTH',
  'MAX_LIST_DEPTH',
  'LoomaCommandSchema',
  'COMMAND_OPS',
  'NodeLocationSchema',
  'CardLocationSchema',
  'applyCommands',
  'createLoomaStore',
  'findNode',
  'findCard',
  'walkNodes',
  'getOutline',
  'getCards',
  'importPptx',
  'importDocx',
  'createZip',
  'unzipPptx',
] as const;

describe('public API', () => {
  it.each(RUNTIME_EXPORTS)('exports %s', (name) => {
    expect(surface[name]).toBeDefined();
  });

  it('does not export the AI entry', () => {
    expect(surface).not.toHaveProperty('getToolDefinitions');
    expect(surface).not.toHaveProperty('createToolHandler');
    expect(surface).not.toHaveProperty('getCommandJsonSchema');
    expect(surface).not.toHaveProperty('getDocumentJsonSchema');
    expect(surface).not.toHaveProperty('LOOMA_AI_GUIDE');
    expect(surface).not.toHaveProperty('LOOMA_TOOL_NAMES');
  });

  it('does not export internal helpers', () => {
    expect(surface).not.toHaveProperty('runMigrations');
    expect(surface).not.toHaveProperty('zodIssuesToParseIssues');
    expect(surface).not.toHaveProperty('formatPath');
    expect(surface).not.toHaveProperty('materializeNode');
    expect(surface).not.toHaveProperty('materializeCard');
    expect(surface).not.toHaveProperty('materializeAsset');
    expect(surface).not.toHaveProperty('resolveNodeLocation');
    expect(surface).not.toHaveProperty('resolveCardLocation');
    expect(surface).not.toHaveProperty('collectIds');
    expect(surface).not.toHaveProperty('childArrayOf');
    expect(surface).not.toHaveProperty('nodePreview');
    expect(surface).not.toHaveProperty('cardToMarkdown');
    expect(surface).not.toHaveProperty('CommandContext');
  });
});
