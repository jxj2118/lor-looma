import { createId, findNode } from '@lor-looma/core';
import type { LoomaCommand, LoomaDocument } from '@lor-looma/core';
import type { StructureResult } from '../text/structure';
import { defaultSlot, isTextNodeType } from '../text/slots';
import type { SlashState } from '../state/viewState';

export type InsertTarget = SlashState['target'];

interface Stamped {
  id: string;
  type: string;
  children?: Stamped[] | Stamped[][];
  [key: string]: unknown;
}

export function insertionDepth(doc: LoomaDocument, target: InsertTarget): number {
  if (target.kind === 'card') return 0;
  return findNode(doc, target.nodeId)?.depth ?? 0;
}

function stamp(value: unknown, forcedId?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => stamp(item));
  if (!value || typeof value !== 'object') return value;
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record.type !== 'string') return record;
  const container = record.type === 'columns' || record.type === 'stack' || record.type === 'grid';
  record.id = forcedId ?? createId(container ? 'container' : 'block');
  if (Array.isArray(record.children)) record.children = stamp(record.children) as unknown[];
  return record;
}

function firstEditable(node: Stamped): { nodeId: string; slot: string } | null {
  if (node.type === 'divider' || node.type === 'image') return null;
  if (isTextNodeType(node.type)) {
    const slot = defaultSlot(node as never);
    return slot ? { nodeId: node.id, slot } : null;
  }
  const children = node.children;
  if (!children) return null;
  const flat = Array.isArray(children[0])
    ? (children as Stamped[][]).flat()
    : (children as Stamped[]);
  const first = flat[0];
  return first ? firstEditable(first) : null;
}

export function buildInsert(
  doc: LoomaDocument,
  target: InsertTarget,
  template: unknown,
): StructureResult {
  const replacedId = target.kind === 'replace' ? target.nodeId : undefined;
  const node = stamp(template, replacedId) as Stamped;
  const editable = firstEditable(node);
  const cardId =
    target.kind === 'card' ? target.cardId : (findNode(doc, target.nodeId)?.cardId ?? null);
  const commands: LoomaCommand[] =
    target.kind === 'replace'
      ? [{ op: 'replaceNode', id: target.nodeId, node }]
      : [
          {
            op: 'insertNode',
            node,
            at: target.kind === 'after' ? { after: target.nodeId } : { parent: target.cardId },
          },
        ];
  return {
    commands,
    next: editable ? { nodeId: editable.nodeId, slot: editable.slot, caret: 'start' } : null,
    ...(cardId ? {} : {}),
  };
}
