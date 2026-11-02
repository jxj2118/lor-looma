import { z } from 'zod';
import { THEME_PRESETS } from '../constants';
import { CardAccentSchema, CardBackgroundSchema, IdSchema } from '../schema';

const nodeShape = z.looseObject({
  type: z.string(),
  id: IdSchema.optional(),
});

const cardShape = z.looseObject({
  id: IdSchema.optional(),
  accent: z.unknown().optional(),
  background: z.unknown().optional(),
  notes: z.string().optional(),
  body: z.array(nodeShape).optional(),
});

const NODE_LOCATION_EXPECTED =
  '{ before: id }, { after: id } or { parent: id, slot?: number, index?: number }';
const CARD_LOCATION_EXPECTED = '{ before: id }, { after: id } or { index: number }';

function locationMessage(expected: string, input: unknown): string {
  if (input === undefined) return `is required (expected ${expected})`;
  return `must be exactly one of ${expected}; received ${JSON.stringify(input)}`;
}

export const NodeLocationSchema = z.union(
  [
    z.strictObject({ before: IdSchema }),
    z.strictObject({ after: IdSchema }),
    z.strictObject({
      parent: IdSchema,
      slot: z.number().int().min(0).optional(),
      index: z.number().int().min(0).optional(),
    }),
  ],
  { error: (issue) => locationMessage(NODE_LOCATION_EXPECTED, issue.input) },
);

export const CardLocationSchema = z.union(
  [
    z.strictObject({ before: IdSchema }),
    z.strictObject({ after: IdSchema }),
    z.strictObject({ index: z.number().int().min(0) }),
  ],
  { error: (issue) => locationMessage(CARD_LOCATION_EXPECTED, issue.input) },
);

export type NodeLocation = z.infer<typeof NodeLocationSchema>;
export type CardLocation = z.infer<typeof CardLocationSchema>;

/** A node as written in a command: ids are optional at every level. */
export type NodeInput = { type: string; id?: string; [key: string]: unknown };
/** A card as written in a command: the id and every node id are optional. */
export type CardInput = {
  id?: string;
  accent?: unknown;
  background?: unknown;
  notes?: string;
  body?: NodeInput[];
};

const cardPatchSchema = z
  .strictObject({
    accent: CardAccentSchema.nullable().optional(),
    background: CardBackgroundSchema.nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'patch must include at least one of accent, background, or notes',
  });

const nodePatchSchema = z
  .record(z.string(), z.unknown())
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'patch must include at least one field',
  });

const containerShape = z.looseObject({
  type: z.enum(['stack', 'columns', 'grid']),
  id: IdSchema.optional(),
});

export const LoomaCommandSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('setTitle'),
    title: z.string(),
  }),
  z.strictObject({
    op: z.literal('setFormat'),
    format: z.enum(['presentation', 'document']),
  }),
  z
    .strictObject({
      op: z.literal('setTheme'),
      preset: z.enum(THEME_PRESETS).optional(),
      overrides: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((command) => command.preset !== undefined || command.overrides !== undefined, {
      path: ['preset'],
      message: 'setTheme needs a preset, overrides, or both',
    }),
  z.strictObject({
    op: z.literal('putAsset'),
    id: IdSchema.optional(),
    asset: z.looseObject({}),
  }),
  z.strictObject({
    op: z.literal('removeAsset'),
    id: IdSchema,
  }),
  z.strictObject({
    op: z.literal('insertCard'),
    card: cardShape.optional(),
    at: CardLocationSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('updateCard'),
    id: IdSchema,
    patch: cardPatchSchema,
  }),
  z.strictObject({
    op: z.literal('moveCard'),
    id: IdSchema,
    to: CardLocationSchema,
  }),
  z.strictObject({
    op: z.literal('duplicateCard'),
    id: IdSchema,
    newId: IdSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('splitCard'),
    id: IdSchema,
    atNodeId: IdSchema,
    newId: IdSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('deleteCard'),
    id: IdSchema,
  }),
  z.strictObject({
    op: z.literal('insertNode'),
    node: nodeShape,
    at: NodeLocationSchema,
  }),
  z.strictObject({
    op: z.literal('updateNode'),
    id: IdSchema,
    patch: nodePatchSchema,
  }),
  z.strictObject({
    op: z.literal('replaceNode'),
    id: IdSchema,
    node: nodeShape,
  }),
  z.strictObject({
    op: z.literal('moveNode'),
    id: IdSchema,
    to: NodeLocationSchema,
  }),
  z.strictObject({
    op: z.literal('deleteNode'),
    id: IdSchema,
  }),
  z.strictObject({
    op: z.literal('wrapNodes'),
    ids: z.array(IdSchema).min(1),
    container: containerShape,
  }),
  z.strictObject({
    op: z.literal('unwrapNode'),
    id: IdSchema,
  }),
  z.strictObject({
    op: z.literal('insertColumn'),
    id: IdSchema,
    index: z.number().int().min(0).optional(),
    width: z.number().positive().optional(),
  }),
  z.strictObject({
    op: z.literal('deleteColumn'),
    id: IdSchema,
    index: z.number().int().min(0),
    moveNodesTo: z.number().int().min(0).optional(),
  }),
]);

export type LoomaCommand = z.input<typeof LoomaCommandSchema>;
export type ParsedLoomaCommand = z.output<typeof LoomaCommandSchema>;
export type CommandOp = LoomaCommand['op'];

export const COMMAND_OPS = [
  'setTitle',
  'setFormat',
  'setTheme',
  'putAsset',
  'removeAsset',
  'insertCard',
  'updateCard',
  'moveCard',
  'duplicateCard',
  'splitCard',
  'deleteCard',
  'insertNode',
  'updateNode',
  'replaceNode',
  'moveNode',
  'deleteNode',
  'wrapNodes',
  'unwrapNode',
  'insertColumn',
  'deleteColumn',
] as const;
