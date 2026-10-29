import { describe, expect, it } from 'vitest';
import { isValidId } from '../ids';
import type { LoomaDocument, LoomaNode } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import messy from '../test/fixtures/messy-input.json' with { type: 'json' };
import { runMigrations } from './migrate';
import { parseDocument } from './parseDocument';

function nodeIds(doc: LoomaDocument): string[] {
  const ids: string[] = [];
  const walk = (node: LoomaNode) => {
    ids.push(node.id);
    if (node.type === 'columns') {
      for (const column of node.children) for (const child of column) walk(child);
    } else if (node.type === 'stack' || node.type === 'grid') {
      for (const child of node.children) walk(child);
    }
  };
  for (const card of doc.cards) {
    ids.push(card.id);
    for (const node of card.body) walk(node);
  }
  return ids;
}

describe('parseDocument', () => {
  it('parses the photosynthesis fixture from an object and from JSON text', () => {
    const fromObject = parseDocument(fixture);
    const fromText = parseDocument(JSON.stringify(fixture));
    expect(fromObject).toEqual(fromText);
    expect(fromObject.ok).toBe(true);
    if (fromObject.ok) expect(fromObject.warnings).toEqual([]);
  });

  it('repairs messy input into a stable document', () => {
    const original = JSON.parse(JSON.stringify(messy)) as unknown;
    const before = JSON.parse(JSON.stringify(original)) as unknown;
    const repaired = parseDocument(original);
    expect(original).toEqual(before);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;

    const messages = repaired.warnings.map((warning) => warning.message);
    expect(messages.some((message) => message.startsWith('looma: missing schema version'))).toBe(
      true,
    );
    expect(messages.some((message) => message.includes('missing or invalid id, generated'))).toBe(
      true,
    );
    expect(messages.some((message) => message.includes('duplicate id "b_dup", renamed to'))).toBe(
      true,
    );
    expect(messages.some((message) => message.includes('unknown block type "video"'))).toBe(true);
    expect(messages.some((message) => message.includes('missing widths, filled'))).toBe(true);
    expect(messages.some((message) => message.includes('padded shorter rows'))).toBe(true);

    const ids = nodeIds(repaired.doc);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isValidId(id)).toBe(true);

    const unknown = repaired.doc.cards[0]?.body.find((node) => node.type === 'unknown');
    expect(unknown).toMatchObject({
      type: 'unknown',
      raw: { type: 'video', url: 'https://example.com/photosynthesis.mp4' },
    });
    expect(repaired.doc).not.toHaveProperty('foo');
    const kept = repaired.doc.cards[0]?.body.find(
      (node) => node.type === 'paragraph' && node.text === 'Keep me',
    );
    expect(kept).toBeDefined();
    expect(kept).not.toHaveProperty('foo');

    const again = parseDocument(repaired.doc, { repair: false });
    expect(again).toEqual({ ok: true, doc: repaired.doc, warnings: [] });
  });

  it('rejects messy input when repair is off', () => {
    const result = parseDocument(messy, { repair: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.message)).toContain(
      'looma: is required (expected 1)',
    );
  });

  it('rejects invalid JSON, non-objects, and unsupported versions', () => {
    const invalid = parseDocument('{');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors).toHaveLength(1);
      expect(invalid.errors[0]?.path).toBe('$');
      expect(invalid.errors[0]?.message.startsWith('invalid JSON:')).toBe(true);
    }
    expect(parseDocument(null)).toEqual({
      ok: false,
      errors: [{ path: '$', message: 'document must be a JSON object' }],
    });
    expect(parseDocument([])).toEqual({
      ok: false,
      errors: [{ path: '$', message: 'document must be a JSON object' }],
    });
    expect(parseDocument({ looma: 2, id: 'doc_1' })).toEqual({
      ok: false,
      errors: [
        {
          path: 'looma',
          message: 'looma: document uses schema version 2, but this library only supports up to 1',
        },
      ],
    });
    expect(parseDocument({ looma: 0.5, id: 'doc_1' })).toEqual({
      ok: false,
      errors: [
        {
          path: 'looma',
          message: 'looma: must be a positive integer; received 0.5',
        },
      ],
    });
  });

  it('reports a missing heading level with a model-friendly message', () => {
    expect(
      parseDocument({
        looma: 1,
        id: 'doc_1',
        cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'heading' }] }],
      }),
    ).toEqual({
      ok: false,
      errors: [{ path: 'cards[0].body[0].level', message: 'is required (expected 1 | 2 | 3)' }],
    });
  });

  it('reports a missing asset reference', () => {
    expect(
      parseDocument({
        looma: 1,
        id: 'doc_1',
        cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'image', assetId: 'img_x' }] }],
      }),
    ).toEqual({
      ok: false,
      errors: [{ path: 'cards[0].body[0].assetId', message: 'references missing asset "img_x"' }],
    });
  });

  it('keeps an unknown block when repair is off and the rest of the document is valid', () => {
    const result = parseDocument(
      {
        looma: 1,
        id: 'doc_1',
        cards: [
          {
            id: 'c_1',
            body: [{ id: 'b_video', type: 'video', url: 'https://example.com/v.mp4' }],
          },
        ],
      },
      { repair: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      'cards[0].body[0]: unknown block type "video", kept as an unsupported block',
    ]);
    expect(result.doc.cards[0]?.body[0]).toMatchObject({
      id: 'b_video',
      type: 'unknown',
      raw: { id: 'b_video', type: 'video', url: 'https://example.com/v.mp4' },
    });
  });
});

describe('runMigrations', () => {
  it('applies each migration in version order', () => {
    const doc: Record<string, unknown> = { looma: 1, id: 'doc_1' };
    const migrated = runMigrations(doc, 1, {
      1: (current) => ({ ...current, looma: 2, migrated: true }),
    });
    expect(migrated).toEqual({ looma: 2, id: 'doc_1', migrated: true });
    expect(doc).toEqual({ looma: 1, id: 'doc_1' });
  });
});
