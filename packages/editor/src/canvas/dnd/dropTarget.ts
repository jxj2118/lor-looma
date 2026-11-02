import { findCard, findNode, MAX_CONTAINER_DEPTH } from '@lor-looma/core';
import type { FoundNode, LoomaCommand, LoomaDocument, LoomaNode } from '@lor-looma/core';

export type DropTarget =
  | { kind: 'before'; nodeId: string }
  | { kind: 'after'; nodeId: string }
  | { kind: 'inside'; parentId: string; slot?: number; index?: number };

interface Placement {
  parentId: string;
  slot: number | null;
  index: number;
  depth: number;
}

export function subtreeContainerDepth(node: LoomaNode): number {
  if (
    node.type !== 'stack' &&
    node.type !== 'columns' &&
    node.type !== 'grid' &&
    node.type !== 'steps'
  ) {
    return 0;
  }
  const children = node.type === 'columns' ? node.children.flat() : node.children;
  let nested = 0;
  for (const child of children) nested = Math.max(nested, subtreeContainerDepth(child));
  return 1 + nested;
}

function containsId(node: LoomaNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.type === 'columns') {
    return node.children.some((column) => column.some((child) => containsId(child, id)));
  }
  if (node.type === 'stack' || node.type === 'grid' || node.type === 'steps') {
    return node.children.some((child) => containsId(child, id));
  }
  return false;
}

function placement(doc: LoomaDocument, target: DropTarget): Placement | null {
  if (target.kind === 'before' || target.kind === 'after') {
    const found = findNode(doc, target.nodeId);
    if (!found) return null;
    return {
      parentId: found.parentId,
      slot: found.slot,
      index: target.kind === 'before' ? found.index : found.index + 1,
      depth: found.depth,
    };
  }

  const card = findCard(doc, target.parentId);
  if (card) {
    if (target.slot !== undefined) return null;
    const index = target.index ?? card.card.body.length;
    if (index < 0 || index > card.card.body.length) return null;
    return { parentId: card.card.id, slot: null, index, depth: 0 };
  }

  const parent = findNode(doc, target.parentId);
  if (!parent) return null;
  if (parent.node.type === 'columns') {
    if (target.slot === undefined) return null;
    const column = parent.node.children[target.slot];
    if (!column) return null;
    const index = target.index ?? column.length;
    if (index < 0 || index > column.length) return null;
    return {
      parentId: parent.node.id,
      slot: target.slot,
      index,
      depth: parent.depth + 1,
    };
  }
  if (parent.node.type !== 'stack' && parent.node.type !== 'grid' && parent.node.type !== 'steps') {
    return null;
  }
  if (target.slot !== undefined) return null;
  const index = target.index ?? parent.node.children.length;
  if (index < 0 || index > parent.node.children.length) return null;
  return { parentId: parent.node.id, slot: null, index, depth: parent.depth + 1 };
}

export function canDropNode(doc: LoomaDocument, draggedId: string, target: DropTarget): boolean {
  const dragged = findNode(doc, draggedId);
  if (!dragged) return false;
  if (target.kind === 'before' || target.kind === 'after') {
    if (target.nodeId === draggedId || containsId(dragged.node, target.nodeId)) return false;
  } else if (target.parentId === draggedId || containsId(dragged.node, target.parentId)) {
    return false;
  }
  const dest = placement(doc, target);
  if (!dest) return false;
  return dest.depth + subtreeContainerDepth(dragged.node) <= MAX_CONTAINER_DEPTH;
}

function adjustedIndex(dragged: FoundNode, dest: Placement): number {
  const sameList = dragged.parentId === dest.parentId && dragged.slot === dest.slot;
  if (sameList && dragged.index < dest.index) return dest.index - 1;
  return dest.index;
}

export function buildMoveNodeCommand(
  doc: LoomaDocument,
  draggedId: string,
  target: DropTarget,
): LoomaCommand | null {
  const dragged = findNode(doc, draggedId);
  const dest = placement(doc, target);
  if (!dragged || !dest || !canDropNode(doc, draggedId, target)) return null;
  if (
    adjustedIndex(dragged, dest) === dragged.index &&
    dragged.parentId === dest.parentId &&
    dragged.slot === dest.slot
  ) {
    return null;
  }
  if (target.kind === 'before')
    return { op: 'moveNode', id: draggedId, to: { before: target.nodeId } };
  if (target.kind === 'after')
    return { op: 'moveNode', id: draggedId, to: { after: target.nodeId } };
  const to: { parent: string; slot?: number; index: number } = {
    parent: dest.parentId,
    index: adjustedIndex(dragged, dest),
  };
  if (dest.slot !== null) to.slot = dest.slot;
  return { op: 'moveNode', id: draggedId, to };
}

export function parseDropId(id: string): DropTarget | null {
  const [kind, parentOrNode, slotText] = id.split(':');
  if ((kind === 'before' || kind === 'after') && parentOrNode) {
    return { kind, nodeId: parentOrNode };
  }
  if (kind !== 'inside' || !parentOrNode) return null;
  if (slotText === undefined) return { kind: 'inside', parentId: parentOrNode, index: 0 };
  const slot = Number(slotText);
  if (!Number.isInteger(slot) || slot < 0) return null;
  return { kind: 'inside', parentId: parentOrNode, slot, index: 0 };
}
