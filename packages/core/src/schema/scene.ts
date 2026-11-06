import { z } from 'zod';
import { isSafeHref } from '../inline';
import { ColorSchema, IdSchema } from './primitives';

export const SceneBoxSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
  width: z.number().finite().positive().max(100_000),
  height: z.number().finite().positive().max(100_000),
  rotation: z.number().finite().min(-360).max(360).optional(),
});

export const SceneFillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('color'),
    color: ColorSchema,
    opacity: z.number().finite().min(0).max(1).optional(),
  }),
  z.object({
    kind: z.literal('gradient'),
    from: ColorSchema,
    to: ColorSchema,
    angle: z.number().finite().min(0).max(360).optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
  }),
]);

export const SceneStrokeSchema = z.object({
  color: ColorSchema,
  width: z.number().finite().min(0).max(500),
  opacity: z.number().finite().min(0).max(1).optional(),
  dash: z.enum(['solid', 'dash', 'dot']).optional(),
});

export const SceneCropRectSchema = z
  .object({
    left: z.number().finite().min(0).max(0.999999),
    top: z.number().finite().min(0).max(0.999999),
    right: z.number().finite().min(0).max(0.999999),
    bottom: z.number().finite().min(0).max(0.999999),
  })
  .superRefine((crop, ctx) => {
    if (crop.left + crop.right >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['right'],
        message: 'crop left + right must be < 1',
      });
    }
    if (crop.top + crop.bottom >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['bottom'],
        message: 'crop top + bottom must be < 1',
      });
    }
  });

export const SceneTextRunSchema = z.object({
  text: z.string(),
  fontFamily: z.string().min(1).max(200).optional(),
  fontSize: z.number().finite().positive().max(1000).optional(),
  color: ColorSchema.optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  baseline: z.enum(['super', 'sub']).optional(),
  letterSpacing: z.number().finite().min(-200).max(500).optional(),
  href: z
    .string()
    .refine((value) => isSafeHref(value), {
      message: 'must be a safe http:, https:, or mailto: URL',
    })
    .optional(),
});

export const SceneBulletSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('char'),
    char: z.string().min(1).max(16),
    fontFamily: z.string().min(1).max(200).optional(),
    color: ColorSchema.optional(),
    sizePct: z.number().finite().min(10).max(400).optional(),
  }),
  z.object({
    kind: z.literal('number'),
    format: z.string().min(1).max(64).optional(),
    startAt: z.number().int().min(1).max(10_000).optional(),
  }),
]);

export const SceneLineSpacingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('multiple'),
    value: z.number().finite().positive().max(20),
  }),
  z.object({
    kind: z.literal('exact'),
    px: z.number().finite().positive().max(2000),
  }),
]);

export const SceneParagraphSchema = z.object({
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  lineSpacing: SceneLineSpacingSchema.optional(),
  spaceBefore: z.number().finite().min(0).max(2000).optional(),
  spaceAfter: z.number().finite().min(0).max(2000).optional(),
  marginLeft: z.number().finite().min(0).max(10_000).optional(),
  indent: z.number().finite().min(-10_000).max(10_000).optional(),
  bullet: SceneBulletSchema.optional(),
  runs: z.array(SceneTextRunSchema),
});

export const SceneTextPaddingSchema = z.object({
  top: z.number().finite().min(0).max(2000),
  right: z.number().finite().min(0).max(2000),
  bottom: z.number().finite().min(0).max(2000),
  left: z.number().finite().min(0).max(2000),
});

export const SceneShapeGeometrySchema = z.object({
  preset: z.enum(['rect', 'roundRect', 'ellipse', 'line']),
  cornerRadiusRatio: z.number().finite().min(0).max(0.5).optional(),
  flipH: z.boolean().optional(),
  flipV: z.boolean().optional(),
});

export const SceneShapeElementSchema = z.object({
  id: IdSchema,
  type: z.literal('shape'),
  box: SceneBoxSchema,
  zIndex: z.number().int().min(0).max(100_000),
  geometry: SceneShapeGeometrySchema,
  fill: SceneFillSchema.optional(),
  stroke: SceneStrokeSchema.optional(),
});

export const SceneImageElementSchema = z.object({
  id: IdSchema,
  type: z.literal('image'),
  box: SceneBoxSchema,
  zIndex: z.number().int().min(0).max(100_000),
  assetId: IdSchema,
  crop: SceneCropRectSchema.optional(),
  geometry: SceneShapeGeometrySchema.optional(),
  stroke: SceneStrokeSchema.optional(),
  alt: z.string().max(1000).optional(),
});

export const SceneTextElementSchema = z.object({
  id: IdSchema,
  type: z.literal('text'),
  box: SceneBoxSchema,
  zIndex: z.number().int().min(0).max(100_000),
  paragraphs: z.array(SceneParagraphSchema).min(1),
  padding: SceneTextPaddingSchema.optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  wordWrap: z.boolean().optional(),
  geometry: SceneShapeGeometrySchema.optional(),
  fill: SceneFillSchema.optional(),
  stroke: SceneStrokeSchema.optional(),
});

export const LoomaSceneElementSchema = z.discriminatedUnion('type', [
  SceneShapeElementSchema,
  SceneImageElementSchema,
  SceneTextElementSchema,
]);

export const LoomaSceneSchema = z.object({
  width: z.number().finite().min(64).max(100_000),
  height: z.number().finite().min(64).max(100_000),
  elements: z.array(LoomaSceneElementSchema),
});

export type SceneBox = z.output<typeof SceneBoxSchema>;
export type SceneFill = z.output<typeof SceneFillSchema>;
export type SceneStroke = z.output<typeof SceneStrokeSchema>;
export type SceneCropRect = z.output<typeof SceneCropRectSchema>;
export type SceneTextRun = z.output<typeof SceneTextRunSchema>;
export type SceneBullet = z.output<typeof SceneBulletSchema>;
export type SceneLineSpacing = z.output<typeof SceneLineSpacingSchema>;
export type SceneParagraph = z.output<typeof SceneParagraphSchema>;
export type SceneTextPadding = z.output<typeof SceneTextPaddingSchema>;
export type SceneShapeGeometry = z.output<typeof SceneShapeGeometrySchema>;
export type SceneShapeElement = z.output<typeof SceneShapeElementSchema>;
export type SceneImageElement = z.output<typeof SceneImageElementSchema>;
export type SceneTextElement = z.output<typeof SceneTextElementSchema>;
export type LoomaSceneElement = z.output<typeof LoomaSceneElementSchema>;
export type LoomaScene = z.output<typeof LoomaSceneSchema>;
