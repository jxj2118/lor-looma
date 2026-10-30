import { createLoomaStore, findNode, parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import {
  exitList,
  indentListItem,
  moveCell,
  removeEmptyBlock,
  splitBlock,
  splitListItem,
} from './structure';
import type { StructureResult } from './structure';

function document(body: unknown[]): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_struct',
    title: 'Structure',
    cards: [{ id: 'c_1', body }],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function apply(doc: LoomaDocument, result: StructureResult | null) {
  expect(result).not.toBeNull();
  const store = createLoomaStore(doc);
  const applied = store.apply(result?.commands ?? [], { origin: 'user', label: 'Edit structure' });
  expect(applied.ok).toBe(true);
  return store.getDocument();
}

describe('structure commands', () => {
  it('turns a heading into a following paragraph', () => {
    const doc = document([{ id: 'b_h', type: 'heading', level: 2, text: 'Hello world' }]);
    const result = splitBlock(doc, 'b_h', 'Hello', ' world');
    const next = apply(doc, result);
    expect(next.cards[0]?.body[0]).toMatchObject({ id: 'b_h', type: 'heading', text: 'Hello' });
    expect(next.cards[0]?.body[1]).toMatchObject({
      id: result?.next?.nodeId,
      type: 'paragraph',
      text: ' world',
    });
    expect(result?.next).toMatchObject({ slot: 'text', caret: 'start' });
    expect(splitBlock(doc, 'missing', '', '')).toBeNull();
  });

  it('exits a one-item list into a paragraph and a nested empty item out of a longer list', () => {
    const only = document([{ id: 'b_list', type: 'list', style: 'bullet', items: [''] }]);
    const replaced = exitList(only, 'b_list', [0]);
    const replacedDoc = apply(only, replaced);
    expect(replacedDoc.cards[0]?.body).toEqual([
      expect.objectContaining({ id: replaced?.next?.nodeId, type: 'paragraph', text: '' }),
    ]);

    const longer = document([
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: ['Stay', { text: 'Parent', children: [''] }],
      },
    ]);
    const exited = exitList(longer, 'b_list', [1, 0]);
    const exitedDoc = apply(longer, exited);
    const list = findNode(exitedDoc, 'b_list')?.node;
    expect(list).toMatchObject({ type: 'list', items: ['Stay', { text: 'Parent' }] });
    expect(exitedDoc.cards[0]?.body[1]).toMatchObject({ type: 'paragraph', text: '' });
    expect(exitList(only, 'missing', [0])).toBeNull();
  });

  it('rejects indenting past the maximum list depth and indents when a previous sibling exists', () => {
    const deep = document([
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: [{ text: 'a', children: [{ text: 'b', children: ['c', 'd'] }] }],
      },
    ]);
    expect(indentListItem(deep, 'b_list', [0, 0, 1], 'd')).toBeNull();

    const doc = document([{ id: 'b_list', type: 'list', style: 'bullet', items: ['One', 'Two'] }]);
    const result = indentListItem(doc, 'b_list', [1], 'Two');
    const next = apply(doc, result);
    expect(findNode(next, 'b_list')?.node).toMatchObject({
      items: [{ text: 'One', children: ['Two'] }],
    });
    expect(result?.next?.slot).toBe('item:0.0');
    expect(indentListItem(doc, 'b_list', [0], 'One')).toBeNull();
  });

  it('points backspace at the previous text block after deleting an empty paragraph', () => {
    const doc = document([
      { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
      { id: 'b_p', type: 'paragraph', text: '' },
    ]);
    const result = removeEmptyBlock(doc, 'b_p');
    const next = apply(doc, result);
    expect(next.cards[0]?.body.map((node) => node.id)).toEqual(['b_h']);
    expect(result?.next).toEqual({ nodeId: 'b_h', slot: 'text', caret: 'end' });
    expect(removeEmptyBlock(doc, 'b_h')).toBeNull();
  });

  it('does not move past the last table cell', () => {
    const doc = document([
      {
        id: 'b_table',
        type: 'table',
        header: false,
        rows: [
          ['A', 'B'],
          ['C', 'D'],
        ],
      },
    ]);
    expect(moveCell(doc, 'b_table', 1, 1, 1)).toBeNull();
    const moved = moveCell(doc, 'b_table', 0, 1, 1);
    expect(moved?.next).toEqual({ nodeId: 'b_table', slot: 'cell:1:0', caret: 'start' });
    expect(moved?.commands).toEqual([]);
  });

  it('splits a list item on the same level', () => {
    const doc = document([
      { id: 'b_list', type: 'list', style: 'check', items: [{ text: 'Hello', checked: true }] },
    ]);
    const result = splitListItem(doc, 'b_list', [0], 'Hel', 'lo');
    const next = apply(doc, result);
    expect(findNode(next, 'b_list')?.node).toMatchObject({
      items: [
        { text: 'Hel', checked: true },
        { text: 'lo', checked: false },
      ],
    });
    expect(splitListItem(doc, 'b_list', [0], '', '')).toBeNull();
  });
});
