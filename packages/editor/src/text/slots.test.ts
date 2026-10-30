import { createLoomaStore, parseDocument } from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { commitSlot, defaultSlot, isTextNodeType, readSlot, slotMode, slotPatch } from './slots';

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

  it('commits code as raw text and ignores a missing node or slot', () => {
    const store = createLoomaStore(document());
    expect(commitSlot(store, 'b_code', 'code', 'const a = 1')).toBe(false);
    expect(commitSlot(store, 'b_code', 'code', 'const a = 2')).toBe(true);
    expect(store.getDocument().cards[0]?.body.find((node) => node.id === 'b_code')).toMatchObject({
      code: 'const a = 2',
    });
    expect(commitSlot(store, 'missing', 'text', 'x')).toBe(false);
    expect(commitSlot(store, 'b_h', 'code', 'x')).toBe(false);
    expect(commitSlot(store, 'b_code', 'text', 'x')).toBe(false);
    expect(commitSlot(store, 'b_h', 'not-a-slot' as 'text', 'x')).toBe(false);
  });
});

describe('slot defaults', () => {
  it('picks the first editable slot and the editor mode for each node type', () => {
    const doc = document();
    const quote = { id: 'b_q', type: 'quote' as const, text: 'Said' };
    const paragraph = { id: 'b_p', type: 'paragraph' as const, text: '' };
    const divider = { id: 'b_d', type: 'divider' as const };
    expect(defaultSlot(node(doc, 'b_h'))).toBe('text');
    expect(defaultSlot(paragraph)).toBe('text');
    expect(defaultSlot(quote)).toBe('text');
    expect(defaultSlot(node(doc, 'b_list'))).toBe('item:0');
    expect(defaultSlot(node(doc, 'b_table'))).toBe('cell:0:0');
    expect(defaultSlot(node(doc, 'b_code'))).toBe('code');
    expect(defaultSlot(divider)).toBeNull();

    expect(slotMode(node(doc, 'b_code'), 'code')).toBe('code');
    expect(slotMode(node(doc, 'b_call'), 'text')).toBe('multi');
    expect(slotMode(quote, 'text')).toBe('multi');
    expect(slotMode(node(doc, 'b_h'), 'text')).toBe('single');
    expect(isTextNodeType('paragraph')).toBe(true);
    expect(isTextNodeType('divider')).toBe(false);
    expect(isTextNodeType('image')).toBe(false);
  });

  it('refuses to read or patch a slot the node does not have', () => {
    const doc = document();
    const heading = node(doc, 'b_h');
    const list = node(doc, 'b_list');
    const table = node(doc, 'b_table');
    expect(readSlot(heading, 'code')).toBeUndefined();
    expect(readSlot(heading, 'item:0')).toBeUndefined();
    expect(readSlot(heading, 'cell:0:0')).toBeUndefined();
    expect(readSlot(list, 'text')).toBeUndefined();
    expect(readSlot(list, 'item:0.0')).toBeUndefined();
    expect(readSlot(table, 'code')).toBeUndefined();
    expect(readSlot(quoteNode(), 'text')).toBe('Said');

    expect(slotPatch(list, 'text', 'x')).toBeNull();
    expect(slotPatch(heading, 'code', 'x')).toBeNull();
    expect(slotPatch(heading, 'item:0', 'x')).toBeNull();
    expect(slotPatch(heading, 'cell:0:0', 'x')).toBeNull();
    expect(slotPatch(list, 'item:0.0', 'x')).toBeNull();
    expect(slotPatch(quoteNode(), 'text', 'Again')).toEqual({ text: 'Again' });
    expect(slotPatch(heading, 'nope' as 'text', 'x')).toBeNull();
    expect(slotPatch(list, 'item:1.0.9', 'x')).toBeNull();
  });
});

function quoteNode(): LoomaNode {
  return { id: 'b_q', type: 'quote', text: 'Said' };
}
