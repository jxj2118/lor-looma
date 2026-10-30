import type { LoomaCard, LoomaDocument } from '../schema';
import { findCard } from '../tree/tree';
import { cardToMarkdown } from './markdown';

export interface GetCardsOptions {
  as?: 'json' | 'markdown';
}

export function getCards(
  doc: LoomaDocument,
  ids: readonly string[],
  options?: { as?: 'json' },
): { cards: LoomaCard[]; missing: string[] };
export function getCards(
  doc: LoomaDocument,
  ids: readonly string[],
  options: { as: 'markdown' },
): { markdown: string; missing: string[] };
export function getCards(
  doc: LoomaDocument,
  ids: readonly string[],
  options?: GetCardsOptions,
): { cards: LoomaCard[]; missing: string[] } | { markdown: string; missing: string[] } {
  const missing: string[] = [];
  const seen = new Set<string>();
  const cards: LoomaCard[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const found = findCard(doc, id);
    if (!found) missing.push(id);
    else cards.push(found.card);
  }
  if (options?.as === 'markdown') {
    return {
      markdown: cards.map((card) => cardToMarkdown(card, doc)).join('\n\n'),
      missing,
    };
  }
  return { cards, missing };
}
