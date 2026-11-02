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
          { id: 'b_1', type: 'paragraph', text: 'One' },
          { id: 'b_2', type: 'paragraph', text: 'Two' },
          { id: 'b_3', type: 'paragraph', text: 'Three' },
          { id: 'b_4', type: 'paragraph', text: 'Four' },
          { id: 'b_5', type: 'paragraph', text: 'Five' },
          {
            id: 'n_outer',
            type: 'stack',
            children: [
              {
                id: 'n_mid',
                type: 'stack',
                children: [
                  { id: 'b_a', type: 'paragraph', text: 'A' },
                  { id: 'b_b', type: 'paragraph', text: 'B' },
                ],
              },
            ],
          },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 2, 1],
            children: [
              [
                { id: 'b_c0', type: 'paragraph', text: 'C0' },
                { id: 'b_c0b', type: 'paragraph', text: 'C0b' },
              ],
              [{ id: 'b_c1', type: 'paragraph', text: 'C1' }],
              [{ id: 'b_c2', type: 'paragraph', text: 'C2' }],
            ],
          },
          {
            id: 'n_two',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_l', type: 'paragraph', text: 'L' }],
              [{ id: 'b_r', type: 'paragraph', text: 'R' }],
            ],
          },
          {
            id: 'n_four',
            type: 'columns',
            widths: [1, 1, 1, 1],
            children: [[], [], [], []],
          },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_other', type: 'paragraph', text: 'Other' }] },
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

