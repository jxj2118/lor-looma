import { findCard, findNode } from '@lor-looma/core';
import type { FoundNode, LoomaCommand, LoomaDocument, LoomaNode, NodeInput } from '@lor-looma/core';
import type { EditorSelection } from './viewState';

export interface DuplicatePlan {
  commands: LoomaCommand[];
  selectKind: 'nodes' | 'card';
}

function stripIds(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripIds(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  delete record.id;
  for (const child of Object.values(record)) stripIds(child);
}

function withoutIds(node: LoomaNode): NodeInput {
  const copy = JSON.parse(JSON.stringify(node)) as NodeInput;
  stripIds(copy);
  return copy;
}

export function siblingList(doc: LoomaDocument, found: FoundNode): LoomaNode[] | null {
  if (found.parentId === found.cardId) return findCard(doc, found.cardId)?.card.body ?? null;
  const parent = findNode(doc, found.parentId);
  if (!parent) return null;
  if (parent.node.type === 'columns') {
    if (found.slot === null) return null;
    return parent.node.children[found.slot] ?? null;
  }
  if (parent.node.type === 'stack' || parent.node.type === 'grid') return parent.node.children;
  return null;
}

/** Selected nodes in document order, when they share one parent list. */
export function sameList(doc: LoomaDocument, nodeIds: readonly string[]): FoundNode[] | null {
  const founds: FoundNode[] = [];
  for (const id of nodeIds) {
    const found = findNode(doc, id);
    if (!found) return null;
    founds.push(found);
  }
  founds.sort((left, right) => left.index - right.index);
  const first = founds[0];
  if (!first) return null;
  for (const found of founds) {
    if (found.parentId !== first.parentId || found.slot !== first.slot) return null;
  }
  return founds;
}

function adjacent(founds: readonly FoundNode[]): boolean {
  for (let index = 1; index < founds.length; index += 1) {
    const previous = founds[index - 1];
    const current = founds[index];
    if (!previous || !current || current.index !== previous.index + 1) return false;
  }
  return true;
}

export function duplicateSelection(
  doc: LoomaDocument,
  selection: EditorSelection,
): DuplicatePlan | null {
  if (selection.nodeIds.length > 0) {
    const founds = sameList(doc, selection.nodeIds);
    const last = founds?.[founds.length - 1];
    if (!founds || !last) return null;
    const commands: LoomaCommand[] = [...founds].reverse().map((found) => ({
      op: 'insertNode',
      node: withoutIds(found.node),
      at: { after: last.node.id },
    }));
    return { commands, selectKind: 'nodes' };
  }
  if (selection.cardId && findCard(doc, selection.cardId)) {
    return { commands: [{ op: 'duplicateCard', id: selection.cardId }], selectKind: 'card' };
  }
  return null;
}

export function moveSelection(
  doc: LoomaDocument,
  selection: EditorSelection,
  direction: 'up' | 'down',
): LoomaCommand[] | null {
  if (selection.nodeIds.length > 0) {
    const founds = sameList(doc, selection.nodeIds);
    if (!founds || !adjacent(founds)) return null;
    const list = siblingList(doc, founds[0]!);
    if (!list) return null;
    if (direction === 'up') {
      const first = founds[0]!;
      if (first.index <= 0) return null;
      const previous = list[first.index - 1]!;
      return founds.map((found) => ({
        op: 'moveNode',
        id: found.node.id,
        to: { before: previous.id },
      }));
    }
    const last = founds[founds.length - 1]!;
    if (last.index >= list.length - 1) return null;
    const next = list[last.index + 1]!;
    return [...founds].reverse().map((found) => ({
      op: 'moveNode',
      id: found.node.id,
      to: { after: next.id },
    }));
  }
  if (!selection.cardId) return null;
  const index = doc.cards.findIndex((card) => card.id === selection.cardId);
  if (index < 0) return null;
  if (direction === 'up') {
    if (index === 0) return null;
    return [{ op: 'moveCard', id: selection.cardId, to: { index: index - 1 } }];
  }
  if (index >= doc.cards.length - 1) return null;
  return [{ op: 'moveCard', id: selection.cardId, to: { index: index + 1 } }];
}

/** Top-level ids created by a duplicate, in their new document order. */
export function duplicatedNodeIds(doc: LoomaDocument, createdIds: readonly string[]): string[] {
  const created = new Set(createdIds);
  return createdIds
    .filter((id) => {
      const found = findNode(doc, id);
      return found !== null && !created.has(found.parentId);
    })
    .sort((left, right) => (findNode(doc, left)?.index ?? 0) - (findNode(doc, right)?.index ?? 0));
}
