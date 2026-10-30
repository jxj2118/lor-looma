import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import { cloneJson } from '../parse/repair';
import { getOutline } from '../read';
import { createLoomaStore } from '../store';
import type { LoomaStore, StoreChange } from '../store';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { createToolHandler } from './handler';

function store(): LoomaStore {
  const parsed = parseDocument(cloneJson(fixture));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return createLoomaStore(parsed.doc);
}

describe('createToolHandler', () => {
  it('returns the outline', () => {
    const current = store();
    const result = createToolHandler(current)('looma_get_outline', {});
    expect(result).toEqual({ ok: true, outline: getOutline(current.getDocument()) });
  });

  it('treats null, undefined, and a JSON object string as empty arguments', () => {
    const current = store();
    const handler = createToolHandler(current);
    const outline = getOutline(current.getDocument());
    expect(handler('looma_get_outline', null)).toEqual({ ok: true, outline });
    expect(handler('looma_get_outline', undefined)).toEqual({ ok: true, outline });
    expect(handler('looma_get_outline', '{}')).toEqual({ ok: true, outline });
    expect(handler('looma_get_outline', 'null')).toEqual({ ok: true, outline });
  });

  it('rejects arguments that are not valid JSON', () => {
    const result = createToolHandler(store())('looma_get_outline', '{');
    expect(result).toEqual({
      ok: false,
      error:
        "arguments are not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    });
  });

  it('rejects an unknown tool name', () => {
    const result = createToolHandler(store())('looma_explode', {});
    expect(result).toEqual({
      ok: false,
      error:
        'unknown tool "looma_explode"; expected one of looma_get_outline, looma_get_cards, looma_apply',
    });
  });

  it('rejects arguments that are not an object', () => {
    const result = createToolHandler(store())('looma_get_outline', 4);
    expect(result).toEqual({ ok: false, error: '$: expected an object' });
  });

  it('rejects unknown outline arguments', () => {
    const result = createToolHandler(store())('looma_get_outline', { note: true });
    expect(result).toEqual({ ok: false, error: '$: unknown key(s): note' });
  });

  it('requires an array of card ids', () => {
    const handler = createToolHandler(store());
    expect(handler('looma_get_cards', {})).toEqual({
      ok: false,
      error: 'ids: is required (expected an array of card ids)',
    });
    expect(handler('looma_get_cards', { ids: 'c_title' })).toEqual({
      ok: false,
      error: 'ids: is required (expected an array of card ids)',
    });
    expect(handler('looma_get_cards', { ids: [] })).toEqual({
      ok: false,
      error: 'ids: must have at least 1 items',
    });
    expect(handler('looma_get_cards', { ids: ['1bad'] })).toEqual({
      ok: false,
      error:
        'ids[0]: must be a valid id (letter first, then letters, digits, "_" or "-", max 64 chars)',
    });
    expect(handler('looma_get_cards', { ids: ['c_title'], as: 'html' })).toEqual({
      ok: false,
      error: 'as: must be one of "json", "markdown"; received "html"',
    });
  });

  it('reads cards as json by default and as markdown when asked', () => {
    const current = store();
    const handler = createToolHandler(current);
    const json = handler('looma_get_cards', { ids: ['c_title', 'c_title'] });
    expect(json).toEqual({
      ok: true,
      cards: [current.getDocument().cards[0]],
      missing: [],
    });

    const markdown = handler('looma_get_cards', '{"ids":["c_title"],"as":"markdown"}');
    expect(markdown.ok).toBe(true);
    if (!markdown.ok) return;
    expect(markdown.missing).toEqual([]);
    expect(markdown).not.toHaveProperty('cards');
    expect(markdown.markdown).toContain('<!-- id: b_title -->');
  });

  it('explains missing card ids, including ids that are nodes', () => {
    const handler = createToolHandler(store());
    expect(handler('looma_get_cards', { ids: ['missing_card'] })).toEqual({
      ok: true,
      cards: [],
      missing: ['missing_card'],
      hint: 'Some ids are not cards. Card ids start with c_ in generated documents; call looma_get_outline to see them.',
    });
    expect(handler('looma_get_cards', { ids: ['b_title', 'b_lead'], as: 'markdown' })).toEqual({
      ok: true,
      markdown: '',
      missing: ['b_title', 'b_lead'],
      hint: '"b_title" is a node inside card "c_title"; pass the card id instead. "b_lead" is a node inside card "c_title"; pass the card id instead.',
    });
    const mixed = handler('looma_get_cards', { ids: ['c_inside', 'b_equation', 'nope'] });
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) return;
    expect(mixed.missing).toEqual(['b_equation', 'nope']);
    expect(mixed.hint).toBe(
      '"b_equation" is a node inside card "c_inside"; pass the card id instead. Some ids are not cards. Card ids start with c_ in generated documents; call looma_get_outline to see them.',
    );
  });

  it('requires a non-empty commands array', () => {
    const handler = createToolHandler(store());
    expect(handler('looma_apply', {})).toEqual({
      ok: false,
      error: 'commands: is required (expected an array of commands)',
    });
    expect(handler('looma_apply', { commands: [] })).toEqual({
      ok: false,
      error: 'commands: must have at least 1 items',
    });
    expect(
      handler('looma_apply', { commands: [{ op: 'setTitle', title: 'X' }], label: 1 }),
    ).toEqual({ ok: false, error: 'label: expected string, received number' });
  });

  it('applies a batch as one undo step and records origin and label', () => {
    const current = store();
    const changes: StoreChange[] = [];
    current.subscribe((_doc, change) => changes.push(change));
    const result = createToolHandler(current)('looma_apply', {
      commands: [{ op: 'setTitle', title: 'Updated title' }],
      label: 'Rename the deck',
    });
    expect(result).toEqual({
      ok: true,
      createdIds: [],
      touchedIds: [],
      removedIds: [],
      outline: getOutline(current.getDocument()),
    });
    expect(current.getDocument().title).toBe('Updated title');
    expect(changes).toEqual([
      {
        kind: 'apply',
        origin: 'ai',
        label: 'Rename the deck',
        commands: [{ op: 'setTitle', title: 'Updated title' }],
        touchedIds: [],
        removedIds: [],
      },
    ]);
    expect(current.undo()).toBe(true);
    expect(current.getDocument().title).toBe('Introduction to Photosynthesis');
    expect(current.undo()).toBe(false);
  });

  it('uses a caller-supplied origin and can omit the outline', () => {
    const current = store();
    const changes: StoreChange[] = [];
    current.subscribe((_doc, change) => changes.push(change));
    const result = createToolHandler(current, { origin: 'assistant', includeOutline: false })(
      'looma_apply',
      { commands: [{ op: 'setFormat', format: 'document' }] },
    );
    expect(result).toEqual({
      ok: true,
      createdIds: [],
      touchedIds: [],
      removedIds: [],
    });
    expect(changes[0]?.origin).toBe('assistant');
    expect(changes[0]?.label).toBeUndefined();
  });

  it('reports a command failure and leaves the document unchanged', () => {
    const current = store();
    const before = current.getDocument();
    const result = createToolHandler(current)('looma_apply', {
      commands: [{ op: 'setTitle' }],
    });
    expect(result).toEqual({
      ok: false,
      error:
        'No changes were applied. Command 0 (setTitle) failed: title: is required (expected string). Fix the command and send the whole batch again.',
      errors: [{ commandIndex: 0, path: 'title', message: 'is required (expected string)' }],
    });
    expect(current.getDocument()).toBe(before);
  });

  it('reports a semantic failure with a null command index', () => {
    const current = store();
    const before = current.getDocument();
    const result = createToolHandler(current)('looma_apply', {
      commands: [
        {
          op: 'updateCard',
          id: 'c_title',
          patch: { accent: { position: 'left', assetId: 'img_missing' } },
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error:
        'No changes were applied. The resulting document would be invalid: cards[0].accent.assetId: references missing asset "img_missing". Fix the command and send the whole batch again.',
      errors: [
        {
          commandIndex: null,
          path: 'cards[0].accent.assetId',
          message: 'references missing asset "img_missing"',
        },
      ],
    });
    expect(current.getDocument()).toBe(before);
  });

  it('joins every apply error and tells the model to resend the batch', () => {
    const result = createToolHandler(store())('looma_apply', {
      commands: [
        {
          op: 'updateCard',
          id: 'c_title',
          patch: { accent: { position: 'left', assetId: 'img_missing' } },
        },
        {
          op: 'updateCard',
          id: 'c_inside',
          patch: { accent: { position: 'top', assetId: 'img_other' } },
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error:
        'No changes were applied. The resulting document would be invalid: cards[0].accent.assetId: references missing asset "img_missing". No changes were applied. The resulting document would be invalid: cards[2].accent.assetId: references missing asset "img_other". Fix the command and send the whole batch again.',
      errors: [
        {
          commandIndex: null,
          path: 'cards[0].accent.assetId',
          message: 'references missing asset "img_missing"',
        },
        {
          commandIndex: null,
          path: 'cards[2].accent.assetId',
          message: 'references missing asset "img_other"',
        },
      ],
    });
  });

  it('turns an unexpected exception into an internal error', () => {
    const broken = {
      getDocument() {
        throw new Error('boom');
      },
    } as unknown as LoomaStore;
    expect(createToolHandler(broken)('looma_get_outline', {})).toEqual({
      ok: false,
      error: 'internal error: boom',
    });

    const stringThrown = {
      getDocument() {
        throw 'exploded';
      },
    } as unknown as LoomaStore;
    expect(createToolHandler(stringThrown)('looma_get_outline', {})).toEqual({
      ok: false,
      error: 'internal error: exploded',
    });
  });
});
