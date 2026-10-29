import { describe, expect, it } from 'vitest';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { LoomaDocumentSchema } from './document';
import { LoomaDocumentSchema as LoomaDocumentSchemaFromIndex } from './index';

describe('LoomaDocumentSchema', () => {
  it('parses the photosynthesis presentation', () => {
    const parsed = LoomaDocumentSchema.parse(fixture);
    expect(parsed).toMatchObject(fixture);
    expect(parsed.cards).toHaveLength(4);
    expect(parsed.format).toBe('presentation');
    expect(parsed.theme.overrides).toMatchObject({
      colorPrimary: '#2f6b3a',
      colorAccent: '#d4a017',
    });
    expect(parsed.assets.img_leaf?.src).toContain('https://');
    expect(parsed.cards[0]?.accent).toEqual({ position: 'right', assetId: 'img_leaf' });
    expect(parsed.cards[1]?.background).toMatchObject({ kind: 'gradient', angle: 135 });
  });

  it('fills defaults for a minimal document', () => {
    expect(LoomaDocumentSchema.parse({ looma: 1, id: 'doc_1' })).toEqual({
      looma: 1,
      id: 'doc_1',
      title: '',
      format: 'presentation',
      theme: { preset: 'clean' },
      assets: {},
      cards: [],
    });
  });

  it('rejects a newer schema version', () => {
    expect(LoomaDocumentSchema.safeParse({ looma: 2, id: 'doc_1' }).success).toBe(false);
  });

  it('re-exports the document schema from the schema barrel', () => {
    expect(LoomaDocumentSchemaFromIndex).toBe(LoomaDocumentSchema);
  });
});
