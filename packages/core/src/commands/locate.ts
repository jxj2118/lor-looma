import type { LoomaNode } from '../schema';
import { findCard, findNode, isContainer } from '../tree/tree';
import type { CommandContext } from './context';
import type { CardLocation, NodeLocation } from './schema';

export interface ResolvedNodeLocation {
  array: LoomaNode[];
  index: number;
  parentId: string;
  slot: number | null;
  depth: number;
}

function article(type: string): string {
  return /^[aeiou]/.test(type) ? 'an' : 'a';
}

function insertionIndex(
  ctx: CommandContext,
  index: number | undefined,
  length: number,
  path: string,
  subject: string,
): number {
  if (index === undefined) return length;
  if (index > length) {
    ctx.fail(
      `${path}.index`,
      `index ${index} is past the end; ${subject} (use 0-${length}, or omit index to append)`,
    );
  }
  return index;
}

/** Resolves a node location into the array that will receive the node and the insertion index. */
export function resolveNodeLocation(
  ctx: CommandContext,
  at: NodeLocation,
  path: string,
): ResolvedNodeLocation {
  if ('before' in at || 'after' in at) {
    const id = 'before' in at ? at.before : at.after;
    const which = 'before' in at ? 'before' : 'after';
    const found = findNode(ctx.draft, id);
    if (!found) {
      const card = findCard(ctx.draft, id);
      if (card) {
        ctx.fail(
          `${path}.${which}`,
          `node "${id}" does not exist; "${id}" is a card, so use { parent: "${id}" } to insert into it`,
        );
      }
      ctx.fail(`${path}.${which}`, `node "${id}" does not exist`);
    }
    const index = which === 'before' ? found.index : found.index + 1;
    return {
      array: foundArray(ctx, found.parentId, found.slot, path),
      index,
      parentId: found.parentId,
      slot: found.slot,
      depth: found.depth,
    };
  }

  const parentId = at.parent;
  const card = findCard(ctx.draft, parentId);
  if (card) {
    if (at.slot !== undefined) {
      ctx.fail(`${path}.slot`, `"${parentId}" is a card and does not use slot; remove slot`);
    }
    return {
      array: card.card.body,
      index: insertionIndex(
        ctx,
        at.index,
        card.card.body.length,
        path,
        `this list has ${card.card.body.length} items`,
      ),
      parentId,
      slot: null,
      depth: 0,
    };
  }

  const found = findNode(ctx.draft, parentId);
  if (!found) ctx.fail(`${path}.parent`, `"${parentId}" does not exist`);
  if (!isContainer(found.node)) {
    ctx.fail(
      `${path}.parent`,
      `"${parentId}" is ${article(found.node.type)} ${found.node.type} block and cannot contain other nodes`,
    );
  }

  if (found.node.type === 'columns') {
    const count = found.node.children.length;
    if (at.slot === undefined) {
      ctx.fail(`${path}.slot`, `columns "${parentId}" needs a slot (0-${count - 1})`);
    }
    if (at.slot < 0 || at.slot >= count) {
      ctx.fail(
        `${path}.slot`,
        `columns "${parentId}" has ${count} columns (slot 0-${count - 1}); received ${at.slot}`,
      );
    }
    const array = found.node.children[at.slot];
    if (!array) ctx.fail(`${path}.slot`, `columns "${parentId}" has no column ${at.slot}`);
    return {
      array,
      index: insertionIndex(
        ctx,
        at.index,
        array.length,
        path,
        `this list has ${array.length} items`,
      ),
      parentId,
      slot: at.slot,
      depth: found.depth + 1,
    };
  }

  if (at.slot !== undefined) {
    ctx.fail(
      `${path}.slot`,
      `"${parentId}" is a ${found.node.type} and does not use slot; remove slot`,
    );
  }
  return {
    array: found.node.children,
    index: insertionIndex(
      ctx,
      at.index,
      found.node.children.length,
      path,
      `this list has ${found.node.children.length} items`,
    ),
    parentId,
    slot: null,
    depth: found.depth + 1,
  };
}

function foundArray(
  ctx: CommandContext,
  parentId: string,
  slot: number | null,
  path: string,
): LoomaNode[] {
  const card = findCard(ctx.draft, parentId);
  if (card) return card.card.body;
  const found = findNode(ctx.draft, parentId);
  if (!found || !isContainer(found.node)) {
    ctx.fail(`${path}`, `parent "${parentId}" does not exist`);
  }
  if (found.node.type === 'columns') {
    if (slot === null) ctx.fail(`${path}.slot`, `columns "${parentId}" needs a slot`);
    const array = found.node.children[slot];
    if (!array) ctx.fail(`${path}.slot`, `columns "${parentId}" has no column ${slot}`);
    return array;
  }
  return found.node.children;
}

/** Insertion index for a card. Omitting `at` appends. */
export function resolveCardLocation(
  ctx: CommandContext,
  at: CardLocation | undefined,
  path: string,
): number {
  const cards = ctx.draft.cards;
  if (at === undefined) return cards.length;
  if ('index' in at) {
    return insertionIndex(
      ctx,
      at.index,
      cards.length,
      path,
      `the document has ${cards.length} cards`,
    );
  }
  const id = 'before' in at ? at.before : at.after;
  const which = 'before' in at ? 'before' : 'after';
  const card = findCard(ctx.draft, id);
  if (!card) {
    if (findNode(ctx.draft, id)) ctx.fail(`${path}.${which}`, `"${id}" is a node, not a card`);
    ctx.fail(`${path}.${which}`, `card "${id}" does not exist`);
  }
  return which === 'before' ? card.index : card.index + 1;
}
