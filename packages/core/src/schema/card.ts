import { z } from 'zod';
import { LoomaNodeSchema } from './nodes';
import { ColorSchema, FocalPointSchema, IdSchema } from './primitives';
import { LoomaSceneSchema } from './scene';

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

export const LoomaCardSchema = z
  .object({
    id: IdSchema,
    layout: z.enum(['flow', 'scene']).optional(),
    accent: CardAccentSchema.optional(),
    background: CardBackgroundSchema.optional(),
    notes: z.string().optional(),
    scene: LoomaSceneSchema.optional(),
    body: z.array(LoomaNodeSchema).default([]),
  })
  .superRefine((card, ctx) => {
    const isSceneLayout = card.layout === 'scene';
    const hasScene = card.scene !== undefined;
    if (isSceneLayout && !hasScene) {
      ctx.addIssue({
        code: 'custom',
        path: ['scene'],
        message: 'scene is required when card layout is "scene"',
      });
    }
    if (card.layout === 'flow' && hasScene) {
      ctx.addIssue({
        code: 'custom',
        path: ['scene'],
        message: 'scene cannot be present when card layout is "flow"',
      });
    }
    if (hasScene && card.body.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'body must be empty on a scene card',
      });
    }
  });

export type CardAccent = z.output<typeof CardAccentSchema>;
export type CardBackground = z.output<typeof CardBackgroundSchema>;
export type LoomaCard = z.output<typeof LoomaCardSchema>;
