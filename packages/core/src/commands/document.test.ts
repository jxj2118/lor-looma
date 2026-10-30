import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import { applyCommands } from './applyCommands';

function document(extra?: {
  assets?: LoomaDocument['assets'];
  cards?: LoomaDocument['cards'];
}): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_1',
    title: 'Demo',
    format: 'presentation',
    theme: { preset: 'clean', overrides: { colorPrimary: '#112233', fontBody: 'serif' } },
    assets: extra?.assets ?? {
      img_1: { kind: 'image', src: 'https://example.com/a.png', alt: 'Leaf' },
      img_unused: { kind: 'image', src: 'https://example.com/b.png', alt: 'Spare' },
    },
    cards: extra?.cards ?? [
      {
        id: 'c_1',
        body: [
          { id: 'b_1', type: 'paragraph', text: 'One' },
          { id: 'b_2', type: 'paragraph', text: 'Two' },
          { id: 'b_3', type: 'image', assetId: 'img_1' },
        ],
      },
      {
        id: 'c_2',
        accent: { position: 'right', assetId: 'img_1' },
        body: [{ id: 'b_4', type: 'paragraph', text: 'Three' }],
      },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

describe('document commands', () => {
  it('sets the title', () => {
    const result = applyCommands(document(), [{ op: 'setTitle', title: 'Next' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.title).toBe('Next');
    expect(result.touchedIds).toEqual([]);
  });

  it('rejects a title that is not a string', () => {
    const result = applyCommands(document(), [{ op: 'setTitle', title: 1 }]);
    expect(result).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'title', message: 'expected string, received number' }],
    });
  });

  it('sets the format', () => {
    const result = applyCommands(document(), [{ op: 'setFormat', format: 'document' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.format).toBe('document');
  });

  it('rejects an unknown format', () => {
    const result = applyCommands(document(), [{ op: 'setFormat', format: 'slideshow' }]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'format',
          message: 'must be one of "presentation", "document"; received "slideshow"',
        },
      ],
    });
  });

  it('merges theme overrides and deletes keys set to null', () => {
    const result = applyCommands(document(), [
      { op: 'setTheme', preset: 'dark', overrides: { colorPrimary: null, colorAccent: '#abcdef' } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.theme).toEqual({
      preset: 'dark',
      overrides: { fontBody: 'serif', colorAccent: '#abcdef' },
    });
  });

  it('removes overrides when the merge leaves nothing', () => {
    const parsed = parseDocument({
      looma: 1,
      id: 'doc_1',
      theme: { preset: 'clean', overrides: { colorPrimary: '#112233' } },
      cards: [{ id: 'c_1', body: [] }],
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const result = applyCommands(parsed.doc, [
      { op: 'setTheme', overrides: { colorPrimary: null } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.theme).toEqual({ preset: 'clean' });
  });

  it('rejects an override that is not a color', () => {
    const result = applyCommands(document(), [
      { op: 'setTheme', overrides: { colorPrimary: 'not-a-color' } },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'overrides.colorPrimary',
          message: 'must be #rgb, #rrggbb, rgb(), or hsl()',
        },
      ],
    });
  });

  it('adds an asset, generating an id when one is omitted', () => {
    const result = applyCommands(document(), [
      { op: 'putAsset', asset: { kind: 'image', src: 'https://example.com/c.png' } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdIds).toHaveLength(1);
    const id = result.createdIds[0];
    expect(id).toMatch(/^img_[0-9a-z]{8}$/);
    expect(result.doc.assets[id ?? '']).toEqual({
      kind: 'image',
      src: 'https://example.com/c.png',
      alt: '',
    });
    expect(result.touchedIds).toEqual([]);
  });

  it('replaces an existing asset without creating an id', () => {
    const result = applyCommands(document(), [
      {
        op: 'putAsset',
        id: 'img_1',
        asset: { kind: 'image', src: 'https://example.com/new.png', alt: 'New' },
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdIds).toEqual([]);
    expect(result.doc.assets.img_1).toEqual({
      kind: 'image',
      src: 'https://example.com/new.png',
      alt: 'New',
    });
  });

  it('rejects an asset src that is not an image url', () => {
    const result = applyCommands(document(), [
      { op: 'putAsset', asset: { kind: 'image', src: 'javascript:x' } },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'asset.src',
          message: 'src must start with https://, http:// or data:image/',
        },
      ],
    });
  });

  it('removes an unused asset', () => {
    const result = applyCommands(document(), [{ op: 'removeAsset', id: 'img_unused' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.assets.img_unused).toBeUndefined();
    expect(result.doc.assets.img_1).toBeDefined();
    expect(result.removedIds).toEqual([]);
  });

  it('rejects removeAsset when the id is missing', () => {
    const result = applyCommands(document(), [{ op: 'removeAsset', id: 'img_missing' }]);
    expect(result).toEqual({
      ok: false,
      errors: [{ commandIndex: 0, path: 'id', message: 'asset "img_missing" does not exist' }],
    });
  });

  it('rejects removeAsset when the asset is still referenced', () => {
    const result = applyCommands(document(), [{ op: 'removeAsset', id: 'img_1' }]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'id',
          message:
            'asset "img_1" is still used by cards[0].body[2], cards[1].accent; remove or change those first',
        },
      ],
    });
  });

  it('includes an image background in removeAsset usages', () => {
    const doc = document({
      cards: [
        {
          id: 'c_1',
          background: { kind: 'image', assetId: 'img_1' },
          body: [],
        },
      ],
    });
    const result = applyCommands(doc, [{ op: 'removeAsset', id: 'img_1' }]);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          commandIndex: 0,
          path: 'id',
          message:
            'asset "img_1" is still used by cards[0].background; remove or change those first',
        },
      ],
    });
  });
});
