import { describe, expect, it } from 'vitest';
import { LoomaDocumentSchema } from '../schema/document';
import type { LoomaDocument } from '../schema/document';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { validateDocumentSemantics } from './semantics';

function parse(input: unknown): LoomaDocument {
  return LoomaDocumentSchema.parse(input);
}

describe('validateDocumentSemantics', () => {
  it('accepts the photosynthesis fixture', () => {
    expect(validateDocumentSemantics(parse(fixture))).toEqual([]);
  });

  it('reports a duplicate id at the second occurrence', () => {
    const doc = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        { id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'First' }] },
        { id: 'c_2', body: [{ id: 'b_1', type: 'divider' }] },
      ],
    });
    expect(validateDocumentSemantics(doc)).toEqual([
      {
        path: 'cards[1].body[0]',
        message: 'duplicate id "b_1" (first used at cards[0].body[0])',
      },
    ]);
  });

  it('allows two container levels and rejects a third', () => {
    const ok = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          body: [{ id: 'n_0', type: 'stack', children: [{ id: 'n_1', type: 'grid' }] }],
        },
      ],
    });
    expect(validateDocumentSemantics(ok)).toEqual([]);

    const tooDeep = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'n_0',
              type: 'stack',
              children: [
                {
                  id: 'n_1',
                  type: 'stack',
                  children: [{ id: 'n_2', type: 'grid' }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(validateDocumentSemantics(tooDeep)).toEqual([
      {
        path: 'cards[0].body[0].children[0].children[0]',
        message: 'containers can be nested at most 2 levels deep',
      },
    ]);
  });

  it('checks that column widths match the column count', () => {
    const doc = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'n_1',
              type: 'columns',
              widths: [1, 1],
              children: [
                [{ id: 'b_1', type: 'paragraph' }],
                [{ id: 'b_2', type: 'paragraph' }],
                [{ id: 'b_3', type: 'paragraph' }],
              ],
            },
          ],
        },
      ],
    });
    expect(validateDocumentSemantics(doc)).toEqual([
      {
        path: 'cards[0].body[0]',
        message: 'widths has 2 entries but children has 3 columns',
      },
    ]);
  });

  it('allows three list levels and rejects a fourth', () => {
    const ok = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'b_1',
              type: 'list',
              items: [{ text: 'a', children: [{ text: 'b', children: [{ text: 'c' }] }] }],
            },
          ],
        },
      ],
    });
    expect(validateDocumentSemantics(ok)).toEqual([]);

    const tooDeep = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'b_1',
              type: 'list',
              items: [
                {
                  text: 'a',
                  children: [
                    { text: 'b', children: [{ text: 'c', children: [{ text: 'too deep' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(validateDocumentSemantics(tooDeep)).toEqual([
      {
        path: 'cards[0].body[0].items[0].children[0].children[0].children[0]',
        message: 'list items can be nested at most 3 levels deep',
      },
    ]);
  });

  it('requires table rows to share one positive length', () => {
    const ragged = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          body: [
            {
              id: 'b_1',
              type: 'table',
              rows: [
                ['a', 'b', 'c'],
                ['d', 'e', 'f'],
                ['g', 'h'],
              ],
            },
          ],
        },
      ],
    });
    expect(validateDocumentSemantics(ragged)).toEqual([
      {
        path: 'cards[0].body[0]',
        message: 'all rows must have the same number of cells (row 0 has 3, row 2 has 2)',
      },
    ]);

    const empty = parse({
      looma: 1,
      id: 'doc_1',
      cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'table', rows: [[]] }] }],
    });
    expect(validateDocumentSemantics(empty)).toEqual([
      {
        path: 'cards[0].body[0]',
        message: 'all rows must have the same number of cells (row 0 has 0)',
      },
    ]);
  });

  it('requires image, accent, and background assets to exist', () => {
    const doc = parse({
      looma: 1,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          accent: { position: 'left', assetId: 'img_accent' },
          background: { kind: 'image', assetId: 'img_bg' },
          body: [{ id: 'b_1', type: 'image', assetId: 'img_x' }],
        },
      ],
    });
    expect(validateDocumentSemantics(doc)).toEqual([
      { path: 'cards[0].accent.assetId', message: 'references missing asset "img_accent"' },
      { path: 'cards[0].background.assetId', message: 'references missing asset "img_bg"' },
      { path: 'cards[0].body[0].assetId', message: 'references missing asset "img_x"' },
    ]);
  });
});
