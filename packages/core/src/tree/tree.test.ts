import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { childArrayOf, collectIds, findCard, findNode, isContainer, walkNodes } from './tree';

function document(): LoomaDocument {
  const parsed = parseDocument(fixture);
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

/** A proxy that only forwards property reads, like an immer draft. */
function draftLike<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  return new Proxy(value, {
    get(target, key, receiver) {
      const current: unknown = Reflect.get(target, key, receiver);
      if (typeof current === 'object' && current !== null) return draftLike(current);
      return current;
    },
    getPrototypeOf() {
      return null;
    },
  }) as T;
}

describe('walkNodes', () => {
  it('visits nodes in document order, columns by column then row', () => {
    const doc = document();
    const ids: string[] = [];
    walkNodes(doc, (found) => {
      ids.push(found.node.id);
    });
    expect(ids).toEqual([
      'b_title',
      'b_lead',
      'b_quote',
      'b_process_heading',
      'n_process_stack',
      'n_process_columns',
      'b_overview',
      'b_steps',
      'b_leaf',
      'b_where',
      'b_chlorophyll',
      'n_organelles',
      'b_light_reactions',
      'b_checklist',
      'b_rule',
      'b_stages',
      'b_equation',
      'b_review_heading',
      'b_question',
      'b_answers',
    ]);
  });

  it('stops when visit returns false, without entering that node', () => {
    const doc = document();
    const ids: string[] = [];
    walkNodes(doc, (found) => {
      ids.push(found.node.id);
      if (found.node.id === 'n_process_stack') return false;
    });
    expect(ids).toEqual(['b_title', 'b_lead', 'b_quote', 'b_process_heading', 'n_process_stack']);
  });

  it('reads an immer-style draft that has no prototype', () => {
    const doc = draftLike(document());
    const found = findNode(doc, 'b_leaf');
    expect(found?.node.id).toBe('b_leaf');
    expect(found?.slot).toBe(1);
  });
});

describe('findNode', () => {
  it('locates a node directly in a card body', () => {
    const doc = document();
    expect(findNode(doc, 'b_lead')).toEqual({
      node: doc.cards[0]?.body[1],
      cardId: 'c_title',
      cardIndex: 0,
      parentId: 'c_title',
      slot: null,
      index: 1,
      depth: 0,
      path: 'cards[0].body[1]',
    });
  });

  it('locates a child of a stack', () => {
    const doc = document();
    expect(findNode(doc, 'n_process_columns')).toMatchObject({
      cardId: 'c_process',
      cardIndex: 1,
      parentId: 'n_process_stack',
      slot: null,
      index: 0,
      depth: 1,
      path: 'cards[1].body[1].children[0]',
    });
  });

  it('locates column 1, row 0 of a columns container', () => {
    const doc = document();
    expect(findNode(doc, 'b_leaf')).toMatchObject({
      cardId: 'c_process',
      cardIndex: 1,
      parentId: 'n_process_columns',
      slot: 1,
      index: 0,
      depth: 2,
      path: 'cards[1].body[1].children[0].children[1][0]',
    });
  });

  it('returns null for an unknown id', () => {
    expect(findNode(document(), 'missing')).toBeNull();
  });
});

describe('findCard', () => {
  it('returns the card, its index, and its path', () => {
    const doc = document();
    expect(findCard(doc, 'c_inside')).toEqual({
      card: doc.cards[2],
      index: 2,
      path: 'cards[2]',
    });
  });

  it('returns null for an unknown id', () => {
    expect(findCard(document(), 'missing')).toBeNull();
  });
});

describe('collectIds', () => {
  it('includes the document id, card ids, every node id, and asset keys', () => {
    expect(collectIds(document())).toEqual(
      new Set([
        'doc_photosynthesis',
        'img_leaf',
        'c_title',
        'c_process',
        'c_inside',
        'c_review',
        'b_title',
        'b_lead',
        'b_quote',
        'b_process_heading',
        'n_process_stack',
        'n_process_columns',
        'b_overview',
        'b_steps',
        'b_leaf',
        'b_where',
        'b_chlorophyll',
        'n_organelles',
        'b_light_reactions',
        'b_checklist',
        'b_rule',
        'b_stages',
        'b_equation',
        'b_review_heading',
        'b_question',
        'b_answers',
      ]),
    );
  });
});

describe('childArrayOf', () => {
  it('returns null when a columns container is given no slot or a slot past the end', () => {
    const doc = document();
    const columns = findNode(doc, 'n_process_columns');
    if (!columns || !isContainer(columns.node) || columns.node.type !== 'columns') {
      throw new Error('expected columns');
    }
    expect(childArrayOf(columns.node, null)).toBeNull();
    expect(childArrayOf(columns.node, 5)).toBeNull();
    expect(childArrayOf(columns.node, 1)).toBe(columns.node.children[1]);
  });

  it('returns the body of a card and the children of a stack when slot is null', () => {
    const doc = document();
    const card = doc.cards[0];
    const stack = findNode(doc, 'n_process_stack');
    if (!card || !stack || !isContainer(stack.node)) throw new Error('expected card and stack');
    expect(childArrayOf(card, null)).toBe(card.body);
    expect(childArrayOf(card, 0)).toBeNull();
    expect(childArrayOf(stack.node, null)).toBe(stack.node.children);
    expect(childArrayOf(stack.node, 0)).toBeNull();
  });
});

describe('isContainer', () => {
  it('accepts stack, columns, grid, and steps', () => {
    const doc = document();
    const heading = findNode(doc, 'b_title');
    const stack = findNode(doc, 'n_process_stack');
    const columns = findNode(doc, 'n_process_columns');
    const grid = findNode(doc, 'n_organelles');
    if (!heading || !stack || !columns || !grid) throw new Error('missing nodes');
    expect(isContainer(heading.node)).toBe(false);
    expect(isContainer(stack.node)).toBe(true);
    expect(isContainer(columns.node)).toBe(true);
    expect(isContainer(grid.node)).toBe(true);
    expect(isContainer({ id: 'n_steps', type: 'steps', children: [] })).toBe(true);
  });
});
