import type { CardBackground, LoomaTheme } from '@lor-looma/core';
import { THEME_PRESET_TOKENS } from './presets';

export type SurfaceTone = 'light' | 'dark';

const LIGHT_THRESHOLD = 0.4;

const PALETTE_KEYS = [
  ['colorFg', '--lm-color-fg'],
  ['colorMuted', '--lm-color-muted'],
  ['colorPrimary', '--lm-color-primary'],
  ['colorAccent', '--lm-color-accent'],
  ['colorInfo', '--lm-color-info'],
  ['colorSuccess', '--lm-color-success'],
  ['colorWarning', '--lm-color-warning'],
  ['colorDanger', '--lm-color-danger'],
  ['colorNote', '--lm-color-note'],
] as const;

function parseRgb(color: string): [number, number, number] | undefined {
  const value = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return undefined;
}

/** WCAG relative luminance in [0, 1], or undefined for colors we do not parse (e.g. hsl()). */
export function relativeLuminance(color: string): number | undefined {
  const rgb = parseRgb(color);
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map((channel) => {
    const c = Math.min(255, channel) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toneOf(luminance: number | undefined): SurfaceTone | undefined {
  if (luminance === undefined) return undefined;
  return luminance >= LIGHT_THRESHOLD ? 'light' : 'dark';
}

function backgroundTone(background: CardBackground | undefined): SurfaceTone | undefined {
  if (!background) return undefined;
  if (background.kind === 'color') return toneOf(relativeLuminance(background.value));
  if (background.kind === 'gradient') {
    const from = relativeLuminance(background.from);
    const to = relativeLuminance(background.to);
    if (from === undefined || to === undefined) return undefined;
    return toneOf((from + to) / 2);
  }
  return undefined;
}

/**
 * Color variables that keep text readable when a card's own background has the opposite
 * lightness of the theme's card surface. Empty when no adaptation is needed.
 */
export function surfaceVariables(
  theme: LoomaTheme,
  background: CardBackground | undefined,
): { tone: SurfaceTone | undefined; vars: Record<string, string> } {
  const tone = backgroundTone(background);
  if (!tone) return { tone: undefined, vars: {} };
  const themeSurface =
    theme.overrides?.cardBackground ?? THEME_PRESET_TOKENS[theme.preset].cardBackground;
  if (toneOf(relativeLuminance(themeSurface)) === tone) return { tone, vars: {} };
  const palette = THEME_PRESET_TOKENS[tone === 'light' ? 'clean' : 'dark'];
  const vars: Record<string, string> = {};
  for (const [key, name] of PALETTE_KEYS) vars[name] = palette[key];
  return { tone, vars };
}