describe('wrapNodes', () => {
  it('wraps adjacent paragraphs in columns and unwrap restores the document', () => {
    const doc = document();
    const wrapped = ok(doc, [
      { op: 'wrapNodes', ids: ['b_2', 'b_3'], container: { type: 'columns', id: 'n_round' } },
    ]);
    const columns = wrapped.doc.cards[0]?.body[1];
    if (columns?.type !== 'columns') throw new Error('expected columns');
    expect(columns.id).toBe('n_round');
    expect(columns.widths).toEqual([1, 1]);
    expect(columns.children.map((column) => column.map((node) => node.id))).toEqual([
      ['b_2'],
      ['b_3'],
    ]);
    expect(wrapped.createdIds).toEqual(['n_round']);
    expect(wrapped.touchedIds).toEqual(['n_round']);

    const restored = ok(wrapped.doc, [{ op: 'unwrapNode', id: 'n_round' }]);
    expect(restored.doc).toEqual(doc);
    expect(restored.removedIds).toEqual(['n_round']);
    expect(restored.touchedIds).toEqual(['b_2', 'b_3']);
  });

  it('wraps nodes in a stack and keeps container props', () => {
    const result = ok(document(), [
      {
        op: 'wrapNodes',
        ids: ['b_1', 'b_2'],
        container: { type: 'stack', id: 'n_wrap', gap: 'md' },
      },
    ]);
    expect(result.doc.cards[0]?.body[0]).toEqual({
      id: 'n_wrap',
      type: 'stack',
      gap: 'md',
      children: [
        { id: 'b_1', type: 'paragraph', text: 'One' },
        { id: 'b_2', type: 'paragraph', text: 'Two' },
      ],
    });
  });

  it('wraps adjacent nodes in steps and unwraps them in order', () => {
    const doc = document();
    const wrapped = ok(doc, [
      {
        op: 'wrapNodes',
        ids: ['b_1', 'b_2', 'b_3'],
        container: { type: 'steps', id: 'n_steps', direction: 'horizontal', gap: 'sm' },
      },
    ]);
    expect(wrapped.doc.cards[0]?.body[0]).toEqual({
      id: 'n_steps',
      type: 'steps',
      direction: 'horizontal',
      gap: 'sm',
      children: [
        { id: 'b_1', type: 'paragraph', text: 'One' },
        { id: 'b_2', type: 'paragraph', text: 'Two' },
        { id: 'b_3', type: 'paragraph', text: 'Three' },
      ],
    });
    expect(
      failure(wrapped.doc, [{ op: 'moveNode', id: 'n_steps', to: { before: 'b_2' } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'to.before',
          message: 'cannot move node "n_steps" into itself or its descendants',
        },
      ],
    });
    const restored = ok(wrapped.doc, [{ op: 'unwrapNode', id: 'n_steps' }]);
    expect(restored.doc.cards[0]?.body.slice(0, 3)).toEqual([
      { id: 'b_1', type: 'paragraph', text: 'One' },
      { id: 'b_2', type: 'paragraph', text: 'Two' },
      { id: 'b_3', type: 'paragraph', text: 'Three' },
    ]);
  });

  it('generates a container id when one is omitted', () => {
    const result = ok(document(), [
      { op: 'wrapNodes', ids: ['b_5'], container: { type: 'grid', columns: 3 } },
    ]);
    const node = result.doc.cards[0]?.body[4];
    if (node?.type !== 'grid') throw new Error('expected grid');
    expect(node.columns).toBe(3);
    expect(node.id).toMatch(/^n_[0-9a-z]{8}$/);
    expect(result.createdIds).toEqual([node.id]);
    expect(result.touchedIds).toEqual([node.id]);
  });

  it('rejects nodes that do not share a parent, are not adjacent, or are listed twice', () => {
    const doc = document();
    expect(
      failure(doc, [{ op: 'wrapNodes', ids: ['b_1', 'b_other'], container: { type: 'stack' } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'ids',
          message: 'all nodes must share the same parent (b_1 is in c_1, b_other is in c_2)',
        },
      ],
    });
    expect(
      failure(doc, [{ op: 'wrapNodes', ids: ['b_c0', 'b_c1'], container: { type: 'stack' } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'ids',
          message:
            'all nodes must share the same parent (b_c0 is in n_cols slot 0, b_c1 is in n_cols slot 1)',
        },
      ],
    });
    expect(
      failure(doc, [{ op: 'wrapNodes', ids: ['b_2', 'b_4'], container: { type: 'stack' } }]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'ids',
          message: 'nodes must be adjacent; b_3 sits between them',
        },
      ],
    });
    expect(
      failure(doc, [{ op: 'wrapNodes', ids: ['b_1', 'b_1'], container: { type: 'stack' } }]),
    ).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'ids', message: '"b_1" is listed more than once' }],
    });
    expect(
      failure(doc, [{ op: 'wrapNodes', ids: ['missing'], container: { type: 'stack' } }]),
    ).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'ids', message: 'node "missing" does not exist' }],
    });
  });

  it('rejects a columns wrap with the wrong number of nodes or widths', () => {
    const doc = document();
    expect(
      failure(doc, [
        {
          op: 'wrapNodes',
          ids: ['b_1', 'b_2', 'b_3', 'b_4', 'b_5'],
          container: { type: 'columns' },
        },
      ]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'ids',
          message:
            'columns need 2-4 nodes, one per column; received 5. Use stack or grid, or wrap fewer nodes',
        },
      ],
    });
    expect(
      failure(doc, [
        { op: 'wrapNodes', ids: ['b_1', 'b_2'], container: { type: 'columns', widths: [1] } },
      ]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'container.widths',
          message: 'widths needs 2 entries, one per column; received 1',
        },
      ],
    });
  });

  it('returns a semantic error when wrapping would nest containers too deeply', () => {
    expect(
      failure(document(), [
        { op: 'wrapNodes', ids: ['b_a', 'b_b'], container: { type: 'stack', id: 'n_deep' } },
      ]),
    ).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: null,
          path: 'cards[0].body[5].children[0].children[0]',
          message: 'containers can be nested at most 2 levels deep',
        },
      ],
    });
  });
});

describe('unwrapNode', () => {
  it('lifts column children in column order', () => {
    const result = ok(document(), [{ op: 'unwrapNode', id: 'n_cols' }]);
    const ids = result.doc.cards[0]?.body.map((node) => node.id);
    expect(ids?.slice(6, 10)).toEqual(['b_c0', 'b_c0b', 'b_c1', 'b_c2']);
    expect(result.removedIds).toEqual(['n_cols']);
    expect(result.touchedIds).toEqual(['b_c0', 'b_c0b', 'b_c1', 'b_c2']);
  });

  it('rejects a block and a missing id', () => {
    const doc = document();
    expect(failure(doc, [{ op: 'unwrapNode', id: 'b_1' }])).toEqual({
      ok: false,
      errors: [
        { commandIndex: 0, path: 'id', message: '"b_1" is a paragraph block, not a container' },
      ],
    });
    expect(failure(doc, [{ op: 'unwrapNode', id: 'missing' }])).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'node "missing" does not exist' }],
    });
  });
});

