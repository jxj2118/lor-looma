import { applyCommands } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { editorDocument } from '../test/fixture';
import { duplicatedNodeIds, duplicateSelection, moveSelection } from './shortcuts';
import type { EditorSelection } from './viewState';

function nodes(ids: string[], cardId = 'c_1'): EditorSelection {
  return { cardId, nodeIds: ids };
}

function card(cardId: string): EditorSelection {
  return { cardId, nodeIds: [] };
}

function columnsDocument() {
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
            widths: [1, 2],
            gap: 'sm',
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'heading', level: 3, text: 'Right' }],
            ],
          },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_other', type: 'paragraph', text: 'Other' }] },
      { id: 'c_3', body: [{ id: 'b_last', type: 'paragraph', text: 'Last' }] },
    ],
  });
}

describe('duplicateSelection', () => {
  it('duplicates one node after itself and leaves id assignment to insertNode', () => {
    const doc = columnsDocument();
    const plan = duplicateSelection(doc, nodes(['b_2']));
    expect(plan).toEqual({
      selectKind: 'nodes',
      commands: [
        {
          op: 'insertNode',
          node: { type: 'paragraph', text: 'Two' },
          at: { after: 'b_2' },
        },
      ],
    });
    const applied = applyCommands(doc, plan?.commands ?? []);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.doc.cards[0]?.body.map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'columns',
    ]);
    expect(applied.doc.cards[0]?.body[2]).toMatchObject({ type: 'paragraph', text: 'Two' });
    expect(applied.doc.cards[0]?.body[2]?.id).not.toBe('b_2');
    expect(duplicatedNodeIds(applied.doc, applied.createdIds)).toEqual([
      applied.doc.cards[0]?.body[2]?.id,
    ]);
  });

  it('duplicates several siblings after the last one, in document order', () => {
    const doc = columnsDocument();
    const plan = duplicateSelection(doc, nodes(['b_3', 'b_1']));
    expect(plan?.commands).toHaveLength(2);
    expect(plan?.commands[0]).toMatchObject({ at: { after: 'b_3' }, node: { text: 'Three' } });
    expect(plan?.commands[1]).toMatchObject({ at: { after: 'b_3' }, node: { text: 'One' } });
    const applied = applyCommands(doc, plan?.commands ?? []);
    if (!applied.ok) throw new Error('duplicate failed');
    expect(
      applied.doc.cards[0]?.body.slice(3, 5).map((node) => ('text' in node ? node.text : '')),
    ).toEqual(['One', 'Three']);
    expect(duplicatedNodeIds(applied.doc, applied.createdIds)).toEqual([
      applied.doc.cards[0]?.body[3]?.id,
      applied.doc.cards[0]?.body[4]?.id,
    ]);
  });

  it('deep-copies a container and strips nested ids', () => {
    const doc = columnsDocument();
    const plan = duplicateSelection(doc, nodes(['n_cols']));
    const node = plan?.commands[0] && 'node' in plan.commands[0] ? plan.commands[0].node : null;
    expect(node).toMatchObject({
      type: 'columns',
      widths: [1, 2],
      gap: 'sm',
      children: [
        [{ type: 'paragraph', text: 'Left' }],
        [{ type: 'heading', level: 3, text: 'Right' }],
      ],
    });
    expect(JSON.stringify(node)).not.toContain('"id"');
    const applied = applyCommands(doc, plan?.commands ?? []);
    if (!applied.ok) throw new Error('duplicate failed');
    const copy = applied.doc.cards[0]?.body[4];
    expect(copy?.type).toBe('columns');
    if (copy?.type !== 'columns') return;
    expect(copy.id).not.toBe('n_cols');
    expect(copy.children[0]?.[0]?.id).not.toBe('b_left');
    expect(copy.children[1]?.[0]?.id).not.toBe('b_right');
    expect(duplicatedNodeIds(applied.doc, applied.createdIds)).toEqual([copy.id]);
  });

  it('refuses nodes that are missing or do not share a parent', () => {
    const doc = columnsDocument();
    expect(duplicateSelection(doc, nodes(['b_1', 'b_left']))).toBeNull();
    expect(duplicateSelection(doc, nodes(['b_1', 'missing']))).toBeNull();
    expect(duplicateSelection(doc, { cardId: null, nodeIds: [] })).toBeNull();
    expect(duplicateSelection(doc, card('missing'))).toBeNull();
  });

  it('duplicates the selected card', () => {
    const doc = columnsDocument();
    expect(duplicateSelection(doc, card('c_2'))).toEqual({
      selectKind: 'card',
      commands: [{ op: 'duplicateCard', id: 'c_2' }],
    });
    const applied = applyCommands(doc, [{ op: 'duplicateCard', id: 'c_2' }]);
    if (!applied.ok) throw new Error('duplicate failed');
    expect(applied.doc.cards.map((item) => item.id)[2]).not.toBe('c_2');
    expect(applied.createdIds[0]).toBe(applied.doc.cards[2]?.id);
    expect(duplicatedNodeIds(applied.doc, applied.createdIds)).toEqual([]);
  });
});

