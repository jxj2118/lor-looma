import { MAX_COLUMNS, MIN_COLUMNS } from '../../constants';
import { createId, isValidId } from '../../ids';
import { zodIssuesToParseIssues } from '../../parse/issues';
import { cloneJson } from '../../parse/repair';
import type { LoomaNode } from '../../schema';
import { LoomaNodeSchema } from '../../schema';
import type { FoundNode } from '../../tree/tree';
import { childArrayOf, findCard, findNode, isContainer } from '../../tree/tree';
import { prefixed, type CommandContext } from '../context';
import type { ParsedLoomaCommand } from '../schema';

type CommandOf<Op extends ParsedLoomaCommand['op']> = Extract<ParsedLoomaCommand, { op: Op }>;

const ID_IN_USE = (id: string) => `id "${id}" is already in use; omit it to let Looma generate one`;

function article(type: string): string {
  return /^[aeiou]/.test(type) ? 'an' : 'a';
}

function childList(ctx: CommandContext, parentId: string, slot: number | null): LoomaNode[] {
  const card = findCard(ctx.draft, parentId);
  if (card) return card.card.body;
  const parent = findNode(ctx.draft, parentId);
  if (!parent || !isContainer(parent.node)) ctx.fail('id', `parent "${parentId}" does not exist`);
  const list = childArrayOf(parent.node, slot);
  if (!list) ctx.fail('id', `parent "${parentId}" has no child list`);
  return list;
}

function place(found: FoundNode): string {
  return found.slot === null ? found.parentId : `${found.parentId} slot ${found.slot}`;
}

function requireNode(ctx: CommandContext, id: string): FoundNode {
  const found = findNode(ctx.draft, id);
  if (!found) ctx.fail('id', `node "${id}" does not exist`);
  return found;
}

function requireColumns(
  ctx: CommandContext,
  id: string,
): FoundNode & { node: Extract<LoomaNode, { type: 'columns' }> } {
  const found = requireNode(ctx, id);
  if (found.node.type === 'columns')
    return found as FoundNode & { node: Extract<LoomaNode, { type: 'columns' }> };
  if (isContainer(found.node)) {
    ctx.fail('id', `"${id}" is a ${found.node.type}, not a columns container`);
  }
  ctx.fail(
    'id',
    `"${id}" is ${article(found.node.type)} ${found.node.type} block, not a columns container`,
  );
}

export function wrapNodes(ctx: CommandContext, command: CommandOf<'wrapNodes'>): void {
  const seen = new Set<string>();
  for (const id of command.ids) {
    if (seen.has(id)) ctx.fail('ids', `"${id}" is listed more than once`);
    seen.add(id);
  }

  const founds = command.ids.map((id) => {
    const found = findNode(ctx.draft, id);
    if (!found) ctx.fail('ids', `node "${id}" does not exist`);
    return found;
  });
  const first = founds[0];
  if (!first) ctx.fail('ids', 'wrapNodes needs at least one node');
  for (const found of founds) {
    if (found.parentId !== first.parentId || found.slot !== first.slot) {
      ctx.fail(
        'ids',
        `all nodes must share the same parent (${first.node.id} is in ${place(first)}, ${found.node.id} is in ${place(found)})`,
      );
    }
  }

  const sorted = [...founds].sort((left, right) => left.index - right.index);
  const list = childList(ctx, first.parentId, first.slot);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current || current.index === previous.index + 1) continue;
    const between = list[previous.index + 1];
    ctx.fail('ids', `nodes must be adjacent; ${between?.id ?? 'another node'} sits between them`);
  }

  const props = { ...command.container } as Record<string, unknown>;
  delete props.children;
  if (command.container.type === 'columns') {
    const count = sorted.length;
    if (count < MIN_COLUMNS || count > MAX_COLUMNS) {
      ctx.fail(
        'ids',
        `columns need 2-4 nodes, one per column; received ${count}. Use stack or grid, or wrap fewer nodes`,
      );
    }
    const provided = props.widths;
    if (provided !== undefined) {
      const received = Array.isArray(provided) ? provided.length : 'a non-array';
      if (!Array.isArray(provided) || provided.length !== count) {
        ctx.fail(
          'container.widths',
          `widths needs ${count} entries, one per column; received ${received}`,
        );
      }
    } else {
      props.widths = sorted.map(() => 1);
    }
    props.children = sorted.map((found) => [cloneJson(found.node)]);
  } else {
    props.children = sorted.map((found) => cloneJson(found.node));
  }

  let id = typeof props.id === 'string' ? props.id : undefined;
  if (id === undefined) id = createId('container', ctx.taken);
  if (!isValidId(id)) {
    ctx.fail(
      'container.id',
      'must be a valid id (letter first, then letters, digits, "_" or "-", max 64 chars)',
    );
  }
  if (ctx.taken.has(id)) ctx.fail('container.id', ID_IN_USE(id));
  props.id = id;
  ctx.taken.add(id);
  ctx.createdIds.push(id);

  const parsed = LoomaNodeSchema.safeParse(props);
  if (!parsed.success) {
    const issue = zodIssuesToParseIssues(parsed.error.issues, props)[0];
    if (!issue) ctx.fail('container', 'container is invalid');
    ctx.fail(prefixed('container', issue.path), issue.message);
  }
  if (!isContainer(parsed.data)) ctx.fail('container.type', 'wrapNodes needs a container');
  const start = sorted[0]?.index ?? 0;
  list.splice(start, sorted.length, parsed.data);
  ctx.touch(parsed.data.id);
}

