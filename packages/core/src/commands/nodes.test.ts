import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import { applyCommands } from './applyCommands';
import type { ApplyResult } from './applyCommands';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_1',
    title: 'Demo',
    cards: [
      {
        id: 'c_1',
        body: [
          { id: 'b_1', type: 'heading', level: 1, text: 'Title' },
          { id: 'b_2', type: 'paragraph', text: 'Hello', align: 'left' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_mid', type: 'paragraph', text: 'Mid' }],
              [],
            ],
          },
          {
            id: 'n_outer',
            type: 'stack',
            children: [
              {
                id: 'n_mid',
                type: 'stack',
                children: [{ id: 'b_deep', type: 'paragraph', text: 'Deep' }],
              },
            ],
          },
          {
            id: 'n_mover',
            type: 'stack',
            children: [{ id: 'b_child', type: 'paragraph', text: 'Child' }],
          },
          { id: 'b_unknown', type: 'unknown', raw: { type: 'video' } },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_3', type: 'paragraph', text: 'Second' }] },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function ok(doc: LoomaDocument, commands: readonly unknown[]): Extract<ApplyResult, { ok: true }> {
  const result = applyCommands(doc, commands);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
}

function failure(doc: LoomaDocument, commands: readonly unknown[]) {
  const result = applyCommands(doc, commands);
  if (result.ok) throw new Error('expected failure');
  return result;
}

describe('insertNode', () => {
  it('inserts before, after, and into a card, stack, or column', () => {
    const before = ok(document(), [
      {
        op: 'insertNode',
        node: { id: 'b_new', type: 'paragraph', text: 'Before' },
        at: { before: 'b_2' },
      },
    ]);
    expect(before.doc.cards[0]?.body.map((node) => node.id).slice(0, 3)).toEqual([
      'b_1',
      'b_new',
      'b_2',
    ]);
    expect(before.touchedIds).toEqual(['b_new']);
    expect(before.createdIds).toEqual(['b_new']);

    const after = ok(document(), [
      {
        op: 'insertNode',
        node: { id: 'b_new', type: 'paragraph', text: 'After' },
        at: { after: 'b_1' },
      },
    ]);
    expect(after.doc.cards[0]?.body.map((node) => node.id).slice(0, 3)).toEqual([
      'b_1',
      'b_new',
      'b_2',
    ]);

    const card = ok(document(), [
      {
        op: 'insertNode',
        node: { id: 'b_new', type: 'paragraph', text: 'End' },
        at: { parent: 'c_2' },
      },
    ]);
    expect(card.doc.cards[1]?.body.map((node) => node.id)).toEqual(['b_3', 'b_new']);

    const stack = ok(document(), [
      {
        op: 'insertNode',
        node: { id: 'b_new', type: 'paragraph', text: 'Stacked' },
        at: { parent: 'n_outer' },
      },
    ]);
    const outer = stack.doc.cards[0]?.body[3];
    if (outer?.type !== 'stack') throw new Error('expected stack');
    expect(outer.children.map((node) => node.id)).toEqual(['n_mid', 'b_new']);

    const column = ok(document(), [
      {
        op: 'insertNode',
        node: { id: 'b_new', type: 'paragraph', text: 'Col' },
        at: { parent: 'n_cols', slot: 1 },
      },
    ]);
    const columns = column.doc.cards[0]?.body[2];
    if (columns?.type !== 'columns') throw new Error('expected columns');
    expect(columns.children[1]?.map((node) => node.id)).toEqual(['b_mid', 'b_new']);
    expect(columns.children[2]).toEqual([]);
  });

  it('touches only the inserted root and records descendant ids as created', () => {
    const result = ok(document(), [
      {
        op: 'insertNode',
        node: {
          type: 'stack',
          children: [{ type: 'paragraph', text: 'Inside' }],
        },
        at: { parent: 'c_2', index: 0 },
      },
    ]);
    expect(result.createdIds).toHaveLength(2);
    expect(result.touchedIds).toEqual([result.createdIds[0]]);
    expect(result.createdIds[0]).toMatch(/^n_/);
    expect(result.createdIds[1]).toMatch(/^b_/);
    expect(result.doc.cards[1]?.body[0]?.id).toBe(result.createdIds[0]);
  });

  it('rejects a node that fails validation and a location that does not exist', () => {
    expect(
      failure(document(), [{ op: 'insertNode', node: { type: 'heading' }, at: { before: 'b_1' } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'node.level',
          message: 'is required (expected 1 | 2 | 3)',
        },
      ],
    });
    expect(
      failure(document(), [
        { op: 'insertNode', node: { type: 'paragraph', text: 'x' }, at: { before: 'missing' } },
      ]),
    ).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'at.before', message: 'node "missing" does not exist' }],
    });
  });
});