describe('insertColumn', () => {
  it('inserts an empty column and a width at the same index', () => {
    const inserted = ok(document(), [{ op: 'insertColumn', id: 'n_cols', index: 1, width: 3 }]);
    const columns = inserted.doc.cards[0]?.body[6];
    if (columns?.type !== 'columns') throw new Error('expected columns');
    expect(columns.widths).toEqual([1, 3, 2, 1]);
    expect(columns.children.map((column) => column.map((node) => node.id))).toEqual([
      ['b_c0', 'b_c0b'],
      [],
      ['b_c1'],
      ['b_c2'],
    ]);
    expect(inserted.touchedIds).toEqual(['n_cols']);

    const appended = ok(document(), [{ op: 'insertColumn', id: 'n_two' }]);
    const two = appended.doc.cards[0]?.body[7];
    if (two?.type !== 'columns') throw new Error('expected columns');
    expect(two.widths).toEqual([1, 1, 1]);
    expect(two.children[2]).toEqual([]);
  });

  it('rejects a full columns container, a bad index, and a node that is not columns', () => {
    const doc = document();
    expect(failure(doc, [{ op: 'insertColumn', id: 'n_four' }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'id',
          message: 'columns "n_four" already has 4 columns (maximum)',
        },
      ],
    });
    expect(failure(doc, [{ op: 'insertColumn', id: 'n_cols', index: 4 }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'index',
          message: 'index 4 is out of range; columns "n_cols" has 3 columns (use 0-3 to insert)',
        },
      ],
    });
    expect(failure(doc, [{ op: 'insertColumn', id: 'b_1' }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'id',
          message: '"b_1" is a paragraph block, not a columns container',
        },
      ],
    });
    expect(failure(doc, [{ op: 'insertColumn', id: 'missing' }])).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'node "missing" does not exist' }],
    });
  });
});

describe('deleteColumn', () => {
  it('appends a deleted column onto moveNodesTo using the index from before the delete', () => {
    const result = ok(document(), [{ op: 'deleteColumn', id: 'n_cols', index: 0, moveNodesTo: 2 }]);
    const columns = result.doc.cards[0]?.body[6];
    if (columns?.type !== 'columns') throw new Error('expected columns');
    expect(columns.widths).toEqual([2, 1]);
    expect(columns.children.map((column) => column.map((node) => node.id))).toEqual([
      ['b_c1'],
      ['b_c2', 'b_c0', 'b_c0b'],
    ]);
    expect(result.touchedIds).toEqual(['n_cols']);
    expect(result.removedIds).toEqual([]);
  });

  it('deletes the nodes in a column when moveNodesTo is omitted', () => {
    const result = ok(document(), [{ op: 'deleteColumn', id: 'n_cols', index: 1 }]);
    const columns = result.doc.cards[0]?.body[6];
    if (columns?.type !== 'columns') throw new Error('expected columns');
    expect(columns.children.map((column) => column.map((node) => node.id))).toEqual([
      ['b_c0', 'b_c0b'],
      ['b_c2'],
    ]);
    expect(columns.widths).toEqual([1, 1]);
    expect(result.removedIds).toEqual(['b_c1']);
  });

  it('rejects the last two columns, a bad index, and moveNodesTo pointing at the deleted column', () => {
    const doc = document();
    expect(failure(doc, [{ op: 'deleteColumn', id: 'n_two', index: 0 }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'id',
          message:
            'columns "n_two" has only 2 columns; use unwrapNode to remove the layout instead',
        },
      ],
    });
    expect(failure(doc, [{ op: 'deleteColumn', id: 'n_cols', index: 3 }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'index',
          message: 'index 3 is out of range; columns "n_cols" has 3 columns (slot 0-2)',
        },
      ],
    });
    expect(failure(doc, [{ op: 'deleteColumn', id: 'n_cols', index: 1, moveNodesTo: 1 }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'moveNodesTo',
          message: 'moveNodesTo cannot be 1, the column being deleted',
        },
      ],
    });
    expect(failure(doc, [{ op: 'deleteColumn', id: 'n_cols', index: 0, moveNodesTo: 3 }])).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'moveNodesTo',
          message: 'moveNodesTo 3 is out of range; columns "n_cols" has 3 columns (0-2)',
        },
      ],
    });
    expect(failure(doc, [{ op: 'deleteColumn', id: 'n_outer', index: 0 }])).toEqual({
      ok: false,
      errors: [
        { commandIndex: 0, path: 'id', message: '"n_outer" is a stack, not a columns container' },
      ],
    });
  });
});
