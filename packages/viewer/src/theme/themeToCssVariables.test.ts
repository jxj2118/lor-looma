import { THEME_PRESETS } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { THEME_PRESET_TOKENS, themeToCssVariables } from './themeToCssVariables';

type ThemePreset = (typeof THEME_PRESETS)[number];

const FONT_STACKS = {
  sans: '"Inter", "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  serif:
    '"Iowan Old Style", "Palatino Linotype", Georgia, "Noto Serif", "Songti SC", "SimSun", serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "Noto Sans Mono", monospace',
} as const;

const EXPECTED_TOKENS = {
  clean: {
    colorBg: '#f6f7f9',
    cardBackground: '#ffffff',
    colorFg: '#1f2328',
    colorMuted: '#656d76',
    colorPrimary: '#2563eb',
    colorAccent: '#7c3aed',
    colorInfo: '#0284c7',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorDanger: '#dc2626',
    colorNote: '#6b7280',
    fontHeading: 'sans',
    fontBody: 'sans',
    fontMono: 'mono',
    fontScale: 1,
    radius: 12,
    spacing: 1,
  },
  dark: {
    colorBg: '#0b0f17',
    cardBackground: '#131a26',
    colorFg: '#e6edf3',
    colorMuted: '#8b949e',
    colorPrimary: '#60a5fa',
    colorAccent: '#c084fc',
    colorInfo: '#38bdf8',
    colorSuccess: '#4ade80',
    colorWarning: '#fbbf24',
    colorDanger: '#f87171',
    colorNote: '#9ca3af',
    fontHeading: 'sans',
    fontBody: 'sans',
    fontMono: 'mono',
    fontScale: 1,
    radius: 12,
    spacing: 1,
  },
  warm: {
    colorBg: '#f6ede1',
    cardBackground: '#fffaf3',
    colorFg: '#3b2f2a',
    colorMuted: '#8a776b',
    colorPrimary: '#d9692f',
    colorAccent: '#b8476a',
    colorInfo: '#3a7ca5',
    colorSuccess: '#4d8b55',
    colorWarning: '#c98a1b',
    colorDanger: '#c2483d',
    colorNote: '#8a776b',
    fontHeading: 'rounded',
    fontBody: 'rounded',
    fontMono: 'mono',
    fontScale: 1,
    radius: 20,
    spacing: 1,
  },
  serif: {
    colorBg: '#efece4',
    cardBackground: '#fffefb',
    colorFg: '#1c1b19',
    colorMuted: '#6f6a61',
    colorPrimary: '#8b2e2e',
    colorAccent: '#2f5d62',
    colorInfo: '#2f5d62',
    colorSuccess: '#4f6f3a',
    colorWarning: '#a86b1d',
    colorDanger: '#8b2e2e',
    colorNote: '#6f6a61',
    fontHeading: 'serif',
    fontBody: 'serif',
    fontMono: 'mono',
    fontScale: 1,
    radius: 4,
    spacing: 1.15,
  },
} as const satisfies Record<ThemePreset, (typeof THEME_PRESET_TOKENS)[ThemePreset]>;

const CSS_KEYS = [
  '--lm-color-bg',
  '--lm-card-background',
  '--lm-color-fg',
  '--lm-color-muted',
  '--lm-color-primary',
  '--lm-color-accent',
  '--lm-color-info',
  '--lm-color-success',
  '--lm-color-warning',
  '--lm-color-danger',
  '--lm-color-note',
  '--lm-font-heading',
  '--lm-font-body',
  '--lm-font-mono',
  '--lm-font-scale',
  '--lm-radius',
  '--lm-spacing',
] as const;

describe('THEME_PRESET_TOKENS', () => {
  it('covers every preset', () => {
    expect(Object.keys(THEME_PRESET_TOKENS).sort()).toEqual([...THEME_PRESETS].sort());
  });

  it.each(THEME_PRESETS)('%s defines all 17 tokens', (preset) => {
    expect(THEME_PRESET_TOKENS[preset]).toEqual(EXPECTED_TOKENS[preset]);
    expect(Object.keys(THEME_PRESET_TOKENS[preset])).toHaveLength(17);
  });
});

describe('themeToCssVariables', () => {
  it.each(THEME_PRESETS)('%s exposes 17 CSS variables', (preset) => {
    const vars = themeToCssVariables({ preset });
    expect(Object.keys(vars).sort()).toEqual([...CSS_KEYS].sort());
  });

  it('maps colors, fonts, radius, and spacing', () => {
    const clean = themeToCssVariables({ preset: 'clean' });
    expect(clean['--lm-color-primary']).toBe('#2563eb');
    expect(clean['--lm-card-background']).toBe('#ffffff');
    expect(clean['--lm-font-heading']).toBe(FONT_STACKS.sans);
    expect(clean['--lm-font-body']).toBe(FONT_STACKS.sans);
    expect(clean['--lm-font-mono']).toBe(FONT_STACKS.mono);
    expect(clean['--lm-font-scale']).toBe('1');
    expect(clean['--lm-radius']).toBe('12px');
    expect(clean['--lm-spacing']).toBe('1');

    const warm = themeToCssVariables({ preset: 'warm' });
    expect(warm['--lm-font-heading']).toBe(FONT_STACKS.rounded);
    expect(warm['--lm-radius']).toBe('20px');

    const serif = themeToCssVariables({ preset: 'serif' });
    expect(serif['--lm-font-body']).toBe(FONT_STACKS.serif);
    expect(serif['--lm-spacing']).toBe('1.15');
    expect(serif['--lm-radius']).toBe('4px');
  });

  it('lets overrides replace preset values and keeps the rest', () => {
    const vars = themeToCssVariables({
      preset: 'clean',
      overrides: { colorPrimary: '#112233', radius: 0, fontBody: 'mono' },
    });
    expect(vars['--lm-color-primary']).toBe('#112233');
    expect(vars['--lm-radius']).toBe('0px');
    expect(vars['--lm-font-body']).toBe(FONT_STACKS.mono);
    expect(vars['--lm-color-bg']).toBe('#f6f7f9');
    expect(vars['--lm-font-heading']).toBe(FONT_STACKS.sans);
  });
});
