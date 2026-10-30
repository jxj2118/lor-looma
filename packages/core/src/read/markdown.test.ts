import { describe, expect, it } from 'vitest';
import { LoomaDocumentSchema } from '../schema';
import type { LoomaDocument } from '../schema';
import { cardToMarkdown } from './markdown';

function document(): LoomaDocument {
  return LoomaDocumentSchema.parse({
    looma: 1,
    id: 'doc_1',
    title: 'Demo',
    assets: {
      img_1: {
        kind: 'image',
        src: 'https://example.com/leaf.png',
        alt: 'A leaf',
      },
      img_data: {
        kind: 'image',
        src: `data:image/png;base64,${'a'.repeat(80)}`,
        alt: 'Pixels',
      },
    },
    cards: [
      {
        id: 'c_1',
        accent: { position: 'right', assetId: 'img_1' },
        background: { kind: 'gradient', from: '#aabbcc', to: '#ddeeff', angle: 90 },
        notes: 'Speaker notes\nstay verbatim',
        body: [
          { id: 'b_h', type: 'heading', level: 2, text: 'Title **bold**' },
          { id: 'b_p', type: 'paragraph', text: 'Hello {color:primary}world{/color}.' },
          {
            id: 'b_list',
            type: 'list',
            style: 'bullet',
            items: ['One', { text: 'Two', children: ['Nested'] }],
          },
          {
            id: 'b_check',
            type: 'list',
            style: 'check',
            items: [
              { text: 'Done', checked: true },
              { text: 'Later', checked: false },
            ],
          },
          {
            id: 'b_num',
            type: 'list',
            style: 'number',
            items: ['First', 'Second'],
          },
          {
            id: 'b_img',
            type: 'image',
            assetId: 'img_1',
            caption: 'See a [leaf](https://example.com/leaf).',
          },
          { id: 'b_missing', type: 'image', assetId: 'img_missing' },
          { id: 'b_data', type: 'image', assetId: 'img_data' },
          {
            id: 'b_table',
            type: 'table',
            header: true,
            rows: [
              ['Stage', 'Output'],
              ['Light', 'ATP'],
            ],
          },
          {
            id: 'b_plain',
            type: 'table',
            header: false,
            rows: [['a', 'b']],
          },
          { id: 'b_call', type: 'callout', tone: 'warning', text: 'Watch\nout' },
          { id: 'b_quote', type: 'quote', text: 'A quiet\nfactory', cite: 'Notes' },
          { id: 'b_div', type: 'divider' },
          { id: 'b_code', type: 'code', language: 'ts', code: 'const x = 1' },
          { id: 'b_unknown', type: 'unknown', raw: { type: 'video' } },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'paragraph', text: 'Right' }],
            ],
          },
          {
            id: 'n_stack',
            type: 'stack',
            children: [{ id: 'b_stacked', type: 'paragraph', text: 'Stacked' }],
          },
          {
            id: 'n_grid',
            type: 'grid',
            columns: 3,
            children: [{ id: 'b_cell', type: 'paragraph', text: 'Cell' }],
          },
        ],
      },
    ],
  });
}

describe('cardToMarkdown', () => {
  it('renders every block and container as read-only markdown', () => {
    const doc = document();
    const card = doc.cards[0];
    if (!card) throw new Error('missing card');
    expect(cardToMarkdown(card, doc)).toMatchInlineSnapshot(`
      "<!-- card: c_1 -->
      <!-- accent: right, asset img_1 -->
      <!-- background: gradient #aabbcc to #ddeeff -->

      <!-- id: b_h -->
      ## Title **bold**

      <!-- id: b_p -->
      Hello {color:primary}world{/color}.

      <!-- id: b_list -->
      - One
      - Two
        - Nested

      <!-- id: b_check -->
      - [x] Done
      - [ ] Later

      <!-- id: b_num -->
      1. First
      2. Second

      <!-- id: b_img -->
      ![A leaf](https://example.com/leaf.png)
      *See a [leaf](https://example.com/leaf).*

      <!-- id: b_missing -->
      ![](missing:img_missing)

      <!-- id: b_data -->
      ![Pixels](data:…)

      <!-- id: b_table -->
      | Stage | Output |
      | --- | --- |
      | Light | ATP |

      <!-- id: b_plain -->
      |  |  |
      | --- | --- |
      | a | b |

      <!-- id: b_call -->
      > [!WARNING]
      > Watch
      > out

      <!-- id: b_quote -->
      > A quiet
      > factory
      > — Notes

      <!-- id: b_div -->
      ---

      <!-- id: b_code -->
      \`\`\`ts
      const x = 1
      \`\`\`

      <!-- id: b_unknown -->
      <!-- unsupported block: video -->

      <!-- id: n_cols columns widths=1,1 -->

      <!-- column 1/2 -->

      <!-- id: b_left -->
      Left

      <!-- column 2/2 -->

      <!-- id: b_right -->
      Right

      <!-- end n_cols -->

      <!-- id: n_stack stack -->

      <!-- id: b_stacked -->
      Stacked

      <!-- end n_stack -->

      <!-- id: n_grid grid columns=3 -->

      <!-- id: b_cell -->
      Cell

      <!-- end n_grid -->

      <!-- notes -->
      Speaker notes
      stay verbatim"
    `);
  });
});
