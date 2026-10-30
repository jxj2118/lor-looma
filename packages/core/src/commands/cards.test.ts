import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import { applyCommands } from './applyCommands';
import { collectIds } from '../tree/tree';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_1',
    title: 'Demo',
    assets: {
      img_1: { kind: 'image', src: 'https://example.com/a.png', alt: 'Leaf' },
    },
    cards: [
      {
        id: 'c_1',
        notes: 'Speak slowly',
        accent: { position: 'right', assetId: 'img_1' },
        body: [
          { id: 'b_1', type: 'heading', level: 1, text: 'Title' },
          { id: 'b_2', type: 'paragraph', text: 'Hello', align: 'left' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'paragraph', text: 'Right' }],
            ],
          },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_3', type: 'paragraph', text: 'Second' }] },
      { id: 'c_3', body: [{ id: 'b_4', type: 'divider' }] },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

function idsOf(card: LoomaDocument['cards'][number]): string[] {
  const ids = [card.id];
  const walk = (nodes: readonly { id: string; type: string; children?: unknown }[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.type === 'columns' && Array.isArray(node.children)) {
        for (const column of node.children) {
          if (Array.isArray(column)) walk(column as typeof nodes);
        }
      } else if (Array.isArray(node.children)) {
        walk(node.children as typeof nodes);
      }
    }
  };
  walk(card.body as never);
  return ids;
}

describe('card commands', () => {
  it('appends an empty card when card is omitted', () => {
    const doc = document();
    const result = applyCommands(doc, [{ op: 'insertCard' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.cards).toHaveLength(4);
    const created = result.createdIds[0];
    expect(created).toMatch(/^c_[0-9a-z]{8}$/);
    expect(result.touchedIds).toEqual([created]);
    expect(result.doc.cards[3]).toEqual({ id: created, body: [] });
  });

  it('inserts a card at an index', () => {
    const result = applyCommands(document(), [
      {
        op: 'insertCard',
        at: { index: 1 },
        card: { id: 'c_new', body: [{ id: 'b_new', type: 'paragraph', text: 'Inserted' }] },
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.cards.map((card) => card.id)).toEqual(['c_1', 'c_new', 'c_2', 'c_3']);
    expect(result.createdIds).toEqual(['c_new', 'b_new']);
    expect(result.touchedIds).toEqual(['c_new']);
  });

  it('rejects a card whose node is missing a required field', () => {
    const result = applyCommands(document(), [
      { op: 'insertCard', card: { body: [{ type: 'heading' }] } },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'card.body[0].level',
          message: 'is required (expected 1 | 2 | 3)',
        },
      ],
    });
  });

  it('updates card fields and deletes keys set to null', () => {
    const result = applyCommands(document(), [
      {
        op: 'updateCard',
        id: 'c_1',
        patch: {
          notes: null,
          background: { kind: 'color', value: '#fff' },
        },
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.cards[0]?.notes).toBeUndefined();
    expect(result.doc.cards[0]?.background).toEqual({ kind: 'color', value: '#fff' });
    expect(result.doc.cards[0]?.accent).toEqual({ position: 'right', assetId: 'img_1' });
    expect(result.touchedIds).toEqual(['c_1']);
  });

  it('rejects updateCard when the card does not exist', () => {
    const result = applyCommands(document(), [
      { op: 'updateCard', id: 'c_missing', patch: { notes: 'x' } },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'card "c_missing" does not exist' }],
    });
  });

  it('moves a card, counting index after the card is removed', () => {
    const result = applyCommands(document(), [{ op: 'moveCard', id: 'c_1', to: { index: 2 } }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.cards.map((card) => card.id)).toEqual(['c_2', 'c_3', 'c_1']);
    expect(result.touchedIds).toEqual(['c_1']);
  });

  it('rejects moving a card relative to itself', () => {
    const result = applyCommands(document(), [
      { op: 'moveCard', id: 'c_1', to: { before: 'c_1' } },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'to.before',
          message: 'cannot move card "c_1" relative to itself',
        },
      ],
    });
  });

  it('duplicates a card after the original with fresh ids', () => {
    const doc = document();
    const originalIds = new Set(collectIds(doc));
    const result = applyCommands(doc, [{ op: 'duplicateCard', id: 'c_1', newId: 'c_copy' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = result.doc.cards[1];
    if (!copy) throw new Error('missing copy');
    expect(result.doc.cards.map((card) => card.id)).toEqual(['c_1', 'c_copy', 'c_2', 'c_3']);
    const copyIds = idsOf(copy);
    expect(copyIds[0]).toBe('c_copy');
    expect(new Set(copyIds).size).toBe(copyIds.length);
    for (const id of copyIds) expect(originalIds.has(id)).toBe(false);
    expect(result.createdIds).toEqual(copyIds);
    expect(result.touchedIds).toEqual(['c_copy']);
    expect(doc.cards[0]?.id).toBe('c_1');
  });

  it('rejects a duplicateCard newId that is already in use', () => {
    const result = applyCommands(document(), [{ op: 'duplicateCard', id: 'c_1', newId: 'c_2' }]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'newId',
          message: 'id "c_2" is already in use; omit it to let Looma generate one',
        },
      ],
    });
  });

  it('deletes a card and records the card id plus every node id', () => {
    const doc = document();
    const result = applyCommands(doc, [{ op: 'deleteCard', id: 'c_1' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.cards.map((card) => card.id)).toEqual(['c_2', 'c_3']);
    expect(result.removedIds).toEqual(['c_1', 'b_1', 'b_2', 'n_cols', 'b_left', 'b_right']);
    expect(result.touchedIds).toEqual([]);
  });

  it('rejects deleteCard when the card does not exist', () => {
    const result = applyCommands(document(), [{ op: 'deleteCard', id: 'c_missing' }]);
    expect(result).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'card "c_missing" does not exist' }],
    });
  });
});
