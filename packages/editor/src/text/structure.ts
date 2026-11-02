import { createId, findCard, findNode, MAX_LIST_DEPTH } from '@lor-looma/core';
import type { ListItem, LoomaCommand, LoomaDocument, LoomaNode } from '@lor-looma/core';
import type { SlotKey } from '@lor-looma/viewer';
import type { EditingState } from '../state/viewState';
import { defaultSlot, isTextNodeType } from './slots';

export interface StructureResult {
  commands: LoomaCommand[];
  next: { nodeId: string; slot: SlotKey; caret: 'start' | 'end' } | null;
}

function siblingsOf(doc: LoomaDocument, nodeId: string): LoomaNode[] {
  const found = findNode(doc, nodeId);
  if (!found) return [];
  if (found.parentId === found.cardId) return findCard(doc, found.cardId)?.card.body ?? [];
  const parent = findNode(doc, found.parentId);
  if (!parent) return [];
  if (parent.node.type === 'columns') {
    return found.slot === null ? [] : (parent.node.children[found.slot] ?? []);
  }
  if (parent.node.type === 'stack' || parent.node.type === 'grid' || parent.node.type === 'steps') {
    return parent.node.children;
  }
  return [];
}

function locateItem(
  items: readonly ListItem[],
  path: readonly number[],
): { list: ListItem[]; index: number; item: ListItem } | null {
  if (path.length === 0) return null;
  let list = items;
  for (let depth = 0; depth < path.length - 1; depth += 1) {
    const index = path[depth];
    if (index === undefined) return null;
    const item = list[index];
    if (item === undefined || typeof item === 'string' || !item.children) return null;
    list = item.children;
  }
  const index = path[path.length - 1];
  if (index === undefined) return null;
  const item = list[index];
  if (item === undefined) return null;
  return { list: [...list], index, item };
}

function writeChildList(
  items: readonly ListItem[],
  parentPath: readonly number[],
  next: ListItem[],
): ListItem[] {
  if (parentPath.length === 0) return next;
  const [head, ...rest] = parentPath;
  return items.map((item, index) => {
    if (index !== head) return item;
    const object = typeof item === 'string' ? { text: item } : { ...item };
    return { ...object, children: writeChildList(object.children ?? [], rest, next) };
  });
}

function withText(item: ListItem, text: string): ListItem {
  return typeof item === 'string' ? text : { ...item, text };
}

function itemDepth(item: ListItem, depth: number): number {
  if (typeof item === 'string' || !item.children || item.children.length === 0) return depth;
  return Math.max(...item.children.map((child) => itemDepth(child, depth + 1)));
}

export function splitBlock(
  doc: LoomaDocument,
  nodeId: string,
  before: string,
  after: string,
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || (found.node.type !== 'heading' && found.node.type !== 'paragraph')) return null;
  const newId = createId('block');
  return {
    commands: [
      { op: 'updateNode', id: nodeId, patch: { text: before } },
      {
        op: 'insertNode',
        node: { id: newId, type: 'paragraph', text: after },
        at: { after: nodeId },
      },
    ],
    next: { nodeId: newId, slot: 'text', caret: 'start' },
  };
}

export function removeEmptyBlock(doc: LoomaDocument, nodeId: string): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'paragraph' || found.node.text !== '') return null;
  const previous = siblingsOf(doc, nodeId)
    .slice(0, found.index)
    .reverse()
    .find((node) => isTextNodeType(node.type));
  const slot = previous ? defaultSlot(previous) : null;
  return {
    commands: [{ op: 'deleteNode', id: nodeId }],
    next: previous && slot ? { nodeId: previous.id, slot, caret: 'end' } : null,
  };
}

export function splitListItem(
  doc: LoomaDocument,
  nodeId: string,
  path: number[],
  before: string,
  after: string,
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'list') return null;
  if (before === '' && after === '') return null;
  const located = locateItem(found.node.items, path);
  if (!located) return null;
  const nextItem: ListItem = found.node.style === 'check' ? { text: after, checked: false } : after;
  located.list.splice(located.index, 1, withText(located.item, before), nextItem);
  return {
    commands: [
      {
        op: 'updateNode',
        id: nodeId,
        patch: { items: writeChildList(found.node.items, path.slice(0, -1), located.list) },
      },
    ],
    next: {
      nodeId,
      slot: `item:${[...path.slice(0, -1), located.index + 1].join('.')}`,
      caret: 'start',
    },
  };
}

