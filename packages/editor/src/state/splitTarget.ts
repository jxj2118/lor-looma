import { findNode } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';

/**
 * Walks from `nodeId` up to the direct child of its card body.
 * Returns that child when it is not the card's first node.
 */
export function topLevelSplitTarget(
  doc: LoomaDocument,
  nodeId: string,
): { cardId: string; topNodeId: string } | null {
  let current = findNode(doc, nodeId);
  if (!current) return null;
  while (current.parentId !== current.cardId) {
    const parent = findNode(doc, current.parentId);
    if (!parent) return null;
    current = parent;
  }
  if (current.index <= 0) return null;
  return { cardId: current.cardId, topNodeId: current.node.id };
}
