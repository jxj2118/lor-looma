import { findCard, findNode } from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import type { EditorSelection } from './viewState';

const EMPTY: EditorSelection = { cardId: null, nodeIds: [] };

function siblings(doc: LoomaDocument, nodeId: string): LoomaNode[] | null {
  const found = findNode(doc, nodeId);
  if (!found) return null;
  if (found.parentId === found.cardId) {
    return findCard(doc, found.cardId)?.card.body ?? null;
  }
  const parent = findNode(doc, found.parentId);
  if (!parent) return null;
  if (parent.node.type === 'columns') {
    if (found.slot === null) return null;
    return parent.node.children[found.slot] ?? null;
  }
  if (parent.node.type === 'stack' || parent.node.type === 'grid') return parent.node.children;
  return null;
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

  const list = siblings(doc, nodeId);
  if (!list) return single;
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