export function unwrapNode(ctx: CommandContext, command: CommandOf<'unwrapNode'>): void {
  const found = requireNode(ctx, command.id);
  if (!isContainer(found.node)) {
    ctx.fail(
      'id',
      `"${command.id}" is ${article(found.node.type)} ${found.node.type} block, not a container`,
    );
  }
  const lifted =
    found.node.type === 'columns'
      ? found.node.children.flat().map((node) => cloneJson(node))
      : found.node.children.map((node) => cloneJson(node));
  const list = childList(ctx, found.parentId, found.slot);
  if (!ctx.removedIds.includes(command.id)) ctx.removedIds.push(command.id);
  ctx.taken.delete(command.id);
  list.splice(found.index, 1, ...lifted);
  for (const node of lifted) ctx.touch(node.id);
}

export function insertColumn(ctx: CommandContext, command: CommandOf<'insertColumn'>): void {
  const found = requireColumns(ctx, command.id);
  const count = found.node.children.length;
  if (count >= MAX_COLUMNS) {
    ctx.fail('id', `columns "${command.id}" already has ${MAX_COLUMNS} columns (maximum)`);
  }
  const index = command.index ?? count;
  if (index > count) {
    ctx.fail(
      'index',
      `index ${index} is out of range; columns "${command.id}" has ${count} columns (use 0-${count} to insert)`,
    );
  }
  found.node.children.splice(index, 0, []);
  found.node.widths.splice(index, 0, command.width ?? 1);
  ctx.touch(command.id);
}

export function deleteColumn(ctx: CommandContext, command: CommandOf<'deleteColumn'>): void {
  const found = requireColumns(ctx, command.id);
  const count = found.node.children.length;
  if (count <= MIN_COLUMNS) {
    ctx.fail(
      'id',
      `columns "${command.id}" has only ${count} columns; use unwrapNode to remove the layout instead`,
    );
  }
  if (command.index >= count) {
    ctx.fail(
      'index',
      `index ${command.index} is out of range; columns "${command.id}" has ${count} columns (slot 0-${count - 1})`,
    );
  }
  if (command.moveNodesTo !== undefined) {
    if (command.moveNodesTo === command.index) {
      ctx.fail('moveNodesTo', `moveNodesTo cannot be ${command.index}, the column being deleted`);
    }
    if (command.moveNodesTo < 0 || command.moveNodesTo >= count) {
      ctx.fail(
        'moveNodesTo',
        `moveNodesTo ${command.moveNodesTo} is out of range; columns "${command.id}" has ${count} columns (0-${count - 1})`,
      );
    }
    const target = found.node.children[command.moveNodesTo];
    const source = found.node.children[command.index];
    if (!target || !source)
      ctx.fail('index', `columns "${command.id}" has no column ${command.index}`);
    target.push(...source);
  } else {
    const source = found.node.children[command.index] ?? [];
    for (const node of source) ctx.remove(node.id);
  }
  found.node.children.splice(command.index, 1);
  found.node.widths.splice(command.index, 1);
  ctx.touch(command.id);
}
