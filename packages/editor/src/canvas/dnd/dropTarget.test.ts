import { applyCommands } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { editorDocument } from '../../test/fixture';
import {
  buildMoveNodeCommand,
  canDropNode,
  parseDropId,
  subtreeContainerDepth,
} from './dropTarget';

function layout() {
  return editorDocument({
    cards: [
      {
        id: 'c_1',
        body: [
          { id: 'b_1', type: 'paragraph', text: 'One' },
          { id: 'b_2', type: 'paragraph', text: 'Two' },
          { id: 'b_3', type: 'paragraph', text: 'Three' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [],
              [
                {
                  id: 'n_nested',
                  type: 'stack',
                  children: [{ id: 'b_deep', type: 'paragraph', text: 'Deep' }],
                },
              ],
            ],
          },
          {
            id: 'n_outer',
            type: 'stack',
            children: [
              {
                id: 'n_inner',
                type: 'grid',
                columns: 2,
                children: [{ id: 'b_inner', type: 'paragraph', text: 'Inner' }],
              },
            ],
          },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_other', type: 'paragraph', text: 'Other' }] },
      { id: 'c_empty', body: [] },
    ],
  });
}

describe('subtreeContainerDepth', () => {
  it('counts blocks as 0 and containers by their deepest nested container', () => {
    const doc = layout();
    const block = doc.cards[0]?.body[0];
    const columns = doc.cards[0]?.body[3];
    const outer = doc.cards[0]?.body[4];
    if (!block || !columns || !outer) throw new Error('fixture missing');
    expect(subtreeContainerDepth(block)).toBe(0);
    expect(subtreeContainerDepth(columns)).toBe(2);
    expect(subtreeContainerDepth(outer)).toBe(2);
  });
});

describe('canDropNode and buildMoveNodeCommand', () => {
  it('reorders siblings and refuses a move that stays put', () => {
    const doc = layout();
    const command = buildMoveNodeCommand(doc, 'b_3', { kind: 'before', nodeId: 'b_1' });
    expect(command).toEqual({ op: 'moveNode', id: 'b_3', to: { before: 'b_1' } });
    const moved = applyCommands(doc, command ? [command] : []);
    if (!moved.ok) throw new Error('move failed');
    expect(moved.doc.cards[0]?.body.slice(0, 3).map((node) => node.id)).toEqual([
      'b_3',
      'b_1',
      'b_2',
    ]);
    expect(buildMoveNodeCommand(doc, 'b_1', { kind: 'before', nodeId: 'b_2' })).toBeNull();
    expect(buildMoveNodeCommand(doc, 'b_2', { kind: 'after', nodeId: 'b_1' })).toBeNull();
    expect(buildMoveNodeCommand(doc, 'b_2', { kind: 'before', nodeId: 'b_2' })).toBeNull();
    expect(buildMoveNodeCommand(doc, 'b_2', { kind: 'after', nodeId: 'b_2' })).toBeNull();
  });

  it('moves a block across columns, into an empty column, and out of a container', () => {
    const doc = layout();
    const across = buildMoveNodeCommand(doc, 'b_left', { kind: 'before', nodeId: 'b_deep' });
    expect(across).toEqual({ op: 'moveNode', id: 'b_left', to: { before: 'b_deep' } });
    const intoEmpty = buildMoveNodeCommand(doc, 'b_2', {
      kind: 'inside',
      parentId: 'n_cols',
      slot: 1,
      index: 0,
    });
    expect(intoEmpty).toEqual({
      op: 'moveNode',
      id: 'b_2',
      to: { parent: 'n_cols', slot: 1, index: 0 },
    });
    const applied = applyCommands(doc, intoEmpty ? [intoEmpty] : []);
    if (!applied.ok) throw new Error('move failed');
    const columns = applied.doc.cards[0]?.body.find((node) => node.id === 'n_cols');
    if (columns?.type !== 'columns') throw new Error('columns missing');
    expect(columns.children[1]?.map((node) => node.id)).toEqual(['b_2']);

    const out = buildMoveNodeCommand(doc, 'b_left', { kind: 'after', nodeId: 'n_cols' });
    expect(out).toEqual({ op: 'moveNode', id: 'b_left', to: { after: 'n_cols' } });
    const lifted = applyCommands(doc, out ? [out] : []);
    if (!lifted.ok) throw new Error('move failed');
    expect(lifted.doc.cards[0]?.body.map((node) => node.id)).toContain('b_left');
  });

  it('moves a block into an empty card and onto another card', () => {
    const doc = layout();
    const intoCard = buildMoveNodeCommand(doc, 'b_1', {
      kind: 'inside',
      parentId: 'c_empty',
      index: 0,
    });
    expect(intoCard).toEqual({ op: 'moveNode', id: 'b_1', to: { parent: 'c_empty', index: 0 } });
    const applied = applyCommands(doc, intoCard ? [intoCard] : []);
    if (!applied.ok) throw new Error('move failed');
    expect(applied.doc.cards[2]?.body.map((node) => node.id)).toEqual(['b_1']);

    expect(buildMoveNodeCommand(doc, 'b_2', { kind: 'before', nodeId: 'b_other' })).toEqual({
      op: 'moveNode',
      id: 'b_2',
      to: { before: 'b_other' },
    });
    expect(buildMoveNodeCommand(doc, 'b_3', { kind: 'inside', parentId: 'c_2' })).toEqual({
      op: 'moveNode',
      id: 'b_3',
      to: { parent: 'c_2', index: 1 },
    });
  });

  it('rejects a drop onto itself, a descendant, a missing target, or a nest past two containers', () => {
    const doc = layout();
    expect(canDropNode(doc, 'missing', { kind: 'before', nodeId: 'b_1' })).toBe(false);
    expect(canDropNode(doc, 'n_cols', { kind: 'before', nodeId: 'b_left' })).toBe(false);
    expect(canDropNode(doc, 'n_cols', { kind: 'inside', parentId: 'n_cols', slot: 1 })).toBe(false);
    expect(canDropNode(doc, 'n_outer', { kind: 'before', nodeId: 'b_inner' })).toBe(false);
    expect(canDropNode(doc, 'n_cols', { kind: 'inside', parentId: 'n_inner' })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'missing' })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'c_1', slot: 0 })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'n_cols' })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'n_cols', slot: 9 })).toBe(false);
    expect(canDropNode(doc, 'b_2', { kind: 'inside', parentId: 'b_1' })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'n_cols', slot: 0, index: 8 })).toBe(
      false,
    );
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'n_outer', slot: 1 })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'n_outer', index: 9 })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'inside', parentId: 'c_empty', index: -1 })).toBe(false);
    expect(canDropNode(doc, 'b_1', { kind: 'before', nodeId: 'missing' })).toBe(false);
    expect(
      buildMoveNodeCommand(doc, 'n_outer', { kind: 'inside', parentId: 'n_inner' }),
    ).toBeNull();
    expect(
      buildMoveNodeCommand(doc, 'b_1', { kind: 'inside', parentId: 'c_empty', index: 4 }),
    ).toBeNull();
  });

  it('treats an inside drop at the current index as a no-op', () => {
    const doc = layout();
    expect(
      buildMoveNodeCommand(doc, 'b_2', { kind: 'inside', parentId: 'c_1', index: 1 }),
    ).toBeNull();
    expect(
      buildMoveNodeCommand(doc, 'b_2', { kind: 'inside', parentId: 'c_1', index: 2 }),
    ).toBeNull();
    expect(
      buildMoveNodeCommand(doc, 'b_left', {
        kind: 'inside',
        parentId: 'n_cols',
        slot: 0,
        index: 0,
      }),
    ).toBeNull();
  });
});

describe('parseDropId', () => {
  it('reads before, after, and inside targets', () => {
    expect(parseDropId('before:b_1')).toEqual({ kind: 'before', nodeId: 'b_1' });
    expect(parseDropId('after:b_2')).toEqual({ kind: 'after', nodeId: 'b_2' });
    expect(parseDropId('inside:c_1')).toEqual({ kind: 'inside', parentId: 'c_1', index: 0 });
    expect(parseDropId('inside:n_cols:1')).toEqual({
      kind: 'inside',
      parentId: 'n_cols',
      slot: 1,
      index: 0,
    });
    expect(parseDropId('inside:n_cols:-1')).toBeNull();
    expect(parseDropId('nope')).toBeNull();
    expect(parseDropId('before:')).toBeNull();
  });
});
