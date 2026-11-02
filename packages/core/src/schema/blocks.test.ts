import { describe, expect, it } from 'vitest';
import {
  CalloutBlockSchema,
  CodeBlockSchema,
  DividerBlockSchema,
  HeadingBlockSchema,
  ImageBlockSchema,
  ListBlockSchema,
  MathBlockSchema,
  ParagraphBlockSchema,
  QuoteBlockSchema,
  StatBlockSchema,
  TableBlockSchema,
} from './blocks';

describe('block schemas', () => {
  it('fills defaults for each block', () => {
    expect(HeadingBlockSchema.parse({ id: 'b_1', type: 'heading', level: 1 })).toEqual({
      id: 'b_1',
      type: 'heading',
      level: 1,
      text: '',
    });
    expect(ParagraphBlockSchema.parse({ id: 'b_1', type: 'paragraph' })).toEqual({
      id: 'b_1',
      type: 'paragraph',
      text: '',
    });
    expect(ListBlockSchema.parse({ id: 'b_1', type: 'list' })).toEqual({
      id: 'b_1',
      type: 'list',
      style: 'bullet',
      items: [],
    });
    expect(ImageBlockSchema.parse({ id: 'b_1', type: 'image', assetId: 'img_1' })).toEqual({
      id: 'b_1',
      type: 'image',
      assetId: 'img_1',
    });
    expect(TableBlockSchema.parse({ id: 'b_1', type: 'table' })).toEqual({
      id: 'b_1',
      type: 'table',
      header: false,
      rows: [['']],
    });
    expect(CalloutBlockSchema.parse({ id: 'b_1', type: 'callout' })).toEqual({
      id: 'b_1',
      type: 'callout',
      tone: 'info',
      text: '',
    });
    expect(QuoteBlockSchema.parse({ id: 'b_1', type: 'quote' })).toEqual({
      id: 'b_1',
      type: 'quote',
      text: '',
    });
    expect(DividerBlockSchema.parse({ id: 'b_1', type: 'divider' })).toEqual({
      id: 'b_1',
      type: 'divider',
    });
    expect(CodeBlockSchema.parse({ id: 'b_1', type: 'code' })).toEqual({
      id: 'b_1',
      type: 'code',
      code: '',
    });
    expect(StatBlockSchema.parse({ id: 'b_1', type: 'stat' })).toEqual({
      id: 'b_1',
      type: 'stat',
      value: '',
      label: '',
    });
    expect(MathBlockSchema.parse({ id: 'b_1', type: 'math' })).toEqual({
      id: 'b_1',
      type: 'math',
      tex: '',
    });
  });

  it('accepts a stat tone and an optional detail', () => {
    expect(
      StatBlockSchema.parse({
        id: 'b_1',
        type: 'stat',
        value: '**98%**',
        label: 'Completion',
        detail: '+12% this week',
        tone: 'info',
      }),
    ).toEqual({
      id: 'b_1',
      type: 'stat',
      value: '**98%**',
      label: 'Completion',
      detail: '+12% this week',
      tone: 'info',
    });
    expect(StatBlockSchema.safeParse({ id: 'b_1', type: 'stat', tone: 'primary' }).success).toBe(
      false,
    );
  });

  it('keeps math tex verbatim and accepts a caption', () => {
    expect(
      MathBlockSchema.parse({
        id: 'b_1',
        type: 'math',
        tex: 'E = mc^2',
        caption: 'Mass-energy',
      }),
    ).toEqual({
      id: 'b_1',
      type: 'math',
      tex: 'E = mc^2',
      caption: 'Mass-energy',
    });
  });

  it('accepts an image focal point inside 0-100 and rejects one outside', () => {
    expect(
      ImageBlockSchema.parse({
        id: 'b_1',
        type: 'image',
        assetId: 'img_1',
        focalPoint: { x: 0, y: 100 },
      }),
    ).toEqual({
      id: 'b_1',
      type: 'image',
      assetId: 'img_1',
      focalPoint: { x: 0, y: 100 },
    });
    expect(
      ImageBlockSchema.safeParse({
        id: 'b_1',
        type: 'image',
        assetId: 'img_1',
        focalPoint: { x: -1, y: 50 },
      }).success,
    ).toBe(false);
    expect(
      ImageBlockSchema.safeParse({
        id: 'b_1',
        type: 'image',
        assetId: 'img_1',
        focalPoint: { x: 50, y: 101 },
      }).success,
    ).toBe(false);
  });

  it('requires a heading level of 1, 2, or 3', () => {
    expect(HeadingBlockSchema.safeParse({ id: 'b_1', type: 'heading' }).success).toBe(false);
    expect(HeadingBlockSchema.safeParse({ id: 'b_1', type: 'heading', level: 4 }).success).toBe(
      false,
    );
    expect(HeadingBlockSchema.safeParse({ id: 'b_1', type: 'heading', level: 3 }).success).toBe(
      true,
    );
  });

  it('parses nested list items', () => {
    expect(
      ListBlockSchema.parse({
        id: 'b_1',
        type: 'list',
        items: [
          'Sunlight',
          { text: 'Water', children: ['Split by light', { text: 'Electrons', checked: false }] },
        ],
      }),
    ).toEqual({
      id: 'b_1',
      type: 'list',
      style: 'bullet',
      items: [
        'Sunlight',
        { text: 'Water', children: ['Split by light', { text: 'Electrons', checked: false }] },
      ],
    });
  });

  it('rejects an invalid id', () => {
    expect(ParagraphBlockSchema.safeParse({ id: '1bad', type: 'paragraph' }).success).toBe(false);
  });
});