describe('updateNode', () => {
  it('merges a patch and deletes optional fields set to null', () => {
    const result = ok(document(), [
      { op: 'updateNode', id: 'b_2', patch: { text: 'Updated', align: null } },
    ]);
    expect(result.doc.cards[0]?.body[1]).toEqual({ id: 'b_2', type: 'paragraph', text: 'Updated' });
    expect(result.touchedIds).toEqual(['b_2']);
  });

  it('rejects a missing node and an unsupported block', () => {
    expect(
      failure(document(), [{ op: 'updateNode', id: 'missing', patch: { text: 'x' } }]),
    ).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'node "missing" does not exist' }],
    });
    expect(
      failure(document(), [
        { op: 'updateNode', id: 'b_unknown', patch: { raw: { type: 'audio' } } },
      ]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'id',
          message: '"b_unknown" is an unsupported block; it can only be moved or deleted',
        },
      ],
    });
  });

  it('rejects patches that change id, type, or children', () => {
    const doc = document();
    expect(failure(doc, [{ op: 'updateNode', id: 'b_2', patch: { id: 'b_9' } }])).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'patch.id', message: 'ids cannot be changed' }],
    });
    expect(failure(doc, [{ op: 'updateNode', id: 'b_2', patch: { type: 'heading' } }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'patch.type',
          message: 'cannot be changed with updateNode; use replaceNode',
        },
      ],
    });
    expect(failure(doc, [{ op: 'updateNode', id: 'n_outer', patch: { children: [] } }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'patch.children',
          message: 'cannot be changed with updateNode; use insertNode, moveNode or deleteNode',
        },
      ],
    });
  });

  it('rejects widths whose length does not match the column count', () => {
    expect(
      failure(document(), [{ op: 'updateNode', id: 'n_cols', patch: { widths: [1, 1] } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'patch.widths',
          message:
            'columns "n_cols" has 3 columns, so widths needs 3 entries; use insertColumn or deleteColumn to change the number of columns',
        },
      ],
    });
  });

  it('reports a schema failure inside the patch', () => {
    expect(failure(document(), [{ op: 'updateNode', id: 'b_1', patch: { level: 4 } }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'patch.level',
          message: 'must be one of 1, 2, 3; received 4',
        },
      ],
    });
  });
});

