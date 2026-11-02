import { findNode, normalizeInline } from '@lor-looma/core';
import type { ListItem, LoomaNode, LoomaStore } from '@lor-looma/core';
import { parseSlotKey } from '@lor-looma/viewer';
import type { SlotKey } from '@lor-looma/viewer';
import type { EditorMode } from './markdown';

const TEXT_TYPES = new Set([
  'heading',
  'paragraph',
  'list',
  'table',
  'callout',
  'quote',
  'code',
  'stat',
  'math',
]);

export function isTextNodeType(type: string): boolean {
  return TEXT_TYPES.has(type);
}

export function defaultSlot(node: LoomaNode): SlotKey | null {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
    case 'quote':
      return 'text';
    case 'list':
      return 'item:0';
    case 'table':
      return 'cell:0:0';
    case 'code':
    case 'math':
      return 'code';
    case 'stat':
      return 'stat:value';
    default:
      return null;
  }
}

export function slotMode(node: LoomaNode, slot: SlotKey): EditorMode | 'code' {
  if (node.type === 'math' && slot === 'code') return 'code';
  if (node.type === 'code') return 'code';
  if (
    node.type === 'stat' &&
    (slot === 'stat:value' || slot === 'stat:label' || slot === 'stat:detail')
  ) {
    return 'single';
  }
  if (node.type === 'stat') return 'single';
  if (node.type === 'callout' || node.type === 'quote') return 'multi';
  return 'single';
}

function itemText(item: ListItem): string {
  return typeof item === 'string' ? item : item.text;
}

function readItem(items: readonly ListItem[], path: readonly number[]): string | undefined {
  let list = items;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth];
    if (index === undefined) return undefined;
    const item = list[index];
    if (item === undefined) return undefined;
    if (depth === path.length - 1) return itemText(item);
    if (typeof item === 'string' || !item.children) return undefined;
    list = item.children;
  }
  return undefined;
}

function writeItem(
  items: readonly ListItem[],
  path: readonly number[],
  text: string,
): ListItem[] | null {
  const index = path[0];
  if (index === undefined || items[index] === undefined) return null;
  if (path.length === 1) {
    return items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return typeof item === 'string' ? text : { ...item, text };
    });
  }
  const item = items[index];
  if (typeof item === 'string' || !item.children) return null;
  const children = writeItem(item.children, path.slice(1), text);
  if (!children) return null;
  return items.map((entry, itemIndex) => (itemIndex === index ? { ...item, children } : entry));
}

export function readSlot(node: LoomaNode, slot: SlotKey): string | undefined {
  const parsed = parseSlotKey(slot);
  if (!parsed) return undefined;
  switch (parsed.kind) {
    case 'text':
      if (
        node.type === 'heading' ||
        node.type === 'paragraph' ||
        node.type === 'callout' ||
        node.type === 'quote'
      ) {
        return node.text;
      }
      return undefined;
    case 'code':
      if (node.type === 'code') return node.code;
      if (node.type === 'math') return node.tex;
      return undefined;
    case 'item':
      return node.type === 'list' ? readItem(node.items, parsed.path) : undefined;
    case 'cell':
      return node.type === 'table' ? node.rows[parsed.row]?.[parsed.col] : undefined;
    case 'stat':
      if (node.type !== 'stat') return undefined;
      if (parsed.field === 'value') return node.value;
      if (parsed.field === 'label') return node.label;
      return node.detail ?? '';
    default: {
      const unreachable: never = parsed;
      return unreachable;
    }
  }
}

export function slotPatch(
  node: LoomaNode,
  slot: SlotKey,
  text: string,
): Record<string, unknown> | null {
  const parsed = parseSlotKey(slot);
  if (!parsed) return null;
  switch (parsed.kind) {
    case 'text':
      if (
        node.type === 'heading' ||
        node.type === 'paragraph' ||
        node.type === 'callout' ||
        node.type === 'quote'
      ) {
        return { text };
      }
      return null;
    case 'code':
      if (node.type === 'code') return { code: text };
      if (node.type === 'math') return { tex: text };
      return null;
    case 'item': {
      if (node.type !== 'list') return null;
      const items = writeItem(node.items, parsed.path, text);
      return items ? { items } : null;
    }
    case 'cell': {
      if (node.type !== 'table') return null;
      const row = node.rows[parsed.row];
      if (!row || row[parsed.col] === undefined) return null;
      return {
        rows: node.rows.map((cells, rowIndex) =>
          rowIndex === parsed.row
            ? cells.map((cell, colIndex) => (colIndex === parsed.col ? text : cell))
            : cells,
        ),
      };
    }
    case 'stat':
      if (node.type !== 'stat') return null;
      if (parsed.field === 'value') return { value: text };
      if (parsed.field === 'label') return { label: text };
      return { detail: text === '' ? null : text };
    default: {
      const unreachable: never = parsed;
      return unreachable;
    }
  }
}

export function commitSlot(
  store: LoomaStore,
  nodeId: string,
  slot: SlotKey,
  text: string,
): boolean {
  const node = findNode(store.getDocument(), nodeId)?.node;
  if (!node) return false;
  const current = readSlot(node, slot);
  if (current === undefined) return false;
  const same =
    slotMode(node, slot) === 'code'
      ? current === text
      : normalizeInline(current) === normalizeInline(text);
  if (same) return false;
  const patch = slotPatch(node, slot, text);
  if (!patch) return false;
  const result = store.apply([{ op: 'updateNode', id: nodeId, patch }], {
    origin: 'user',
    mergeKey: `text:${nodeId}`,
    label: 'Edit text',
  });
  return result.ok;
}
