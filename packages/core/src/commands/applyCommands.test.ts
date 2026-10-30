import { applyPatches, freeze } from 'immer';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import { cloneJson } from '../parse/repair';
import type { LoomaDocument } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { applyCommands } from './applyCommands';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_1',
    title: 'Demo',
    cards: [
      { id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'One' }] },
      { id: 'c_2', body: [{ id: 'b_3', type: 'paragraph', text: 'Two' }] },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

describe('applyCommands', () => {
  it('returns an empty patch list for an empty command list', () => {
    const doc = document();
    const result = applyCommands(doc, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patches).toEqual([]);
    expect(result.inversePatches).toEqual([]);
    expect(result.createdIds).toEqual([]);
    expect(result.touchedIds).toEqual([]);
    expect(result.removedIds).toEqual([]);
    expect(result.doc).toEqual(doc);
    expect(Object.isFrozen(result.doc)).toBe(true);
    expect(doc).not.toBe(result.doc);
    expect(Object.isFrozen(doc)).toBe(false);
  });

  it('rejects a non-array command list', () => {
    const doc = document();
    expect(
      applyCommands(doc, { op: 'setTitle', title: 'x' } as unknown as readonly unknown[]),
    ).toEqual({
      ok: false,
      errors: [{ commandIndex: null, path: '$', message: 'commands must be an array' }],
    });
  });

  it('rolls back the batch when a later command fails and freezes successful results', () => {
    const doc = document();
    const card = doc.cards[0];
    const commands = [
      { op: 'setTitle', title: 'Changed' },
      { op: 'deleteCard', id: 'missing' },
    ];
    const commandsBefore = cloneJson(commands);
    const result = applyCommands(doc, commands);

    expect(result).toEqual({
      ok: false,
      errors: [{ commandIndex: 1, path: 'id', message: 'card "missing" does not exist' }],
    });
    expect(doc.title).toBe('Demo');
    expect(doc.cards[0]).toBe(card);
    expect(commands).toEqual(commandsBefore);
    expect(Object.isFrozen(doc)).toBe(false);

    const applied = applyCommands(doc, [{ op: 'setTitle', title: 'Changed' }]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(Object.isFrozen(applied.doc)).toBe(true);
    expect(Object.isFrozen(applied.doc.cards[0])).toBe(true);
    expect(applied.doc.title).toBe('Changed');
    expect(doc.title).toBe('Demo');
  });

  it('does not mutate the document or the commands', () => {
    const doc = document();
    const commands = [
      { op: 'insertCard', card: { body: [{ type: 'paragraph', text: 'Hi' }] }, at: { index: 0 } },
    ];
    const docBefore = cloneJson(doc);
    const commandsBefore = cloneJson(commands);
    const result = applyCommands(doc, commands);
    expect(result.ok).toBe(true);
    expect(doc).toEqual(docBefore);
    expect(commands).toEqual(commandsBefore);
  });

  it('round-trips through immer patches', () => {
    const doc = document();
    const result = applyCommands(doc, [{ op: 'setTitle', title: 'Changed' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyPatches(doc, result.patches)).toEqual(result.doc);
    expect(applyPatches(result.doc, result.inversePatches)).toEqual(doc);
  });

  it('reports semantic failures with a null command index and keeps the original document', () => {
    const doc = document();
    const result = applyCommands(doc, [
      {
        op: 'updateCard',
        id: 'c_1',
        patch: { accent: { position: 'left', assetId: 'img_missing' } },
      },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: null,
          path: 'cards[0].accent.assetId',
          message: 'references missing asset "img_missing"',
        },
      ],
    });
    expect(doc.cards[0]?.accent).toBeUndefined();
  });

  it('keeps only ids that still exist in touchedIds and removedIds', () => {
    const doc = document();
    const result = applyCommands(doc, [
      { op: 'deleteCard', id: 'c_2' },
      {
        op: 'insertCard',
        card: { id: 'c_2', body: [{ id: 'b_new', type: 'paragraph', text: 'Back' }] },
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedIds).toEqual(['b_3']);
    expect(result.touchedIds).toEqual(['c_2']);
    expect(result.createdIds).toEqual(['c_2', 'b_new']);
  });

  it('shares untouched cards, assets, and theme when the input is frozen', () => {
    const parsed = parseDocument(fixture);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const frozen = freeze(parsed.doc, true);
    const lastIndex = frozen.cards.length - 1;
    const lastCard = frozen.cards[lastIndex];
    const target = lastCard?.body[0];
    if (!lastCard || !target) throw new Error('fixture is missing a card');

    const edited = applyCommands(frozen, [
      { op: 'updateNode', id: target.id, patch: { text: 'changed' } },
    ]);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.doc.assets).toBe(frozen.assets);
    expect(edited.doc.theme).toBe(frozen.theme);
    for (let index = 0; index < lastIndex; index += 1) {
      expect(edited.doc.cards[index]).toBe(frozen.cards[index]);
    }
    const nextCard = edited.doc.cards[lastIndex];
    expect(nextCard).not.toBe(lastCard);
    expect(nextCard?.body[0]).not.toBe(target);
    expect(nextCard?.body[0]).toMatchObject({ id: target.id, text: 'changed' });
    for (let index = 1; index < lastCard.body.length; index += 1) {
      expect(nextCard?.body[index]).toBe(lastCard.body[index]);
    }

    const titled = applyCommands(frozen, [{ op: 'setTitle', title: 'x' }]);
    expect(titled.ok).toBe(true);
    if (!titled.ok) return;
    expect(titled.doc.cards).toBe(frozen.cards);
    expect(titled.doc.title).toBe('x');
  });

  it('returns the same frozen document when a batch changes nothing', () => {
    const parsed = parseDocument(fixture);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const frozen = freeze(parsed.doc, true);
    const empty = applyCommands(frozen, []);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.doc).toBe(frozen);
    expect(empty.patches).toEqual([]);

    const sameTitle = applyCommands(frozen, [{ op: 'setTitle', title: frozen.title }]);
    expect(sameTitle.ok).toBe(true);
    if (!sameTitle.ok) return;
    expect(sameTitle.doc).toBe(frozen);
  });

  it('returns the first command schema error and does not apply later commands', () => {
    const doc = document();
    const result = applyCommands(doc, [{ op: 'setTitle' }, { op: 'setTitle', title: 'Later' }]);
    expect(result).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'title', message: 'is required (expected string)' }],
    });
    expect(doc.title).toBe('Demo');
  });
});