describe('replaceNode', () => {
  it('replaces a paragraph with columns and keeps the id', () => {
    const result = ok(document(), [
      {
        op: 'replaceNode',
        id: 'b_2',
        node: {
          type: 'columns',
          widths: [1, 1],
          children: [[{ type: 'paragraph', text: 'L' }], [{ type: 'paragraph', text: 'R' }]],
        },
      },
    ]);
    const node = result.doc.cards[0]?.body[1];
    if (node?.type !== 'columns') throw new Error('expected columns');
    expect(node.id).toBe('b_2');
    expect(node.children).toHaveLength(2);
    expect(result.touchedIds).toEqual(['b_2']);
    expect(result.removedIds).toEqual([]);
    expect(result.createdIds).toEqual([node.children[0]?.[0]?.id, node.children[1]?.[0]?.id]);
  });

  it('records descendant ids that the replacement does not keep', () => {
    const result = ok(document(), [
      { op: 'replaceNode', id: 'n_outer', node: { type: 'paragraph', text: 'Flat' } },
    ]);
    expect(result.doc.cards[0]?.body[3]).toMatchObject({
      id: 'n_outer',
      type: 'paragraph',
      text: 'Flat',
    });
    expect(result.removedIds).toEqual(['n_mid', 'b_deep']);
    expect(result.touchedIds).toEqual(['n_outer']);
    expect(result.createdIds).toEqual([]);
  });

  it('rejects a missing node and a new id that is already used', () => {
    expect(
      failure(document(), [{ op: 'replaceNode', id: 'missing', node: { type: 'divider' } }]),
    ).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'node "missing" does not exist' }],
    });
    expect(
      failure(document(), [
        { op: 'replaceNode', id: 'b_2', node: { id: 'b_1', type: 'paragraph', text: 'x' } },
      ]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'node.id',
          message: 'id "b_1" is already in use; omit it to let Looma generate one',
        },
      ],
    });
  });
});

describe('moveNode', () => {
  it('moves a node into another card', () => {
    const result = ok(document(), [{ op: 'moveNode', id: 'b_2', to: { before: 'b_3' } }]);
    expect(result.doc.cards[0]?.body.map((node) => node.id)).not.toContain('b_2');
    expect(result.doc.cards[1]?.body.map((node) => node.id)).toEqual(['b_2', 'b_3']);
    expect(result.touchedIds).toEqual(['b_2']);
    expect(result.createdIds).toEqual([]);
    expect(result.removedIds).toEqual([]);
  });

  it('moves an unsupported block', () => {
    const result = ok(document(), [{ op: 'moveNode', id: 'b_unknown', to: { parent: 'c_2' } }]);
    expect(result.doc.cards[1]?.body.map((node) => node.id)).toEqual(['b_3', 'b_unknown']);
  });

  it('rejects a missing node, a self-relative move, and a move into a descendant', () => {
    const doc = document();
    expect(failure(doc, [{ op: 'moveNode', id: 'missing', to: { before: 'b_1' } }])).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'node "missing" does not exist' }],
    });
    expect(failure(doc, [{ op: 'moveNode', id: 'b_2', to: { before: 'b_2' } }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'to.before',
          message: 'cannot move node "b_2" relative to itself',
        },
      ],
    });
    expect(failure(doc, [{ op: 'moveNode', id: 'n_outer', to: { parent: 'n_outer' } }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'to.parent',
          message: 'cannot move node "n_outer" into itself or its descendants',
        },
      ],
    });
    expect(failure(doc, [{ op: 'moveNode', id: 'n_outer', to: { before: 'b_deep' } }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'to.before',
          message: 'cannot move node "n_outer" into itself or its descendants',
        },
      ],
    });
  });

  it('returns a semantic error when the move nests containers more than 2 levels deep', () => {
    expect(
      failure(document(), [{ op: 'moveNode', id: 'n_mover', to: { parent: 'n_mid' } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: null,
          path: 'cards[0].body[3].children[0].children[1]',
          message: 'containers can be nested at most 2 levels deep',
        },
      ],
    });
  });
});

describe('deleteNode', () => {
  it('deletes a node and its descendants', () => {
    const result = ok(document(), [{ op: 'deleteNode', id: 'n_mover' }]);
    expect(result.doc.cards[0]?.body.map((node) => node.id)).not.toContain('n_mover');
    expect(result.removedIds).toEqual(['n_mover', 'b_child']);
    expect(result.touchedIds).toEqual([]);
  });

  it('rejects a missing node', () => {
    expect(failure(document(), [{ op: 'deleteNode', id: 'missing' }])).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'node "missing" does not exist' }],
    });
  });
});
