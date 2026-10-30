import { describe, expect, it } from 'vitest';
import { THEME_PRESET_TOKENS } from './presets';
import { relativeLuminance, surfaceVariables } from './surface';

describe('relativeLuminance', () => {
  it('parses hex and rgb colors', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('rgb(255, 255, 255)')).toBeCloseTo(1);
    expect(relativeLuminance('hsl(0 0% 100%)')).toBeUndefined();
  });
});

describe('surfaceVariables', () => {
  it('switches a light card on a dark theme to the light palette', () => {
    const { tone, vars } = surfaceVariables(
      { preset: 'dark' },
      { kind: 'gradient', from: '#e7f5ea', to: '#fff6d8', angle: 135 },
    );
    expect(tone).toBe('light');
    expect(vars['--lm-color-fg']).toBe(THEME_PRESET_TOKENS.clean.colorFg);
    expect(vars['--lm-color-muted']).toBe(THEME_PRESET_TOKENS.clean.colorMuted);
  });

  it('switches a dark card on a light theme to the dark palette', () => {
    const { vars } = surfaceVariables({ preset: 'clean' }, { kind: 'color', value: '#101418' });
    expect(vars['--lm-color-fg']).toBe(THEME_PRESET_TOKENS.dark.colorFg);
  });

  it('leaves matching surfaces and unparsed backgrounds alone', () => {
    expect(surfaceVariables({ preset: 'clean' }, { kind: 'color', value: '#f3f7f4' }).vars).toEqual(
      {},
    );
    expect(surfaceVariables({ preset: 'dark' }, { kind: 'image', assetId: 'img_a' })).toEqual({
      tone: undefined,
      vars: {},
    });
    expect(surfaceVariables({ preset: 'dark' }, undefined).vars).toEqual({});
  });

  it('respects a cardBackground override on the theme', () => {
    const { vars } = surfaceVariables(
      { preset: 'clean', overrides: { cardBackground: '#0b0f17' } },
      { kind: 'color', value: '#ffffff' },
    );
    expect(vars['--lm-color-fg']).toBe(THEME_PRESET_TOKENS.clean.colorFg);
  });
});
