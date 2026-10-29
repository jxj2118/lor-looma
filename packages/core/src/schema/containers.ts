import { z } from 'zod';
import type { LoomaNode } from './nodes';
import { LoomaNodeSchema } from './nodes';
import { GapSchema, IdSchema } from './primitives';

export const StackSchema = z.object({
  id: IdSchema,
  type: z.literal('stack'),
  gap: GapSchema.optional(),
  get children() {
    return z.array(LoomaNodeSchema).default([]);
  },
});

export const ColumnsSchema = z.object({
  id: IdSchema,
  type: z.literal('columns'),
  widths: z.array(z.number().positive()).min(2).max(4),
  get children() {
    return z.array(z.array(LoomaNodeSchema)).min(2).max(4);
  },
  gap: GapSchema.optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
});

export const GridSchema = z.object({
  id: IdSchema,
  type: z.literal('grid'),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  gap: GapSchema.optional(),
  get children() {
    return z.array(LoomaNodeSchema).default([]);
  },
});

type Gap = 'none' | 'sm' | 'md' | 'lg';

export type StackContainer = {
  id: string;
  type: 'stack';
  gap?: Gap | undefined;
  children: LoomaNode[];
};

export type ColumnsContainer = {
  id: string;
  type: 'columns';
  widths: number[];
  children: LoomaNode[][];
  gap?: Gap | undefined;
  align?: 'start' | 'center' | 'end' | 'stretch' | undefined;
};

export type GridContainer = {
  id: string;
  type: 'grid';
  columns: 2 | 3 | 4;
  gap?: Gap | undefined;
  children: LoomaNode[];
};

export type LoomaContainer = StackContainer | ColumnsContainer | GridContainer;
