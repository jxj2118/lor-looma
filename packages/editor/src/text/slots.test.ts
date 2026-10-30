import { createLoomaStore, parseDocument } from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { commitSlot, readSlot, slotPatch } from './slots';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_slots',
    title: 'Slots',
    cards: [
      {
        id: 'c_1',
        body: [
          { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
          { id: 'b_call', type: 'callout', tone: 'info', text: 'Note' },
          {
            id: 'b_list',
            type: 'list',
            style: 'check',
            items: [
              'First',
              {
                text: 'Second',
                checked: true,
                children: [{ text: 'Nested', checked: false, children: ['Leaf'] }],
              },
            ],
          },
          {
            id: 'b_table',
            type: 'table',
            header: true,
            rows: [
              ['A', 'B'],
              ['C', 'D'],
            ],
          },
          { id: 'b_code', type: 'code', language: 'text', code: 'const a = 1' },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function node(doc: LoomaDocument, id: string): LoomaNode {
  for (const card of doc.cards) {
    const found = card.body.find((item) => item.id === id);
    if (found) return found;
  }
  throw new Error(`missing ${id}`);
}

describe('readSlot and slotPatch', () => {
  it('reads and patches heading, callout, nested list items, cells, and code', () => {
    const doc = document();
    const heading = node(doc, 'b_h');
    expect(readSlot(heading, 'text')).toBe('Title');
    expect(slotPatch(heading, 'text', 'Next')).toEqual({ text: 'Next' });

    const callout = node(doc, 'b_call');
    expect(readSlot(callout, 'text')).toBe('Note');
    expect(slotPatch(callout, 'text', 'More')).toEqual({ text: 'More' });

    const list = node(doc, 'b_list');
    expect(readSlot(list, 'item:0')).toBe('First');
    expect(readSlot(list, 'item:1.0')).toBe('Nested');
    expect(slotPatch(list, 'item:0', 'Uno')).toEqual({
      items: ['Uno', list.type === 'list' ? list.items[1] : ''],
    });
    const nested = slotPatch(list, 'item:1.0', 'Inner');
    expect(nested?.items).toEqual([
      'First',
      {
        text: 'Second',
        checked: true,
        children: [{ text: 'Inner', checked: false, children: ['Leaf'] }],
      },
    ]);

    const table = node(doc, 'b_table');
    expect(readSlot(table, 'cell:1:1')).toBe('D');
    expect(slotPatch(table, 'cell:1:1', 'Z')?.rows).toEqual([
      ['A', 'B'],
      ['C', 'Z'],
    ]);

    const code = node(doc, 'b_code');
    expect(readSlot(code, 'code')).toBe('const a = 1');
    expect(slotPatch(code, 'code', 'let b = 2')).toEqual({ code: 'let b = 2' });

    expect(readSlot(list, 'item:9')).toBeUndefined();
    expect(readSlot(table, 'cell:4:4')).toBeUndefined();
    expect(slotPatch(list, 'item:9', 'nope')).toBeNull();
    expect(slotPatch(table, 'cell:4:4', 'nope')).toBeNull();
  });
});

describe('commitSlot', () => {
  it('skips identical text and merges quick successive edits into one undo', () => {
    const store = createLoomaStore(document());
    expect(commitSlot(store, 'b_h', 'text', 'Title')).toBe(false);
    expect(store.canUndo()).toBe(false);

    expect(commitSlot(store, 'b_h', 'text', 'Title!')).toBe(true);
    expect(commitSlot(store, 'b_h', 'text', 'Title!!')).toBe(true);
    expect(store.getDocument().cards[0]?.body[0]).toMatchObject({ text: 'Title!!' });
    expect(store.undo()).toBe(true);
    expect(store.getDocument().cards[0]?.body[0]).toMatchObject({ text: 'Title' });
    expect(store.canUndo()).toBe(false);
  });
});
