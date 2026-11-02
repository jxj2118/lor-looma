import { z } from 'zod';
import { LoomaNodeSchema } from './nodes';
import { ColorSchema, FocalPointSchema, IdSchema } from './primitives';

export const CardAccentSchema = z.object({
  position: z.enum(['left', 'right', 'top', 'background']),
  assetId: IdSchema,
  focalPoint: FocalPointSchema.optional(),
});

export const CardBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('color'), value: ColorSchema }),
  z.object({
    kind: z.literal('gradient'),
    from: ColorSchema,
    to: ColorSchema,
    angle: z.number().min(0).max(360).default(135),
  }),
  z.object({ kind: z.literal('image'), assetId: IdSchema }),
]);

export const LoomaCardSchema = z.object({
  id: IdSchema,
  accent: CardAccentSchema.optional(),
  background: CardBackgroundSchema.optional(),
  notes: z.string().optional(),
  body: z.array(LoomaNodeSchema).default([]),
});

export type CardAccent = z.output<typeof CardAccentSchema>;
export type CardBackground = z.output<typeof CardBackgroundSchema>;
export type LoomaCard = z.output<typeof LoomaCardSchema>;
