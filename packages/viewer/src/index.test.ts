import { describe, expect, it } from 'vitest';
import * as api from './index';
import type {
  InlineTextProps,
  LoomaCardViewProps,
  LoomaRootProps,
  LoomaViewerHandle,
  LoomaViewerProps,
  RenderNode,
  RenderNodeInfo,
  ThemeTokens,
  ViewerMode,
} from './index';

const RUNTIME = [
  'LoomaViewer',
  'LoomaCardView',
  'LoomaRoot',
  'themeToCssVariables',
  'THEME_PRESET_TOKENS',
  'InlineText',
  'useLoomaDocument',
  'LOGICAL_SIZE',
] as const;

const PRIVATE = [
  'NodeView',
  'ScaledFrame',
  'Heading',
  'Paragraph',
  'List',
  'Image',
  'Table',
  'Callout',
  'Quote',
  'Divider',
  'Code',
  'Unsupported',
  'Stack',
  'Columns',
  'Grid',
  'ScrollView',
  'PresentView',
] as const;

describe('public API', () => {
  it.each(RUNTIME)('exports %s', (name) => {
    expect(api[name]).toBeDefined();
  });

  it('publishes the logical slide and page sizes', () => {
    expect(api.LOGICAL_SIZE).toEqual({
      presentation: { width: 1280, height: 720 },
      document: { width: 816 },
    });
  });

  it.each(PRIVATE)('does not export %s', (name) => {
    expect(api).not.toHaveProperty(name);
  });

  it('keeps the public types available to TypeScript', () => {
    const types = null as unknown as [
      LoomaViewerProps,
      LoomaViewerHandle,
      ViewerMode,
      LoomaCardViewProps,
      RenderNode,
      RenderNodeInfo,
      LoomaRootProps,
      ThemeTokens,
      InlineTextProps,
    ];
    expect(types).toBeNull();
  });
});
