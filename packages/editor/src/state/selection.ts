import { findCard, findNode } from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import type { EditorSelection } from './viewState';

const EMPTY: EditorSelection = { cardId: null, nodeIds: [] };

function siblings(doc: LoomaDocument, nodeId: string): LoomaNode[] | null {
  const found = findNode(doc, nodeId);
  if (!found || found.parentId === found.cardId) {
    return found ? (findCard(doc, found.cardId)?.card.body ?? null) : null;
  }
  const parent = findNode(doc, found.parentId);
  if (parent?.node.type === 'columns') {
    return parent.node.children[found.slot ?? 0] ?? null;
  }
  return parent?.node.type === 'stack' || parent?.node.type === 'grid'
    ? parent.node.children
    : null;
}

export function selectNode(
  doc: LoomaDocument,
  current: EditorSelection,
  nodeId: string,
  extend: boolean,
): EditorSelection {
  const found = findNode(doc, nodeId);
  if (!found) return current;
  const single: EditorSelection = { cardId: found.cardId, nodeIds: [nodeId] };
  if (!extend) return single;

  const anchorId = current.nodeIds[0];
  if (!anchorId) return single;
  const anchor = findNode(doc, anchorId);
  if (!anchor || anchor.parentId !== found.parentId || anchor.slot !== found.slot) return single;

  const list = siblings(doc, nodeId) ?? [];
  const start = Math.min(anchor.index, found.index);
  const end = Math.max(anchor.index, found.index);
  return {
    cardId: found.cardId,
    nodeIds: list.slice(start, end + 1).map((node) => node.id),
  };
}

export function selectCard(cardId: string): EditorSelection {
  return { cardId, nodeIds: [] };
}

export function pruneSelection(doc: LoomaDocument, selection: EditorSelection): EditorSelection {
  const cardId = selection.cardId && findCard(doc, selection.cardId) ? selection.cardId : null;
  const nodeIds = selection.nodeIds.filter((id) => findNode(doc, id) !== null);
  if (cardId === selection.cardId && nodeIds.length === selection.nodeIds.length) {
    const sameNodes = nodeIds.every((id, index) => id === selection.nodeIds[index]);
    if (sameNodes) return selection;
  }
  return { cardId, nodeIds };
}

/** Selection to keep after deleting the current selection. `doc` is the document before the delete. */
export function selectionAfterDelete(
  doc: LoomaDocument,
  selection: EditorSelection,
): EditorSelection {
  if (selection.nodeIds.length === 0) {
    if (!selection.cardId) return EMPTY;
    const index = doc.cards.findIndex((card) => card.id === selection.cardId);
    const neighbor = doc.cards[index + 1] ?? doc.cards[index - 1];
    return neighbor ? selectCard(neighbor.id) : EMPTY;
  }
  const located = selection.nodeIds
    .map((id) => findNode(doc, id))
    .filter((found) => found !== null);
  const anchor = located[0];
  if (!anchor) return selection.cardId ? selectCard(selection.cardId) : EMPTY;
  const list = siblings(doc, anchor.node.id) ?? [];
  const removed = new Set(selection.nodeIds);
  const indexes = located.map((found) => found.index);
  const start = Math.min(...indexes);
  const end = Math.max(...indexes);
  const next = list.slice(end + 1).find((node) => !removed.has(node.id));
  if (next) return { cardId: anchor.cardId, nodeIds: [next.id] };
  const previous = list
    .slice(0, start)
    .reverse()
    .find((node) => !removed.has(node.id));
  if (previous) return { cardId: anchor.cardId, nodeIds: [previous.id] };
  return selectCard(anchor.cardId);
}

export function normalizeSelectIds(doc: LoomaDocument, ids: string[]): EditorSelection {
  for (const id of ids) {
    if (findCard(doc, id)) return selectCard(id);
    const node = findNode(doc, id);
    if (!node) continue;
    const nodeIds = ids.filter((candidate) => findNode(doc, candidate)?.cardId === node.cardId);
    return { cardId: node.cardId, nodeIds };
  }
  return EMPTY;
}