export function indentListItem(
  doc: LoomaDocument,
  nodeId: string,
  path: number[],
  text: string,
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'list') return null;
  const located = locateItem(found.node.items, path);
  if (!located || located.index === 0) return null;
  const moved = withText(located.item, text);
  if (itemDepth(moved, path.length + 1) > MAX_LIST_DEPTH) return null;
  const previous = located.list[located.index - 1];
  if (previous === undefined) return null;
  const previousObject = typeof previous === 'string' ? { text: previous } : { ...previous };
  const children = [...(previousObject.children ?? []), moved];
  located.list.splice(located.index - 1, 2, { ...previousObject, children });
  const childIndex = children.length - 1;
  return {
    commands: [
      {
        op: 'updateNode',
        id: nodeId,
        patch: { items: writeChildList(found.node.items, path.slice(0, -1), located.list) },
      },
    ],
    next: {
      nodeId,
      slot: `item:${[...path.slice(0, -1), located.index - 1, childIndex].join('.')}`,
      caret: 'start',
    },
  };
}

export function outdentListItem(
  doc: LoomaDocument,
  nodeId: string,
  path: number[],
  text: string,
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'list' || path.length < 2) return null;
  const located = locateItem(found.node.items, path);
  if (!located) return null;
  const parentIndex = path[path.length - 2];
  if (parentIndex === undefined) return null;
  const grandPath = path.slice(0, -2);
  const parentList = locateItem(found.node.items, path.slice(0, -1));
  if (!parentList) return null;
  const moved = withText(located.item, text);
  located.list.splice(located.index, 1);
  const withChild = writeChildList(found.node.items, path.slice(0, -1), located.list);
  const grand = locateItem(withChild, [...grandPath, parentIndex]);
  if (!grand) return null;
  grand.list.splice(grand.index + 1, 0, moved);
  return {
    commands: [
      {
        op: 'updateNode',
        id: nodeId,
        patch: { items: writeChildList(withChild, grandPath, grand.list) },
      },
    ],
    next: {
      nodeId,
      slot: `item:${[...grandPath, grand.index + 1].join('.')}`,
      caret: 'start',
    },
  };
}

function countItems(items: readonly ListItem[]): number {
  let count = 0;
  for (const item of items) {
    count += 1;
    if (typeof item !== 'string' && item.children) count += countItems(item.children);
  }
  return count;
}

export function exitList(
  doc: LoomaDocument,
  nodeId: string,
  path: number[],
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'list') return null;
  const paragraphId = createId('block');
  if (countItems(found.node.items) <= 1) {
    return {
      commands: [
        { op: 'replaceNode', id: nodeId, node: { id: paragraphId, type: 'paragraph', text: '' } },
      ],
      next: { nodeId: paragraphId, slot: 'text', caret: 'start' },
    };
  }
  const located = locateItem(found.node.items, path);
  if (!located) return null;
  located.list.splice(located.index, 1);
  return {
    commands: [
      {
        op: 'updateNode',
        id: nodeId,
        patch: { items: writeChildList(found.node.items, path.slice(0, -1), located.list) },
      },
      {
        op: 'insertNode',
        node: { id: paragraphId, type: 'paragraph', text: '' },
        at: { after: nodeId },
      },
    ],
    next: { nodeId: paragraphId, slot: 'text', caret: 'start' },
  };
}

export function removeListItem(
  doc: LoomaDocument,
  nodeId: string,
  path: number[],
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'list') return null;
  const located = locateItem(found.node.items, path);
  if (!located) return null;
  if (located.index === 0 && countItems(found.node.items) <= 1) return exitList(doc, nodeId, path);
  const nextPath = located.index === 0 ? path : [...path.slice(0, -1), located.index - 1];
  const caret = located.index === 0 ? 'start' : 'end';
  located.list.splice(located.index, 1);
  return {
    commands: [
      {
        op: 'updateNode',
        id: nodeId,
        patch: { items: writeChildList(found.node.items, path.slice(0, -1), located.list) },
      },
    ],
    next: { nodeId, slot: `item:${nextPath.join('.')}`, caret },
  };
}

export function toggleChecked(items: readonly ListItem[], path: number[]): ListItem[] | null {
  const located = locateItem(items, path);
  if (!located) return null;
  const item = located.item;
  const next =
    typeof item === 'string' ? { text: item, checked: true } : { ...item, checked: !item.checked };
  located.list.splice(located.index, 1, next);
  return writeChildList(items, path.slice(0, -1), located.list);
}

export function insertTableRow(
  rows: readonly (readonly string[])[],
  atRow: number,
  where: 'above' | 'below',
): string[][] {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const blank = Array.from({ length: width }, () => '');
  const next = rows.map((row) => [...row]);
  const index = where === 'above' ? atRow : atRow + 1;
  next.splice(Math.max(0, Math.min(index, next.length)), 0, blank);
  return next;
}

