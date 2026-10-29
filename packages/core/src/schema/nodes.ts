import { z } from 'zod';
import type { LoomaBlock } from './blocks';
import {
  CalloutBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  HeadingBlockSchema,
  ImageBlockSchema,
  ListBlockSchema,
  ParagraphBlockSchema,
  QuoteBlockSchema,
  TableBlockSchema,
  UnknownBlockSchema,
} from './blocks';
import type { LoomaContainer } from './containers';
import { ColumnsSchema, GridSchema, StackSchema } from './containers';

export type LoomaNode = LoomaBlock | LoomaContainer;

/**
 * Wrapped in `z.lazy` so container getters can close over this binding
 * without reading it while the two modules are still initializing.
 * The explicit annotation cuts a circular inference cycle in zod 4.
 */
export const LoomaNodeSchema: z.ZodType<LoomaNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    HeadingBlockSchema,
    ParagraphBlockSchema,
    ListBlockSchema,
    ImageBlockSchema,
    TableBlockSchema,
    CalloutBlockSchema,
    QuoteBlockSchema,
    DividerBlockSchema,
    CodeBlockSchema,
    UnknownBlockSchema,
    StackSchema,
    ColumnsSchema,
    GridSchema,
  ]),
);
