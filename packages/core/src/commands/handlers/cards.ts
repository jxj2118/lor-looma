import { z } from 'zod';
import { zodIssuesToParseIssues } from '../../parse/issues';
import { cloneJson, isPlainObject } from '../../parse/repair';
import { CardAccentSchema, CardBackgroundSchema } from '../../schema';
import { findCard } from '../../tree/tree';
import { failIssues, prefixed, type CommandContext } from '../context';
import { resolveCardLocation } from '../locate';
import { materializeCard } from '../materialize';
import type { LoomaCommand } from '../schema';

type CommandOf<Op extends LoomaCommand['op']> = Extract<LoomaCommand, { op: Op }>;

function stripIds(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripIds(item);
    return;
  }
  if (!isPlainObject(value)) return;
  delete value.id;
  if ('children' in value) stripIds(value.children);
  if ('body' in value) stripIds(value.body);
}

export function insertCard(ctx: CommandContext, command: CommandOf<'insertCard'>): void {
  const card = materializeCard(command.card ?? {}, ctx.taken, ctx.createdIds);
  if (!card.ok) failIssues(ctx, 'card', card.issues);
  const index = resolveCardLocation(ctx, command.at, 'at');
  ctx.draft.cards.splice(index, 0, card.value);
  ctx.touch(card.value.id);
}

export function updateCard(ctx: CommandContext, command: CommandOf<'updateCard'>): void {
  const found = findCard(ctx.draft, command.id);
  if (!found) ctx.fail('id', `card "${command.id}" does not exist`);
  const card = found.card;
  const patch = command.patch;
  if ('accent' in patch) {
    if (patch.accent === null) delete card.accent;
    else if (patch.accent !== undefined) {
      const parsed = CardAccentSchema.safeParse(patch.accent);
      if (!parsed.success) {
        const issue = zodIssuesToParseIssues(parsed.error.issues, patch.accent)[0];
        ctx.fail(
          issue ? prefixed('patch.accent', issue.path) : 'patch.accent',
          issue?.message ?? 'accent is invalid',
        );
      }
      card.accent = parsed.data;
    }
  }
  if ('background' in patch) {
    if (patch.background === null) delete card.background;
    else if (patch.background !== undefined) {
      const parsed = CardBackgroundSchema.safeParse(patch.background);
      if (!parsed.success) {
        const issue = zodIssuesToParseIssues(parsed.error.issues, patch.background)[0];
        ctx.fail(
          issue ? prefixed('patch.background', issue.path) : 'patch.background',
          issue?.message ?? 'background is invalid',
        );
      }
      card.background = parsed.data;
    }
  }
  if ('notes' in patch) {
    if (patch.notes === null) delete card.notes;
    else if (patch.notes !== undefined) {
      const parsed = z.string().safeParse(patch.notes);
      if (!parsed.success) {
        const issue = zodIssuesToParseIssues(parsed.error.issues, patch.notes)[0];
        ctx.fail(
          issue ? prefixed('patch.notes', issue.path) : 'patch.notes',
          issue?.message ?? 'notes must be a string',
        );
      }
      card.notes = parsed.data;
    }
  }
  ctx.touch(card.id);
}

export function moveCard(ctx: CommandContext, command: CommandOf<'moveCard'>): void {
  const found = findCard(ctx.draft, command.id);
  if (!found) ctx.fail('id', `card "${command.id}" does not exist`);
  if ('before' in command.to && command.to.before === command.id) {
    ctx.fail('to.before', `cannot move card "${command.id}" relative to itself`);
  }
  if ('after' in command.to && command.to.after === command.id) {
    ctx.fail('to.after', `cannot move card "${command.id}" relative to itself`);
  }
  const [card] = ctx.draft.cards.splice(found.index, 1);
  if (!card) ctx.fail('id', `card "${command.id}" does not exist`);
  const index = resolveCardLocation(ctx, command.to, 'to');
  ctx.draft.cards.splice(index, 0, card);
  ctx.touch(command.id);
}

export function duplicateCard(ctx: CommandContext, command: CommandOf<'duplicateCard'>): void {
  const found = findCard(ctx.draft, command.id);
  if (!found) ctx.fail('id', `card "${command.id}" does not exist`);
  const copy = cloneJson(found.card);
  stripIds(copy);
  if (command.newId !== undefined) copy.id = command.newId;
  const card = materializeCard(copy, ctx.taken, ctx.createdIds);
  if (!card.ok) {
    const issue = card.issues[0];
    if (!issue) ctx.fail('newId', 'could not duplicate the card');
    ctx.fail(issue.path === 'id' ? 'newId' : prefixed('card', issue.path), issue.message);
  }
  ctx.draft.cards.splice(found.index + 1, 0, card.value);
  ctx.touch(card.value.id);
}

export function deleteCard(ctx: CommandContext, command: CommandOf<'deleteCard'>): void {
  const found = findCard(ctx.draft, command.id);
  if (!found) ctx.fail('id', `card "${command.id}" does not exist`);
  ctx.remove(command.id);
  ctx.draft.cards.splice(found.index, 1);
}