export function deleteTableRow(
  rows: readonly (readonly string[])[],
  targetRow: number,
): string[][] | null {
  if (rows.length <= 1) return null;
  if (targetRow < 0 || targetRow >= rows.length) return null;
  return rows.filter((_, index) => index !== targetRow).map((row) => [...row]);
}

export function insertTableColumn(
  rows: readonly (readonly string[])[],
  atCol: number,
  where: 'left' | 'right',
): string[][] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const index = where === 'left' ? atCol : atCol + 1;
  const clamped = Math.max(0, Math.min(index, width));
  return rows.map((row) => {
    const next = [...row];
    next.splice(clamped, 0, '');
    return next;
  });
}

export function deleteTableColumn(
  rows: readonly (readonly string[])[],
  targetCol: number,
): string[][] | null {
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (width <= 1) return null;
  if (targetCol < 0 || targetCol >= width) return null;
  return rows.map((row) => row.filter((_, index) => index !== targetCol));
}

function appendEditableSlots(
  slots: { nodeId: string; slot: SlotKey }[],
  nodes: readonly LoomaNode[],
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'heading':
      case 'paragraph':
      case 'callout':
      case 'quote':
        slots.push({ nodeId: node.id, slot: 'text' });
        break;
      case 'code':
      case 'math':
        slots.push({ nodeId: node.id, slot: 'code' });
        break;
      case 'stat':
        slots.push({ nodeId: node.id, slot: 'stat:value' });
        slots.push({ nodeId: node.id, slot: 'stat:label' });
        slots.push({ nodeId: node.id, slot: 'stat:detail' });
        break;
      case 'list':
        appendListSlots(slots, node.id, node.items, []);
        break;
      case 'table':
        node.rows.forEach((row, rowIndex) => {
          row.forEach((_, colIndex) => {
            slots.push({ nodeId: node.id, slot: `cell:${rowIndex}:${colIndex}` });
          });
        });
        break;
      case 'stack':
      case 'grid':
      case 'steps':
        appendEditableSlots(slots, node.children);
        break;
      case 'columns':
        for (const column of node.children) appendEditableSlots(slots, column);
        break;
      default:
        break;
    }
  }
}

function appendListSlots(
  slots: { nodeId: string; slot: SlotKey }[],
  nodeId: string,
  items: readonly ListItem[],
  path: number[],
): void {
  items.forEach((item, index) => {
    const next = [...path, index];
    slots.push({ nodeId, slot: `item:${next.join('.')}` });
    if (typeof item !== 'string' && item.children) {
      appendListSlots(slots, nodeId, item.children, next);
    }
  });
}

/** Previous or next editable slot in the same card, in depth-first order. */
export function adjacentTextSlot(
  doc: LoomaDocument,
  nodeId: string,
  slot: SlotKey,
  direction: 'prev' | 'next',
): EditingState | null {
  const found = findNode(doc, nodeId);
  if (!found) return null;
  const card = findCard(doc, found.cardId);
  if (!card) return null;
  const slots: { nodeId: string; slot: SlotKey }[] = [];
  appendEditableSlots(slots, card.card.body);
  const index = slots.findIndex((entry) => entry.nodeId === nodeId && entry.slot === slot);
  if (index < 0) return null;
  const neighbor = slots[direction === 'next' ? index + 1 : index - 1];
  if (!neighbor) return null;
  return {
    nodeId: neighbor.nodeId,
    slot: neighbor.slot,
    caret: direction === 'next' ? 'start' : 'end',
  };
}

export function moveCell(
  doc: LoomaDocument,
  nodeId: string,
  row: number,
  col: number,
  delta: 1 | -1,
): StructureResult | null {
  const found = findNode(doc, nodeId);
  if (!found || found.node.type !== 'table') return null;
  const rows = found.node.rows;
  const line = rows[row];
  if (!line || line[col] === undefined) return null;
  let nextRow = row;
  let nextCol = col + delta;
  if (delta === 1 && nextCol >= line.length) {
    nextRow += 1;
    nextCol = 0;
  }
  if (delta === -1 && nextCol < 0) {
    nextRow -= 1;
    nextCol = (rows[nextRow]?.length ?? 0) - 1;
  }
  if (nextRow < 0 || nextRow >= rows.length || nextCol < 0) return null;
  if (rows[nextRow]?.[nextCol] === undefined) return null;
  return {
    commands: [],
    next: { nodeId, slot: `cell:${nextRow}:${nextCol}`, caret: 'start' },
  };
}
