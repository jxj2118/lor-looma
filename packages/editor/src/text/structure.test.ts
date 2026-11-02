import { createLoomaStore, findNode, parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import {
  adjacentTextSlot,
  deleteTableColumn,
  deleteTableRow,
  exitList,
  indentListItem,
  insertTableColumn,
  insertTableRow,
  moveCell,
  outdentListItem,
  removeEmptyBlock,
  removeListItem,
  splitBlock,
  splitListItem,
  toggleChecked,
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

  it('inserts and deletes a table row or column around a cell', () => {
    const rows = [
      ['A', 'B'],
      ['C', 'D'],
    ] as const;
    expect(insertTableRow(rows, 1, 'above')).toEqual([
      ['A', 'B'],
      ['', ''],
      ['C', 'D'],
    ]);
    expect(insertTableRow(rows, 0, 'below')).toEqual([
      ['A', 'B'],
      ['', ''],
      ['C', 'D'],
    ]);
    expect(insertTableColumn(rows, 0, 'left')).toEqual([
      ['', 'A', 'B'],
      ['', 'C', 'D'],
    ]);
    expect(insertTableColumn(rows, 1, 'right')).toEqual([
      ['A', 'B', ''],
      ['C', 'D', ''],
    ]);
    expect(deleteTableRow(rows, 0)).toEqual([['C', 'D']]);
    expect(deleteTableRow([['A']], 0)).toBeNull();
    expect(deleteTableRow(rows, 4)).toBeNull();
    expect(deleteTableColumn(rows, 1)).toEqual([['A'], ['C']]);
    expect(deleteTableColumn([['A']], 0)).toBeNull();
    expect(deleteTableColumn(rows, -1)).toBeNull();
    expect(rows).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('walks editable slots in one card and stops at the ends', () => {
    const doc = document([
      { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: [{ text: 'Parent', children: ['Child'] }, 'Next'],
      },
      {
        id: 'n_cols',
        type: 'columns',
        widths: [1, 1],
        children: [
          [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
          [
            {
              id: 'b_table',
              type: 'table',
              header: false,
              rows: [
                ['A', 'B'],
                ['C', 'D'],
              ],
            },
          ],
        ],
      },
      { id: 'b_code', type: 'code', code: 'print(1)', language: 'py' },
    ]);
    expect(adjacentTextSlot(doc, 'b_h', 'text', 'prev')).toBeNull();
    expect(adjacentTextSlot(doc, 'b_h', 'text', 'next')).toEqual({
      nodeId: 'b_list',
      slot: 'item:0',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_list', 'item:0', 'next')).toEqual({
      nodeId: 'b_list',
      slot: 'item:0.0',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_list', 'item:0.0', 'next')).toEqual({
      nodeId: 'b_list',
      slot: 'item:1',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_list', 'item:1', 'next')).toEqual({
      nodeId: 'b_left',
      slot: 'text',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_table', 'cell:0:1', 'next')).toEqual({
      nodeId: 'b_table',
      slot: 'cell:1:0',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_table', 'cell:1:1', 'next')).toEqual({
      nodeId: 'b_code',
      slot: 'code',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_code', 'code', 'prev')?.caret).toBe('end');
    expect(adjacentTextSlot(doc, 'b_code', 'code', 'next')).toBeNull();
    expect(adjacentTextSlot(doc, 'missing', 'text', 'next')).toBeNull();
    expect(adjacentTextSlot(doc, 'b_h', 'code', 'next')).toBeNull();
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
    expect(splitListItem(doc, 'missing', [0], 'a', 'b')).toBeNull();
  });

  it('splits a paragraph and a nested list item', () => {
    const doc = document([
      { id: 'b_p', type: 'paragraph', text: 'Hello' },
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: [{ text: 'Parent', children: ['Hello'] }],
      },
    ]);
    const split = splitBlock(doc, 'b_p', 'Hel', 'lo');
    const next = apply(doc, split);
    expect(next.cards[0]?.body[0]).toMatchObject({ id: 'b_p', text: 'Hel' });
    expect(next.cards[0]?.body[1]).toMatchObject({ type: 'paragraph', text: 'lo' });
    expect(splitBlock(doc, 'b_list', 'a', 'b')).toBeNull();

    const nested = splitListItem(doc, 'b_list', [0, 0], 'Hel', 'lo');
    const nestedDoc = apply(doc, nested);
    expect(findNode(nestedDoc, 'b_list')?.node).toMatchObject({
      items: [{ text: 'Parent', children: ['Hel', 'lo'] }],
    });
    expect(nested?.next?.slot).toBe('item:0.1');
    expect(splitListItem(doc, 'b_list', [4], 'a', 'b')).toBeNull();
  });

  it('outdents a nested item to sit after its parent', () => {
    const doc = document([
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: [{ text: 'Parent', children: ['Child', 'Stay'] }],
      },
    ]);
    const result = outdentListItem(doc, 'b_list', [0, 0], 'Child');
    const next = apply(doc, result);
    expect(findNode(next, 'b_list')?.node).toMatchObject({
      items: [{ text: 'Parent', children: ['Stay'] }, 'Child'],
    });
    expect(result?.next?.slot).toBe('item:1');
    expect(outdentListItem(doc, 'b_list', [0], 'Parent')).toBeNull();
    expect(outdentListItem(doc, 'b_list', [3, 0], 'x')).toBeNull();
    expect(outdentListItem(doc, 'missing', [0, 0], 'x')).toBeNull();
  });

  it('removes a list item and exits when it was the only one', () => {
    const doc = document([{ id: 'b_list', type: 'list', style: 'bullet', items: ['A', 'B', 'C'] }]);
    const middle = removeListItem(doc, 'b_list', [1]);
    expect(findNode(apply(doc, middle), 'b_list')?.node).toMatchObject({ items: ['A', 'C'] });
    expect(middle?.next).toEqual({ nodeId: 'b_list', slot: 'item:0', caret: 'end' });

    const first = removeListItem(doc, 'b_list', [0]);
    expect(findNode(apply(doc, first), 'b_list')?.node).toMatchObject({ items: ['B', 'C'] });
    expect(first?.next).toEqual({ nodeId: 'b_list', slot: 'item:0', caret: 'start' });

    const nested = document([
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: [{ text: 'Parent', children: ['A', 'B'] }],
      },
    ]);
    const child = removeListItem(nested, 'b_list', [0, 1]);
    expect(findNode(apply(nested, child), 'b_list')?.node).toMatchObject({
      items: [{ text: 'Parent', children: ['A'] }],
    });
    expect(child?.next?.slot).toBe('item:0.0');

    const only = document([{ id: 'b_list', type: 'list', style: 'bullet', items: ['Solo'] }]);
    const exited = removeListItem(only, 'b_list', [0]);
    expect(apply(only, exited).cards[0]?.body[0]).toMatchObject({ type: 'paragraph', text: '' });
    expect(removeListItem(doc, 'b_list', [9])).toBeNull();
    expect(removeListItem(doc, 'missing', [0])).toBeNull();
  });

  it('toggles a check on a string item and an object item', () => {
    expect(toggleChecked(['A', { text: 'B', checked: true }], [0])).toEqual([
      { text: 'A', checked: true },
      { text: 'B', checked: true },
    ]);
    expect(toggleChecked([{ text: 'B', checked: true, children: ['C'] }], [0])).toEqual([
      { text: 'B', checked: false, children: ['C'] },
    ]);
    expect(toggleChecked(['A'], [])).toBeNull();
    expect(toggleChecked(['A'], [3])).toBeNull();
    expect(toggleChecked([{ text: 'A' }], [0, 0])).toBeNull();
  });

  it('moves to the previous table cell and rejects a cell that is not there', () => {
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
    expect(moveCell(doc, 'b_table', 1, 0, -1)?.next).toEqual({
      nodeId: 'b_table',
      slot: 'cell:0:1',
      caret: 'start',
    });
    expect(moveCell(doc, 'b_table', 0, 0, -1)).toBeNull();
    expect(moveCell(doc, 'b_table', 4, 0, 1)).toBeNull();
    expect(moveCell(doc, 'missing', 0, 0, 1)).toBeNull();

    const jagged = document([
      {
        id: 'b_table',
        type: 'table',
        header: false,
        rows: [['A'], []],
      },
    ]);
    expect(moveCell(jagged, 'b_table', 0, 0, 1)?.next?.slot).toBe('cell:1:0');
  });

  it('backs up into the previous text block inside a column, stack, or grid', () => {
    const columns = document([
      {
        id: 'n_cols',
        type: 'columns',
        widths: [1, 1],
        children: [
          [
            { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
            { id: 'b_p', type: 'paragraph', text: '' },
          ],
          [{ id: 'b_r', type: 'paragraph', text: 'Right' }],
        ],
      },
    ]);
    const column = removeEmptyBlock(columns, 'b_p');
    expect(apply(columns, column).cards[0]?.body[0]).toMatchObject({
      children: [
        [{ id: 'b_h', type: 'heading', text: 'Title' }],
        [{ id: 'b_r', type: 'paragraph' }],
      ],
    });
    expect(column?.next).toEqual({ nodeId: 'b_h', slot: 'text', caret: 'end' });

    const stack = document([
      {
        id: 'n_stack',
        type: 'stack',
        children: [
          { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
          { id: 'b_p', type: 'paragraph', text: '' },
        ],
      },
    ]);
    expect(removeEmptyBlock(stack, 'b_p')?.next?.nodeId).toBe('b_h');

    const grid = document([
      {
        id: 'n_grid',
        type: 'grid',
        columns: 2,
        children: [
          { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
          { id: 'b_p', type: 'paragraph', text: '' },
        ],
      },
    ]);
    expect(removeEmptyBlock(grid, 'b_p')?.next?.nodeId).toBe('b_h');

    const alone = document([{ id: 'b_p', type: 'paragraph', text: '' }]);
    const removed = removeEmptyBlock(alone, 'b_p');
    expect(apply(alone, removed).cards[0]?.body).toEqual([]);
    expect(removed?.next).toBeNull();

    const divider = document([
      { id: 'b_d', type: 'divider' },
      { id: 'b_p', type: 'paragraph', text: '' },
    ]);
    expect(removeEmptyBlock(divider, 'b_p')?.next).toBeNull();
    expect(removeEmptyBlock(divider, 'b_p')?.commands).toEqual([{ op: 'deleteNode', id: 'b_p' }]);
    expect(removeEmptyBlock(columns, 'missing')).toBeNull();
    expect(removeEmptyBlock(columns, 'b_h')).toBeNull();
  });

  it('refuses to indent an item whose children would pass the list depth limit', () => {
    const deep = document([
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: [
          {
            text: 'a',
            children: [
              { text: 'b', children: ['c'] },
              { text: 'move', children: ['deep'] },
            ],
          },
        ],
      },
    ]);
    expect(indentListItem(deep, 'b_list', [0, 1], 'move')).toBeNull();

    const doc = document([
      {
        id: 'b_list',
        type: 'list',
        style: 'bullet',
        items: ['Prev', { text: 'Parent', children: ['Kid'] }],
      },
    ]);
    const result = indentListItem(doc, 'b_list', [1], 'Parent');
    const next = apply(doc, result);
    expect(findNode(next, 'b_list')?.node).toMatchObject({
      items: [{ text: 'Prev', children: [{ text: 'Parent', children: ['Kid'] }] }],
    });
    expect(result?.next?.slot).toBe('item:0.0');
    expect(indentListItem(doc, 'missing', [1], 'Parent')).toBeNull();
    expect(indentListItem(doc, 'b_list', [8], 'nope')).toBeNull();
  });

  it('returns null when a list exit targets a missing item', () => {
    const doc = document([{ id: 'b_list', type: 'list', style: 'bullet', items: ['Stay', 'Go'] }]);
    expect(exitList(doc, 'b_list', [9])).toBeNull();
  });

  it('moves from a stat value through its detail and into a math block inside steps', () => {
    const doc = document([
      { id: 'b_stat', type: 'stat', value: '98%', label: 'Done', detail: '+1' },
      {
        id: 'n_steps',
        type: 'steps',
        children: [{ id: 'b_math', type: 'math', tex: 'E = mc^2' }],
      },
    ]);
    expect(adjacentTextSlot(doc, 'b_stat', 'stat:value', 'next')).toEqual({
      nodeId: 'b_stat',
      slot: 'stat:label',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_stat', 'stat:label', 'next')).toEqual({
      nodeId: 'b_stat',
      slot: 'stat:detail',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_stat', 'stat:detail', 'next')).toEqual({
      nodeId: 'b_math',
      slot: 'code',
      caret: 'start',
    });
    expect(adjacentTextSlot(doc, 'b_math', 'code', 'prev')).toEqual({
      nodeId: 'b_stat',
      slot: 'stat:detail',
      caret: 'end',
    });
  });
});
