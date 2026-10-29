import { z } from 'zod';
import { CALLOUT_TONES } from '../constants';
import { IdSchema, InlineTextSchema } from './primitives';

export const ListItemSchema = z.union([
  z.string(),
  z.object({
    text: InlineTextSchema.default(''),
    checked: z.boolean().optional(),
    get children() {
      return z.array(ListItemSchema).optional();
    },
  }),
]);

export const HeadingBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: InlineTextSchema.default(''),
});

export const ParagraphBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('paragraph'),
  text: InlineTextSchema.default(''),
  align: z.enum(['left', 'center', 'right']).optional(),
});

export const ListBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('list'),
  style: z.enum(['bullet', 'number', 'check']).default('bullet'),
  items: z.array(ListItemSchema).default([]),
});

export const ImageBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('image'),
  assetId: IdSchema,
  fit: z.enum(['cover', 'contain']).optional(),
  caption: InlineTextSchema.optional(),
  width: z.enum(['auto', 'full']).optional(),
});

export const TableBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('table'),
  header: z.boolean().default(false),
  rows: z
    .array(z.array(InlineTextSchema))
    .min(1)
    .default([['']]),
});

export const CalloutBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('callout'),
  tone: z.enum(CALLOUT_TONES).default('info'),
  text: InlineTextSchema.default(''),
});

export const QuoteBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('quote'),
  text: InlineTextSchema.default(''),
  cite: InlineTextSchema.optional(),
});

export const DividerBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('divider'),
});

export const CodeBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('code'),
  language: z.string().max(32).optional(),
  code: z.string().default(''),
});

export const UnknownBlockSchema = z.object({
  id: IdSchema,
  type: z.literal('unknown'),
  raw: z.record(z.string(), z.unknown()),
});

export type ListItem = z.output<typeof ListItemSchema>;
export type HeadingBlock = z.output<typeof HeadingBlockSchema>;
export type ParagraphBlock = z.output<typeof ParagraphBlockSchema>;
export type ListBlock = z.output<typeof ListBlockSchema>;
export type ImageBlock = z.output<typeof ImageBlockSchema>;
export type TableBlock = z.output<typeof TableBlockSchema>;
export type CalloutBlock = z.output<typeof CalloutBlockSchema>;
export type QuoteBlock = z.output<typeof QuoteBlockSchema>;
export type DividerBlock = z.output<typeof DividerBlockSchema>;
export type CodeBlock = z.output<typeof CodeBlockSchema>;
export type UnknownBlock = z.output<typeof UnknownBlockSchema>;

export type LoomaBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | ImageBlock
  | TableBlock
  | CalloutBlock
  | QuoteBlock
  | DividerBlock
  | CodeBlock
  | UnknownBlock;
