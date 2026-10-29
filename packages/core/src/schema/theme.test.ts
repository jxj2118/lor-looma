import { describe, expect, it } from 'vitest';
import { LoomaThemeSchema, ThemeOverridesSchema } from './theme';

describe('ThemeOverridesSchema', () => {
  it.each(['#abc', '#AABBCC', 'rgb(0, 128, 255)', 'hsl(210, 50%, 40%)'])(
    'accepts color %s',
    (color) => {
      expect(ThemeOverridesSchema.safeParse({ colorPrimary: color }).success).toBe(true);
    },
  );

  it.each(['red', '#abcd', 'rgb(256,0,0)', 'url(x)', 'var(--x)'])('rejects color %s', (color) => {
    expect(ThemeOverridesSchema.safeParse({ colorPrimary: color }).success).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(ThemeOverridesSchema.safeParse({ colorEvil: '#fff' }).success).toBe(false);
  });

  it('rejects fontScale and radius outside their ranges', () => {
    expect(ThemeOverridesSchema.safeParse({ fontScale: 2 }).success).toBe(false);
    expect(ThemeOverridesSchema.safeParse({ radius: 4.5 }).success).toBe(false);
    expect(
      ThemeOverridesSchema.safeParse({ fontScale: 1.4, radius: 0, spacing: 0.75 }).success,
    ).toBe(true);
  });

  it('accepts hsl and rgb boundaries and case differences', () => {
    expect(ThemeOverridesSchema.safeParse({ colorAccent: 'RGB(0, 0, 0)' }).success).toBe(true);
    expect(ThemeOverridesSchema.safeParse({ colorAccent: 'HSL(360, 100%, 100%)' }).success).toBe(
      true,
    );
    expect(ThemeOverridesSchema.safeParse({ colorAccent: 'hsl(361, 0%, 0%)' }).success).toBe(false);
    expect(ThemeOverridesSchema.safeParse({ colorAccent: 'hsl(0, 101%, 0%)' }).success).toBe(false);
    expect(ThemeOverridesSchema.safeParse({ colorAccent: 'hsl(0, 0%, 101%)' }).success).toBe(false);
    expect(ThemeOverridesSchema.safeParse({ cardBackground: '#AbC' }).success).toBe(true);
  });
});

describe('LoomaThemeSchema', () => {
  it('defaults the preset to clean', () => {
    expect(LoomaThemeSchema.parse({})).toEqual({ preset: 'clean' });
  });
});
