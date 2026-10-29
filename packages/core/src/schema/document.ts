import { z } from 'zod';
import { LoomaAssetSchema } from './asset';
import { LoomaCardSchema } from './card';
import { IdSchema } from './primitives';
import { LoomaThemeSchema } from './theme';

export const LoomaDocumentSchema = z.object({
  looma: z.literal(1),
  id: IdSchema,
  title: z.string().default(''),
  format: z.enum(['presentation', 'document']).default('presentation'),
  theme: LoomaThemeSchema.default({ preset: 'clean' }),
  assets: z.record(IdSchema, LoomaAssetSchema).default({}),
  cards: z.array(LoomaCardSchema).default([]),
});

export type LoomaDocument = z.output<typeof LoomaDocumentSchema>;
export type LoomaDocumentInput = z.input<typeof LoomaDocumentSchema>;
