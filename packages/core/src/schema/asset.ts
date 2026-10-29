import { z } from 'zod';
import { IMAGE_SRC_MESSAGE, isImageSrc } from './primitives';

export const ImageAssetSchema = z.object({
  kind: z.literal('image'),
  src: z.string().refine(isImageSrc, IMAGE_SRC_MESSAGE),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().default(''),
});

export const LoomaAssetSchema = z.discriminatedUnion('kind', [ImageAssetSchema]);

export type ImageAsset = z.output<typeof ImageAssetSchema>;
export type LoomaAsset = z.output<typeof LoomaAssetSchema>;
