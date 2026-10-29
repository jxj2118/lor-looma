import { z } from 'zod';
import { FONT_STACKS, THEME_PRESETS } from '../constants';
import { ColorSchema } from './primitives';

export const ThemeOverridesSchema = z
  .strictObject({
    colorBg: ColorSchema,
    colorFg: ColorSchema,
    colorMuted: ColorSchema,
    colorPrimary: ColorSchema,
    colorAccent: ColorSchema,
    colorInfo: ColorSchema,
    colorSuccess: ColorSchema,
    colorWarning: ColorSchema,
    colorDanger: ColorSchema,
    colorNote: ColorSchema,
    cardBackground: ColorSchema,
    fontHeading: z.enum(FONT_STACKS),
    fontBody: z.enum(FONT_STACKS),
    fontMono: z.enum(FONT_STACKS),
    fontScale: z.number().min(0.8).max(1.4),
    radius: z.number().int().min(0).max(32),
    spacing: z.number().min(0.75).max(1.5),
  })
  .partial();

export const LoomaThemeSchema = z.object({
  preset: z.enum(THEME_PRESETS).default('clean'),
  overrides: ThemeOverridesSchema.optional(),
});

export type ThemeOverrides = z.output<typeof ThemeOverridesSchema>;
export type LoomaTheme = z.output<typeof LoomaThemeSchema>;
