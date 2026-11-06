import { z } from 'zod';
import { zodIssuesToParseIssues } from '../../parse/issues';
import { SceneCropRectSchema, SceneParagraphSchema } from '../../schema';
import { findCard } from '../../tree/tree';
import { prefixed, type CommandContext } from '../context';
import type { LoomaCommand } from '../schema';

type CommandOf<Op extends LoomaCommand['op']> = Extract<LoomaCommand, { op: Op }>;

const ParagraphsPatchSchema = z.array(SceneParagraphSchema).min(1);

export function updateSceneElement(
  ctx: CommandContext,
  command: CommandOf<'updateSceneElement'>,
): void {
  const foundCard = findCard(ctx.draft, command.cardId);
  if (!foundCard) {
    ctx.fail('cardId', `card "${command.cardId}" does not exist`);
  }
  const scene = foundCard.card.scene;
  if (!scene) {
    ctx.fail('cardId', `card "${command.cardId}" is not a scene card`);
  }
  const element = scene.elements.find((item) => item.id === command.elementId);
  if (!element) {
    ctx.fail(
      'elementId',
      `scene element "${command.elementId}" does not exist in card "${command.cardId}"`,
    );
  }

  const patch = command.patch;

  if ('paragraphs' in patch && patch.paragraphs !== undefined) {
    if (element.type !== 'text') {
      ctx.fail('patch.paragraphs', `scene element "${command.elementId}" is not a text element`);
    }
    const parsed = ParagraphsPatchSchema.safeParse(patch.paragraphs);
    if (!parsed.success) {
      const issue = zodIssuesToParseIssues(parsed.error.issues, patch.paragraphs)[0];
      ctx.fail(
        issue ? prefixed('patch.paragraphs', issue.path) : 'patch.paragraphs',
        issue?.message ?? 'paragraphs are invalid',
      );
    }
    element.paragraphs = parsed.data;
  }

  if ('assetId' in patch && patch.assetId !== undefined) {
    if (element.type !== 'image') {
      ctx.fail('patch.assetId', `scene element "${command.elementId}" is not an image element`);
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.draft.assets, patch.assetId)) {
      ctx.fail('patch.assetId', `references missing asset "${patch.assetId}"`);
    }
    element.assetId = patch.assetId;
  }

  if ('crop' in patch && patch.crop !== undefined) {
    if (element.type !== 'image') {
      ctx.fail('patch.crop', `scene element "${command.elementId}" is not an image element`);
    }
    if (patch.crop === null) {
      delete element.crop;
    } else {
      const parsed = SceneCropRectSchema.safeParse(patch.crop);
      if (!parsed.success) {
        const issue = zodIssuesToParseIssues(parsed.error.issues, patch.crop)[0];
        ctx.fail(
          issue ? prefixed('patch.crop', issue.path) : 'patch.crop',
          issue?.message ?? 'crop is invalid',
        );
      }
      element.crop = parsed.data;
    }
  }

  if ('alt' in patch && patch.alt !== undefined) {
    if (element.type !== 'image') {
      ctx.fail('patch.alt', `scene element "${command.elementId}" is not an image element`);
    }
    if (patch.alt === null) {
      delete element.alt;
    } else {
      const parsed = z.string().max(1000).safeParse(patch.alt);
      if (!parsed.success) {
        ctx.fail('patch.alt', 'alt must be a string up to 1000 chars');
      }
      element.alt = parsed.data;
    }
  }

  ctx.touch(foundCard.card.id);
  ctx.touch(element.id);
}
