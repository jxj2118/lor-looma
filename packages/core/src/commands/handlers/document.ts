import { createId } from '../../ids';
import { zodIssuesToParseIssues } from '../../parse/issues';
import type { LoomaDocument, LoomaNode } from '../../schema';
import { ThemeOverridesSchema } from '../../schema';
import { failIssues, type CommandContext } from '../context';
import { materializeAsset } from '../materialize';
import type { LoomaCommand } from '../schema';

type CommandOf<Op extends LoomaCommand['op']> = Extract<LoomaCommand, { op: Op }>;

function imagePaths(node: LoomaNode, path: string, assetId: string, paths: string[]): void {
  if (node.type === 'image' && node.assetId === assetId) paths.push(path);
  if (node.type === 'columns') {
    node.children.forEach((column, columnIndex) => {
      column.forEach((child, rowIndex) => {
        imagePaths(child, `${path}.children[${columnIndex}][${rowIndex}]`, assetId, paths);
      });
    });
    return;
  }
  if (node.type === 'stack' || node.type === 'grid' || node.type === 'steps') {
    node.children.forEach((child, index) => {
      imagePaths(child, `${path}.children[${index}]`, assetId, paths);
    });
  }
}

function assetUsages(doc: LoomaDocument, assetId: string): string[] {
  const paths: string[] = [];
  doc.cards.forEach((card, cardIndex) => {
    if (card.accent?.assetId === assetId) paths.push(`cards[${cardIndex}].accent`);
    if (card.background?.kind === 'image' && card.background.assetId === assetId) {
      paths.push(`cards[${cardIndex}].background`);
    }
    card.scene?.elements.forEach((element, elementIndex) => {
      if (element.type === 'image' && element.assetId === assetId) {
        paths.push(`cards[${cardIndex}].scene.elements[${elementIndex}]`);
      }
    });
    card.body.forEach((node, index) => {
      imagePaths(node, `cards[${cardIndex}].body[${index}]`, assetId, paths);
    });
  });
  return paths;
}

export function setTitle(ctx: CommandContext, command: CommandOf<'setTitle'>): void {
  ctx.draft.title = command.title;
}

export function setFormat(ctx: CommandContext, command: CommandOf<'setFormat'>): void {
  ctx.draft.format = command.format;
}

export function setTheme(ctx: CommandContext, command: CommandOf<'setTheme'>): void {
  if (command.preset !== undefined) ctx.draft.theme.preset = command.preset;
  if (command.overrides === undefined) return;
  const next: Record<string, unknown> = { ...(ctx.draft.theme.overrides ?? {}) };
  for (const [key, value] of Object.entries(command.overrides)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  const parsed = ThemeOverridesSchema.safeParse(next);
  if (!parsed.success) {
    const issues = zodIssuesToParseIssues(parsed.error.issues, next);
    const issue = issues[0];
    if (!issue) ctx.fail('overrides', 'overrides are invalid');
    const path = issue.path === '$' ? 'overrides' : `overrides.${issue.path}`;
    ctx.fail(path, issue.message);
  }
  if (Object.keys(parsed.data).length === 0) delete ctx.draft.theme.overrides;
  else ctx.draft.theme.overrides = parsed.data;
}

export function putAsset(ctx: CommandContext, command: CommandOf<'putAsset'>): void {
  const asset = materializeAsset(command.asset);
  if (!asset.ok) failIssues(ctx, 'asset', asset.issues);
  let id = command.id;
  if (id === undefined) {
    id = createId('asset', ctx.taken);
    ctx.taken.add(id);
    ctx.createdIds.push(id);
  } else if (!Object.hasOwn(ctx.draft.assets, id)) {
    ctx.taken.add(id);
    ctx.createdIds.push(id);
  }
  ctx.draft.assets[id] = asset.value;
}

export function removeAsset(ctx: CommandContext, command: CommandOf<'removeAsset'>): void {
  if (!Object.hasOwn(ctx.draft.assets, command.id)) {
    ctx.fail('id', `asset "${command.id}" does not exist`);
  }
  const usages = assetUsages(ctx.draft, command.id);
  if (usages.length > 0) {
    ctx.fail(
      'id',
      `asset "${command.id}" is still used by ${usages.join(', ')}; remove or change those first`,
    );
  }
  delete ctx.draft.assets[command.id];
  ctx.taken.delete(command.id);
}
