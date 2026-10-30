import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { getCards } from './getCards';

function document(): LoomaDocument {
  const parsed = parseDocument(fixture);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

describe('getCards', () => {
  it('returns cards in the requested order and lists missing ids once', () => {
    const doc = document();
    const result = getCards(doc, ['c_inside', 'missing', 'c_title', 'c_inside', 'missing']);
    expect(result.missing).toEqual(['missing']);
    expect(result.cards.map((card) => card.id)).toEqual(['c_inside', 'c_title']);
    expect(result.cards[0]).toBe(doc.cards[2]);
    expect(result.cards[1]).toBe(doc.cards[0]);
  });

  it('returns the same cards when as is json', () => {
    const doc = document();
    expect(getCards(doc, ['c_review'], { as: 'json' }).cards.map((card) => card.id)).toEqual([
      'c_review',
    ]);
  });

  it('joins markdown cards with a blank line', () => {
    const doc = document();
    const result = getCards(doc, ['missing', 'c_title', 'c_review'], { as: 'markdown' });
    expect(result.missing).toEqual(['missing']);
    expect(result.markdown.startsWith('<!-- card: c_title -->')).toBe(true);
    expect(result.markdown).toContain('\n\n<!-- card: c_review -->');
    expect(result.markdown).not.toContain('c_inside');
  });
});
