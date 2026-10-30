import type { LoomaTheme } from '@lor-looma/core';
import { FONT_FAMILY } from './fonts';
import { THEME_PRESET_TOKENS } from './presets';
import type { ThemeTokens } from './presets';

export type { ThemeTokens } from './presets';
export { THEME_PRESET_TOKENS } from './presets';

const TOKEN_KEYS = [
  'colorBg',
  'cardBackground',
  'colorFg',
  'colorMuted',
  'colorPrimary',
  'colorAccent',
  'colorInfo',
  'colorSuccess',
  'colorWarning',
  'colorDanger',
  'colorNote',
  'fontHeading',
  'fontBody',
  'fontMono',
  'fontScale',
  'radius',
  'spacing',
] as const satisfies readonly (keyof ThemeTokens)[];

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function mergedTokens(theme: LoomaTheme): ThemeTokens {
  const base = THEME_PRESET_TOKENS[theme.preset];
  const overrides = theme.overrides;
  if (!overrides) return base;
  return {
    colorBg: overrides.colorBg ?? base.colorBg,
    cardBackground: overrides.cardBackground ?? base.cardBackground,
    colorFg: overrides.colorFg ?? base.colorFg,
    colorMuted: overrides.colorMuted ?? base.colorMuted,
    colorPrimary: overrides.colorPrimary ?? base.colorPrimary,
    colorAccent: overrides.colorAccent ?? base.colorAccent,
    colorInfo: overrides.colorInfo ?? base.colorInfo,
    colorSuccess: overrides.colorSuccess ?? base.colorSuccess,
    colorWarning: overrides.colorWarning ?? base.colorWarning,
    colorDanger: overrides.colorDanger ?? base.colorDanger,
    colorNote: overrides.colorNote ?? base.colorNote,
    fontHeading: overrides.fontHeading ?? base.fontHeading,
    fontBody: overrides.fontBody ?? base.fontBody,
    fontMono: overrides.fontMono ?? base.fontMono,
    fontScale: overrides.fontScale ?? base.fontScale,
    radius: overrides.radius ?? base.radius,
    spacing: overrides.spacing ?? base.spacing,
  };
}

function tokenValue(key: keyof ThemeTokens, tokens: ThemeTokens): string {
  if (key === 'fontHeading' || key === 'fontBody' || key === 'fontMono') {
    return FONT_FAMILY[tokens[key]];
  }
  if (key === 'radius') return `${tokens.radius}px`;
  if (key === 'fontScale') return String(tokens.fontScale);
  if (key === 'spacing') return String(tokens.spacing);
  return tokens[key];
}

/** Preset tokens merged with overrides, as CSS custom properties (e.g. `--lm-color-primary`). */
export function themeToCssVariables(theme: LoomaTheme): Record<`--lm-${string}`, string> {
  const tokens = mergedTokens(theme);
  const vars: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    vars[`--lm-${kebab(key)}`] = tokenValue(key, tokens);
  }
  return vars as Record<`--lm-${string}`, string>;
}
