import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import { CommandFailure, createCommandContext } from './context';
import { resolveCardLocation, resolveNodeLocation } from './locate';
import type { CardLocation, NodeLocation } from './schema';

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
          { id: 'b_2', type: 'paragraph', text: 'Hello' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'paragraph', text: 'Right' }],
            ],
          },
          {
            id: 'n_stack',
            type: 'stack',
            children: [{ id: 'b_in', type: 'paragraph', text: 'Inside' }],
          },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_3', type: 'paragraph', text: 'Second' }] },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function nodeError(doc: LoomaDocument, at: NodeLocation, path = 'at') {
  const ctx = createCommandContext(doc);
  try {
    resolveNodeLocation(ctx, at, path);
  } catch (error) {
    if (error instanceof CommandFailure) {
      return { commandIndex: error.commandIndex, path: error.path, message: error.message };
    }
    throw error;
  }
  throw new Error('expected a location error');
}

function cardError(doc: LoomaDocument, at: CardLocation | undefined, path = 'at') {
  const ctx = createCommandContext(doc);
  try {
    resolveCardLocation(ctx, at, path);
  } catch (error) {
    if (error instanceof CommandFailure) {
      return { commandIndex: error.commandIndex, path: error.path, message: error.message };
    }
    throw error;
  }
  throw new Error('expected a location error');
}

describe('resolveNodeLocation', () => {
  it('resolves before, after, and parent locations', () => {
    const doc = document();
    const ctx = createCommandContext(doc);
    const card = doc.cards[0];
    const columns = card?.body[2];
    const stack = card?.body[3];
    if (!card || columns?.type !== 'columns' || stack?.type !== 'stack') throw new Error('fixture');

    expect(resolveNodeLocation(ctx, { before: 'b_2' }, 'at')).toEqual({
      array: card.body,
      index: 1,
      parentId: 'c_1',
      slot: null,
      depth: 0,
    });
    expect(resolveNodeLocation(ctx, { after: 'b_left' }, 'at')).toEqual({
      array: columns.children[0],
      index: 1,
      parentId: 'n_cols',
      slot: 0,
      depth: 1,
    });
    expect(resolveNodeLocation(ctx, { parent: 'c_2' }, 'at')).toEqual({
      array: doc.cards[1]?.body,
      index: 1,
      parentId: 'c_2',
      slot: null,
      depth: 0,
    });
    expect(resolveNodeLocation(ctx, { parent: 'n_stack', index: 0 }, 'at')).toEqual({
      array: stack.children,
      index: 0,
      parentId: 'n_stack',
      slot: null,
      depth: 1,
    });
    expect(resolveNodeLocation(ctx, { parent: 'n_cols', slot: 1 }, 'at')).toEqual({
      array: columns.children[1],
      index: 1,
      parentId: 'n_cols',
      slot: 1,
      depth: 1,
    });
    expect(resolveNodeLocation(ctx, { parent: 'c_1', index: 4 }, 'at').index).toBe(4);
  });

  it('rejects a missing node, a card id, and a block used as a parent', () => {
    const doc = document();
    expect(nodeError(doc, { before: 'missing' })).toEqual({
      commandIndex: 0,
      path: 'at.before',
      message: 'node "missing" does not exist',
    });
    expect(nodeError(doc, { after: 'c_1' })).toEqual({
      commandIndex: 0,
      path: 'at.after',
      message:
        'node "c_1" does not exist; "c_1" is a card, so use { parent: "c_1" } to insert into it',
    });
    expect(nodeError(doc, { parent: 'missing' })).toEqual({
      commandIndex: 0,
      path: 'at.parent',
      message: '"missing" does not exist',
    });
    expect(nodeError(doc, { parent: 'b_1' })).toEqual({
      commandIndex: 0,
      path: 'at.parent',
      message: '"b_1" is a heading block and cannot contain other nodes',
    });
  });

  it('rejects a missing, out-of-range, or inapplicable slot and an index past the end', () => {
    const doc = document();
    expect(nodeError(doc, { parent: 'n_cols' })).toEqual({
      commandIndex: 0,
      path: 'at.slot',
      message: 'columns "n_cols" needs a slot (0-1)',
    });
    expect(nodeError(doc, { parent: 'n_cols', slot: 3 })).toEqual({
      commandIndex: 0,
      path: 'at.slot',
      message: 'columns "n_cols" has 2 columns (slot 0-1); received 3',
    });
    expect(nodeError(doc, { parent: 'n_stack', slot: 0 })).toEqual({
      commandIndex: 0,
      path: 'at.slot',
      message: '"n_stack" is a stack and does not use slot; remove slot',
    });
    expect(nodeError(doc, { parent: 'c_1', slot: 0 })).toEqual({
      commandIndex: 0,
      path: 'at.slot',
      message: '"c_1" is a card and does not use slot; remove slot',
    });
    expect(nodeError(doc, { parent: 'c_1', index: 5 })).toEqual({
      commandIndex: 0,
      path: 'at.index',
      message: 'index 5 is past the end; this list has 4 items (use 0-4, or omit index to append)',
    });
  });
});

describe('resolveCardLocation', () => {
  it('defaults to the end and honors before, after, and index', () => {
    const doc = document();
    const ctx = createCommandContext(doc);
    expect(resolveCardLocation(ctx, undefined, 'at')).toBe(2);
    expect(resolveCardLocation(ctx, { index: 0 }, 'at')).toBe(0);
    expect(resolveCardLocation(ctx, { before: 'c_2' }, 'at')).toBe(1);
    expect(resolveCardLocation(ctx, { after: 'c_2' }, 'at')).toBe(2);
    expect(resolveCardLocation(ctx, { index: 2 }, 'at')).toBe(2);
  });

  it('rejects a missing card, a node id, and an index past the end', () => {
    const doc = document();
    expect(cardError(doc, { before: 'missing' })).toEqual({
      commandIndex: 0,
      path: 'at.before',
      message: 'card "missing" does not exist',
    });
    expect(cardError(doc, { after: 'b_1' })).toEqual({
      commandIndex: 0,
      path: 'at.after',
      message: '"b_1" is a node, not a card',
    });
    expect(cardError(doc, { index: 3 })).toEqual({
      commandIndex: 0,
      path: 'at.index',
      message:
        'index 3 is past the end; the document has 2 cards (use 0-2, or omit index to append)',
    });
  });
});
