import { zodIssuesToParseIssues } from '../../parse/issues';
import { cloneJson } from '../../parse/repair';
import type { LoomaNode } from '../../schema';
import { LoomaNodeSchema } from '../../schema';
import { childArrayOf, findCard, findNode, isContainer } from '../../tree/tree';
import { failIssues, type CommandContext } from '../context';
import { resolveNodeLocation } from '../locate';
import { materializeNode } from '../materialize';
import type { NodeLocation, ParsedLoomaCommand } from '../schema';

type CommandOf<Op extends ParsedLoomaCommand['op']> = Extract<ParsedLoomaCommand, { op: Op }>;

function subtreeIds(node: LoomaNode): string[] {
  const ids = [node.id];
  if (node.type === 'columns') {
    for (const column of node.children) {
      for (const child of column) ids.push(...subtreeIds(child));
    }
  } else if (node.type === 'stack' || node.type === 'grid' || node.type === 'steps') {
    for (const child of node.children) ids.push(...subtreeIds(child));
  }
  return ids;
}

function hasDescendant(node: LoomaNode, id: string): boolean {
  if (node.type === 'columns') {
    return node.children.some((column) =>
      column.some((child) => child.id === id || hasDescendant(child, id)),
    );
  }
  if (node.type === 'stack' || node.type === 'grid' || node.type === 'steps') {
    return node.children.some((child) => child.id === id || hasDescendant(child, id));
  }
  return false;
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

function locationTarget(at: NodeLocation): { field: 'before' | 'after' | 'parent'; id: string } {
  if ('before' in at) return { field: 'before', id: at.before };
  if ('after' in at) return { field: 'after', id: at.after };
  return { field: 'parent', id: at.parent };
}

function patchPath(path: string): string {
  if (path === '$' || path.length === 0) return 'patch';
  return `patch.${path}`;
}

export function insertNode(ctx: CommandContext, command: CommandOf<'insertNode'>): void {
  const node = materializeNode(command.node, ctx.taken, ctx.createdIds);
  if (!node.ok) failIssues(ctx, 'node', node.issues);
  const dest = resolveNodeLocation(ctx, command.at, 'at');
  dest.array.splice(dest.index, 0, node.value);
  ctx.touch(node.value.id);
}

export function updateNode(ctx: CommandContext, command: CommandOf<'updateNode'>): void {
  const found = findNode(ctx.draft, command.id);
  if (!found) ctx.fail('id', `node "${command.id}" does not exist`);
  if (found.node.type === 'unknown') {
    ctx.fail('id', `"${command.id}" is an unsupported block; it can only be moved or deleted`);
  }
  if (Object.hasOwn(command.patch, 'id')) ctx.fail('patch.id', 'ids cannot be changed');
  if (Object.hasOwn(command.patch, 'type')) {
    ctx.fail('patch.type', 'cannot be changed with updateNode; use replaceNode');
  }
  if (Object.hasOwn(command.patch, 'children')) {
    ctx.fail(
      'patch.children',
      'cannot be changed with updateNode; use insertNode, moveNode or deleteNode',
    );
  }
  if (
    found.node.type === 'columns' &&
    Object.hasOwn(command.patch, 'widths') &&
    command.patch.widths !== null
  ) {
    const widths = command.patch.widths;
    const count = found.node.children.length;
    if (!Array.isArray(widths) || widths.length !== count) {
      ctx.fail(
        'patch.widths',
        `columns "${command.id}" has ${count} columns, so widths needs ${count} entries; use insertColumn or deleteColumn to change the number of columns`,
      );
    }
  }

  const next = cloneJson(found.node) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(command.patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  const parsed = LoomaNodeSchema.safeParse(next);
  if (!parsed.success) {
    const issue = zodIssuesToParseIssues(parsed.error.issues, next)[0];
    if (!issue) ctx.fail('patch', 'patch does not match the node');
    ctx.fail(patchPath(issue.path), issue.message);
  }
  const list = childList(ctx, found.parentId, found.slot);
  list[found.index] = parsed.data;
  ctx.touch(command.id);
}

export function replaceNode(ctx: CommandContext, command: CommandOf<'replaceNode'>): void {
  const found = findNode(ctx.draft, command.id);
  if (!found) ctx.fail('id', `node "${command.id}" does not exist`);
  const input = cloneJson(command.node) as Record<string, unknown>;
  const oldIds = subtreeIds(found.node);
  for (const id of oldIds) ctx.taken.delete(id);
  if (input.id === undefined) input.id = found.node.id;

  const localCreated: string[] = [];
  const node = materializeNode(input, ctx.taken, localCreated);
  if (!node.ok) {
    for (const id of oldIds) ctx.taken.add(id);
    failIssues(ctx, 'node', node.issues);
  }

  const fresh = new Set(subtreeIds(node.value));
  for (const id of oldIds) {
    if (!fresh.has(id) && !ctx.removedIds.includes(id)) ctx.removedIds.push(id);
  }
  for (const id of localCreated) {
    if (!oldIds.includes(id)) ctx.createdIds.push(id);
  }
  const list = childList(ctx, found.parentId, found.slot);
  list[found.index] = node.value;
  ctx.touch(node.value.id);
}

export function moveNode(ctx: CommandContext, command: CommandOf<'moveNode'>): void {
  const found = findNode(ctx.draft, command.id);
  if (!found) ctx.fail('id', `node "${command.id}" does not exist`);
  const target = locationTarget(command.to);
  if ((target.field === 'before' || target.field === 'after') && target.id === command.id) {
    ctx.fail(`to.${target.field}`, `cannot move node "${command.id}" relative to itself`);
  }
  if (target.id === command.id || hasDescendant(found.node, target.id)) {
    ctx.fail(
      `to.${target.field}`,
      `cannot move node "${command.id}" into itself or its descendants`,
    );
  }

  const list = childList(ctx, found.parentId, found.slot);
  const [node] = list.splice(found.index, 1);
  if (!node) ctx.fail('id', `node "${command.id}" does not exist`);
  const dest = resolveNodeLocation(ctx, command.to, 'to');
  dest.array.splice(dest.index, 0, node);
  ctx.touch(command.id);
}

export function deleteNode(ctx: CommandContext, command: CommandOf<'deleteNode'>): void {
  const found = findNode(ctx.draft, command.id);
  if (!found) ctx.fail('id', `node "${command.id}" does not exist`);
  const list = childList(ctx, found.parentId, found.slot);
  ctx.remove(command.id);
  list.splice(found.index, 1);
}
