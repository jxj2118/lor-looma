import { parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import {
  normalizeSelectIds,
  pruneSelection,
  selectCard,
  selectNode,
  selectionAfterDelete,
} from './selection';
import type { EditorSelection } from './viewState';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_sel',
    title: 'Selection',
    cards: [
      {
        id: 'c_a',
        body: [
          { id: 'b_1', type: 'paragraph', text: 'one' },
          { id: 'b_2', type: 'paragraph', text: 'two' },
          { id: 'b_3', type: 'paragraph', text: 'three' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [
                { id: 'b_left', type: 'paragraph', text: 'Left' },
                { id: 'b_left_2', type: 'paragraph', text: 'Left 2' },
              ],
              [{ id: 'b_right', type: 'paragraph', text: 'Right' }],
            ],
          },
          {
            id: 'n_stack',
            type: 'stack',
            children: [
              { id: 'b_s1', type: 'paragraph', text: 'Stack 1' },
              { id: 'b_s2', type: 'paragraph', text: 'Stack 2' },
            ],
          },
          {
            id: 'n_grid',
            type: 'grid',
            columns: 2,
            children: [
              { id: 'b_g1', type: 'paragraph', text: 'Grid 1' },
              { id: 'b_g2', type: 'paragraph', text: 'Grid 2' },
            ],
          },
        ],
      },
      { id: 'c_b', body: [{ id: 'b_other', type: 'paragraph', text: 'Other' }] },
    ],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

const none: EditorSelection = { cardId: null, nodeIds: [] };

describe('selectNode', () => {
  it('selects the clicked node and its card', () => {
    expect(selectNode(document(), none, 'b_2', false)).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_2'],
    });
  });

  it('extends across siblings in the same parent and slot, in document order', () => {
    const doc = document();
    const current = selectNode(doc, none, 'b_3', false);
    expect(selectNode(doc, current, 'b_1', true)).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_1', 'b_2', 'b_3'],
    });
  });

  it('falls back to a single node when the click is in another slot', () => {
    const doc = document();
    const current = selectNode(doc, none, 'b_left', false);
    expect(selectNode(doc, current, 'b_right', true)).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_right'],
    });
    expect(selectNode(doc, current, 'b_1', true)).toEqual({ cardId: 'c_a', nodeIds: ['b_1'] });
  });

  it('extends across siblings that share a column, stack, or grid', () => {
    const doc = document();
    const left = selectNode(doc, none, 'b_left', false);
    expect(selectNode(doc, left, 'b_left_2', true)).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_left', 'b_left_2'],
    });
    const stack = selectNode(doc, none, 'b_s2', false);
    expect(selectNode(doc, stack, 'b_s1', true)).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_s1', 'b_s2'],
    });
    const grid = selectNode(doc, none, 'b_g1', false);
    expect(selectNode(doc, grid, 'b_g2', true)).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_g1', 'b_g2'],
    });
  });

  it('keeps a single node when there is no anchor or the id is missing', () => {
    const doc = document();
    expect(selectNode(doc, none, 'b_2', true)).toEqual({ cardId: 'c_a', nodeIds: ['b_2'] });
    expect(selectNode(doc, none, 'missing', false)).toBe(none);
  });
});

describe('selectCard', () => {
  it('selects a card without nodes', () => {
    expect(selectCard('c_a')).toEqual({ cardId: 'c_a', nodeIds: [] });
  });
});

describe('pruneSelection', () => {
  it('drops missing nodes and clears a missing card', () => {
    const doc = document();
    expect(pruneSelection(doc, { cardId: 'c_a', nodeIds: ['b_1', 'b_missing'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_1'],
    });
    expect(pruneSelection(doc, { cardId: 'c_gone', nodeIds: ['b_other'] })).toEqual({
      cardId: null,
      nodeIds: ['b_other'],
    });
  });

  it('returns the same selection when nothing changed', () => {
    const doc = document();
    const selection = { cardId: 'c_a', nodeIds: ['b_1'] };
    expect(pruneSelection(doc, selection)).toBe(selection);
  });
});

describe('selectionAfterDelete', () => {
  it('selects the next sibling, then the previous, then the card', () => {
    const doc = document();
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['b_1'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_2'],
    });
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['b_3'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['n_cols'],
    });
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['n_cols'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['n_stack'],
    });
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['b_g2'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_g1'],
    });
    expect(
      selectionAfterDelete(doc, {
        cardId: 'c_a',
        nodeIds: ['b_1', 'b_2', 'b_3', 'n_cols', 'n_stack', 'n_grid'],
      }),
    ).toEqual({ cardId: 'c_a', nodeIds: [] });
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['b_left'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_left_2'],
    });
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['b_s2'] })).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_s1'],
    });
  });

  it('selects a neighboring card when the selection is the card itself', () => {
    const doc = document();
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: [] })).toEqual({
      cardId: 'c_b',
      nodeIds: [],
    });
    expect(selectionAfterDelete(doc, { cardId: 'c_b', nodeIds: [] })).toEqual({
      cardId: 'c_a',
      nodeIds: [],
    });
    expect(selectionAfterDelete(doc, none)).toEqual(none);
    expect(selectionAfterDelete(doc, { cardId: 'c_a', nodeIds: ['missing'] })).toEqual({
      cardId: 'c_a',
      nodeIds: [],
    });
    expect(selectionAfterDelete(doc, { cardId: null, nodeIds: ['missing'] })).toEqual(none);

    const parsed = parseDocument({
      looma: 1,
      id: 'doc_one',
      title: 'One',
      cards: [{ id: 'c_only', body: [{ id: 'b_only', type: 'paragraph', text: 'Only' }] }],
    });
    if (!parsed.ok) throw new Error('fixture failed to parse');
    expect(selectionAfterDelete(parsed.doc, { cardId: 'c_only', nodeIds: [] })).toEqual(none);
  });
});

describe('normalizeSelectIds', () => {
  it('selects a card when given a card id', () => {
    expect(normalizeSelectIds(document(), ['c_b', 'b_1'])).toEqual({
      cardId: 'c_b',
      nodeIds: [],
    });
  });

  it('keeps nodes that share the first existing node card', () => {
    expect(normalizeSelectIds(document(), ['missing', 'b_2', 'b_other', 'b_1'])).toEqual({
      cardId: 'c_a',
      nodeIds: ['b_2', 'b_1'],
    });
  });

  it('returns an empty selection when nothing exists', () => {
    expect(normalizeSelectIds(document(), ['missing'])).toEqual(none);
    expect(normalizeSelectIds(document(), [])).toEqual(none);
  });
});