describe('moveSelection', () => {
  it('moves one node and a sibling run up or down', () => {
    const doc = columnsDocument();
    expect(moveSelection(doc, nodes(['b_2']), 'up')).toEqual([
      { op: 'moveNode', id: 'b_2', to: { before: 'b_1' } },
    ]);
    expect(moveSelection(doc, nodes(['b_1', 'b_2']), 'down')).toEqual([
      { op: 'moveNode', id: 'b_2', to: { after: 'b_3' } },
      { op: 'moveNode', id: 'b_1', to: { after: 'b_3' } },
    ]);
    const moved = applyCommands(doc, moveSelection(doc, nodes(['b_1', 'b_2']), 'down') ?? []);
    if (!moved.ok) throw new Error('move failed');
    expect(moved.doc.cards[0]?.body.slice(0, 3).map((node) => node.id)).toEqual([
      'b_3',
      'b_1',
      'b_2',
    ]);
  });

  it('moves a node inside a stack', () => {
    const doc = editorDocument({
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'n_stack',
              type: 'stack',
              children: [
                { id: 'b_a', type: 'paragraph', text: 'A' },
                { id: 'b_b', type: 'paragraph', text: 'B' },
              ],
            },
          ],
        },
      ],
    });
    expect(moveSelection(doc, nodes(['b_b']), 'up')).toEqual([
      { op: 'moveNode', id: 'b_b', to: { before: 'b_a' } },
    ]);
    const grid = editorDocument({
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'n_grid',
              type: 'grid',
              columns: 2,
              children: [
                { id: 'b_a', type: 'paragraph', text: 'A' },
                { id: 'b_b', type: 'paragraph', text: 'B' },
              ],
            },
          ],
        },
      ],
    });
    expect(moveSelection(grid, nodes(['b_a']), 'down')).toEqual([
      { op: 'moveNode', id: 'b_a', to: { after: 'b_b' } },
    ]);
  });

  it('moves a node inside its column and stops at the ends', () => {
    const doc = columnsDocument();
    const withTwo = applyCommands(doc, [
      {
        op: 'insertNode',
        node: { id: 'b_left_2', type: 'paragraph', text: 'Lower' },
        at: { after: 'b_left' },
      },
    ]);
    if (!withTwo.ok) throw new Error('insert failed');
    expect(moveSelection(withTwo.doc, nodes(['b_left_2']), 'up')).toEqual([
      { op: 'moveNode', id: 'b_left_2', to: { before: 'b_left' } },
    ]);
    expect(moveSelection(withTwo.doc, nodes(['b_left']), 'up')).toBeNull();
    expect(moveSelection(withTwo.doc, nodes(['b_left_2']), 'down')).toBeNull();
    expect(moveSelection(doc, nodes(['b_1']), 'up')).toBeNull();
    expect(moveSelection(doc, nodes(['n_cols']), 'down')).toBeNull();
  });

  it('refuses a gap in the selection or a cross-column selection', () => {
    const doc = columnsDocument();
    expect(moveSelection(doc, nodes(['b_1', 'b_3']), 'down')).toBeNull();
    expect(moveSelection(doc, nodes(['b_left', 'b_right']), 'up')).toBeNull();
    expect(moveSelection(doc, nodes(['missing']), 'up')).toBeNull();
    expect(moveSelection(doc, { cardId: null, nodeIds: [] }, 'down')).toBeNull();
    expect(moveSelection(doc, card('missing'), 'up')).toBeNull();
  });

  it('moves a card one step and stops at the ends', () => {
    const doc = columnsDocument();
    expect(moveSelection(doc, card('c_2'), 'up')).toEqual([
      { op: 'moveCard', id: 'c_2', to: { index: 0 } },
    ]);
    expect(moveSelection(doc, card('c_2'), 'down')).toEqual([
      { op: 'moveCard', id: 'c_2', to: { index: 2 } },
    ]);
    expect(moveSelection(doc, card('c_1'), 'up')).toBeNull();
    expect(moveSelection(doc, card('c_3'), 'down')).toBeNull();
    const moved = applyCommands(doc, moveSelection(doc, card('c_3'), 'up') ?? []);
    if (!moved.ok) throw new Error('move failed');
    expect(moved.doc.cards.map((item) => item.id)).toEqual(['c_1', 'c_3', 'c_2']);
  });
});
