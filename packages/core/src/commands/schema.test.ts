import { describe, expect, it } from 'vitest';
import { COMMAND_OPS, CardLocationSchema, LoomaCommandSchema, NodeLocationSchema } from './schema';
import type { CommandOp } from './schema';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type _CommandOpsMatch = Expect<Equal<CommandOp, (typeof COMMAND_OPS)[number]>>;

const VALID_COMMANDS = [
  { op: 'setTitle', title: 'Hello' },
  { op: 'setFormat', format: 'document' },
  { op: 'setTheme', preset: 'dark' },
  { op: 'setTheme', overrides: { colorPrimary: null } },
  { op: 'putAsset', asset: { kind: 'image', src: 'https://example.com/a.png' } },
  { op: 'putAsset', id: 'img_1', asset: { kind: 'image', src: 'https://example.com/a.png' } },
  { op: 'removeAsset', id: 'img_1' },
  { op: 'insertCard' },
  {
    op: 'insertCard',
    card: { body: [{ type: 'paragraph', text: 'Hi' }] },
    at: { index: 0 },
  },
  { op: 'updateCard', id: 'c_1', patch: { notes: 'Speaker note' } },
  { op: 'updateCard', id: 'c_1', patch: { accent: null, background: null } },
  { op: 'moveCard', id: 'c_1', to: { before: 'c_2' } },
  { op: 'duplicateCard', id: 'c_1', newId: 'c_copy' },
  { op: 'deleteCard', id: 'c_1' },
  { op: 'insertNode', node: { type: 'paragraph', text: 'Hi' }, at: { before: 'b_1' } },
  { op: 'updateNode', id: 'b_1', patch: { text: 'Updated' } },
  { op: 'replaceNode', id: 'b_1', node: { type: 'heading', level: 2, text: 'Title' } },
  { op: 'moveNode', id: 'b_1', to: { parent: 'n_1', slot: 0, index: 1 } },
  { op: 'deleteNode', id: 'b_1' },
  { op: 'wrapNodes', ids: ['b_1', 'b_2'], container: { type: 'stack', gap: 'md' } },
  { op: 'unwrapNode', id: 'n_1' },
  { op: 'insertColumn', id: 'n_1', index: 1, width: 1.5 },
  { op: 'deleteColumn', id: 'n_1', index: 2, moveNodesTo: 0 },
] as const;

describe('LoomaCommandSchema', () => {
  it.each(VALID_COMMANDS)('accepts $op', (command) => {
    expect(LoomaCommandSchema.safeParse(command).success).toBe(true);
  });

  it('rejects an unknown op', () => {
    expect(LoomaCommandSchema.safeParse({ op: 'explode' }).success).toBe(false);
  });

  it('rejects insertNode without at', () => {
    expect(
      LoomaCommandSchema.safeParse({ op: 'insertNode', node: { type: 'paragraph' } }).success,
    ).toBe(false);
  });

  it('rejects an unknown key on updateCard.patch', () => {
    const parsed = LoomaCommandSchema.safeParse({
      op: 'updateCard',
      id: 'c_1',
      patch: { notes: 'ok', title: 'nope' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects updateCard when patch is empty', () => {
    expect(LoomaCommandSchema.safeParse({ op: 'updateCard', id: 'c_1', patch: {} }).success).toBe(
      false,
    );
  });

  it('rejects setTheme when both preset and overrides are missing', () => {
    expect(LoomaCommandSchema.safeParse({ op: 'setTheme' }).success).toBe(false);
  });
});

describe('location schemas', () => {
  it('accepts the three node location forms', () => {
    expect(NodeLocationSchema.safeParse({ before: 'b_1' }).success).toBe(true);
    expect(NodeLocationSchema.safeParse({ after: 'b_1' }).success).toBe(true);
    expect(NodeLocationSchema.safeParse({ parent: 'c_1' }).success).toBe(true);
    expect(NodeLocationSchema.safeParse({ parent: 'n_1', slot: 1, index: 0 }).success).toBe(true);
  });

  it('accepts the three card location forms', () => {
    expect(CardLocationSchema.safeParse({ before: 'c_1' }).success).toBe(true);
    expect(CardLocationSchema.safeParse({ after: 'c_1' }).success).toBe(true);
    expect(CardLocationSchema.safeParse({ index: 0 }).success).toBe(true);
  });

  it('rejects a location that sets both before and after', () => {
    expect(NodeLocationSchema.safeParse({ before: 'a', after: 'b' }).success).toBe(false);
    expect(CardLocationSchema.safeParse({ before: 'a', after: 'b' }).success).toBe(false);
  });
});

describe('COMMAND_OPS', () => {
  it('lists the 19 command ops in order', () => {
    expect(COMMAND_OPS).toEqual([
      'setTitle',
      'setFormat',
      'setTheme',
      'putAsset',
      'removeAsset',
      'insertCard',
      'updateCard',
      'moveCard',
      'duplicateCard',
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
    ]);
    expect(COMMAND_OPS).toHaveLength(19);
  });

  it('matches CommandOp', () => {
    const ops: _CommandOpsMatch = true;
    expect(ops).toBe(true);
  });
});
