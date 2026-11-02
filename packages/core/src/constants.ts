export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'image',
  'table',
  'callout',
  'quote',
  'divider',
  'code',
  'stat',
  'math',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const CONTAINER_TYPES = ['stack', 'columns', 'grid', 'steps'] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export const THEME_PRESETS = ['clean', 'dark', 'warm', 'serif'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const FONT_STACKS = ['system', 'sans', 'serif', 'rounded', 'mono'] as const;
export type FontStack = (typeof FONT_STACKS)[number];

/** Color names usable in `{color:name}` inline marks. Theme colors first, then palette colors. */
export const INLINE_COLORS = [
  'primary',
  'accent',
  'muted',
  'info',
  'success',
  'warning',
  'danger',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;
export type InlineColor = (typeof INLINE_COLORS)[number];

export const HIGHLIGHT_COLORS = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange',
  'red',
  'gray',
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const CALLOUT_TONES = ['info', 'success', 'warning', 'danger', 'note'] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** A card body counts as depth 0; containers may appear at depth 0 and 1 only. */
export const MAX_CONTAINER_DEPTH = 2;
export const MAX_LIST_DEPTH = 3;
export const MAX_COLUMNS = 4;
export const MIN_COLUMNS = 2;

export const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;
