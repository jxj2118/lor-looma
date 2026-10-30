import { createId, findCard, findNode, MAX_LIST_DEPTH } from '@lor-looma/core';
import type { ListItem, LoomaCommand, LoomaDocument, LoomaNode } from '@lor-looma/core';
import type { SlotKey } from '@lor-looma/viewer';
import { defaultSlot, isTextNodeType } from './slots';

export interface StructureResult {
  commands: LoomaCommand[];
  next: { nodeId: string; slot: SlotKey; caret: 'start' | 'end' } | null;
}

function siblingsOf(doc: LoomaDocument, nodeId: string): LoomaNode[] {
  const found = findNode(doc, nodeId);
  if (!found || found.parentId === found.cardId) {
    return found ? (findCard(doc, found.cardId)?.card.body ?? []) : [];
  }
  const parent = findNode(doc, found.parentId);
  if (parent?.node.type === 'columns') {
    return parent.node.children[found.slot ?? 0] ?? [];
  }
  return parent?.node.type === 'stack' || parent?.node.type === 'grid' ? parent.node.children : [];
}

function locateItem(
  items: readonly ListItem[],
  path: readonly number[],
): { list: ListItem[]; index: number; item: ListItem } | null {
  if (path.length === 0) return null;
  let list = items;
  for (let depth = 0; depth < path.length - 1; depth += 1) {
    const index = path[depth] ?? -1;
    const item = list[index];
    if (item === undefined || typeof item === 'string' || !item.children) return null;
    list = item.children;
  }
  const index = path[path.length - 1] ?? -1;
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
  const parentIndex = path[path.length - 2] ?? 0;
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
  if (
    nextRow < 0 ||
    nextRow >= rows.length ||
    nextCol < 0 ||
    rows[nextRow]?.[nextCol] === undefined
  ) {
    return null;
  }
  return {
    commands: [],
    next: { nodeId, slot: `cell:${nextRow}:${nextCol}`, caret: 'start' },
  };
}
