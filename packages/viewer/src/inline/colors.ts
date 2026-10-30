import type { HighlightColor, InlineColor } from '@lor-looma/core';

const THEME_COLORS = new Set<InlineColor>([
  'primary',
  'accent',
  'muted',
  'info',
  'success',
  'warning',
  'danger',
]);

export function inlineColorValue(name: InlineColor): string {
  const token = THEME_COLORS.has(name) ? 'color' : 'palette';
  return `var(--lm-${token}-${name})`;
}

export function highlightColorValue(name: HighlightColor): string {
  return `var(--lm-highlight-${name})`;
}
