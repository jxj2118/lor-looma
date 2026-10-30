import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { getOutline } from './outline';

function document(cards: LoomaDocument['cards']): LoomaDocument {
  const parsed = parseDocument({ looma: 1, id: 'doc_1', title: 'Notes', cards });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.doc;
}

describe('getOutline', () => {
  it('matches the photosynthesis fixture', () => {
    const parsed = parseDocument(fixture);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    expect(getOutline(parsed.doc)).toMatchInlineSnapshot(`
      {
        "cardCount": 4,
        "cards": [
          {
            "id": "c_title",
            "index": 0,
            "nodes": [
              {
                "depth": 0,
                "id": "b_title",
                "preview": "Introduction to Photosynthesis",
                "type": "heading",
              },
              {
                "depth": 0,
                "id": "b_lead",
                "preview": "Plants turn sunlight, water, and air into chemical energy.",
                "type": "paragraph",
              },
              {
                "depth": 0,
                "id": "b_quote",
                "preview": "A leaf is a quiet factory that runs on light. — Classroom no…",
                "type": "quote",
              },
            ],
            "title": "Introduction to Photosynthesis",
          },
          {
            "id": "c_process",
            "index": 1,
            "nodes": [
              {
                "depth": 0,
                "id": "b_process_heading",
                "preview": "The short version",
                "type": "heading",
              },
              {
                "depth": 0,
                "id": "n_process_stack",
                "preview": "[stack: 1 items]",
                "type": "stack",
              },
              {
                "depth": 1,
                "id": "n_process_columns",
                "preview": "[columns: 2]",
                "type": "columns",
              },
              {
                "depth": 2,
                "id": "b_overview",
                "preview": "Carbon dioxide and water, plus light, become glucose and oxy…",
                "type": "paragraph",
              },
              {
                "depth": 2,
                "id": "b_steps",
                "preview": "Capture light; Split water; Release oxygen; Keep the electro…",
                "type": "list",
              },
              {
                "depth": 2,
                "id": "b_leaf",
                "preview": "[image] See a diagram of a leaf.",
                "type": "image",
              },
            ],
            "title": "The short version",
          },
          {
            "id": "c_inside",
            "index": 2,
            "nodes": [
              {
                "depth": 0,
                "id": "b_where",
                "preview": "Where it happens",
                "type": "heading",
              },
              {
                "depth": 0,
                "id": "b_chlorophyll",
                "preview": "Chlorophyll lives in chloroplasts, mostly in the mesophyll o…",
                "type": "callout",
              },
              {
                "depth": 0,
                "id": "n_organelles",
                "preview": "[grid: 2 columns, 2 items]",
                "type": "grid",
              },
              {
                "depth": 1,
                "id": "b_light_reactions",
                "preview": "Light reactions sit in the thylakoid membrane.",
                "type": "paragraph",
              },
              {
                "depth": 1,
                "id": "b_checklist",
                "preview": "Thylakoids; Stroma",
                "type": "list",
              },
              {
                "depth": 0,
                "id": "b_rule",
                "preview": "[divider]",
                "type": "divider",
              },
              {
                "depth": 0,
                "id": "b_stages",
                "preview": "Stage | Location | Output / Light reactions | Thylakoid | AT…",
                "type": "table",
              },
              {
                "depth": 0,
                "id": "b_equation",
                "preview": "[code] 6 CO2 + 6 H2O + light -> C6H12O6 + 6 O2",
                "type": "code",
              },
            ],
            "title": "Where it happens",
          },
          {
            "id": "c_review",
            "index": 3,
            "nodes": [
              {
                "depth": 0,
                "id": "b_review_heading",
                "preview": "Check your understanding",
                "type": "heading",
              },
              {
                "depth": 0,
                "id": "b_question",
                "preview": "Why do leaves look green if they use other colors of light?",
                "type": "paragraph",
              },
              {
                "depth": 0,
                "id": "b_answers",
                "preview": "Green light is reflected; Other colors are absorbed",
                "type": "list",
              },
            ],
            "title": "Check your understanding",
          },
        ],
        "format": "presentation",
        "id": "doc_photosynthesis",
        "title": "Introduction to Photosynthesis",
      }
    `);
  });

  it('uses the first heading, then the first paragraph, then an empty title', () => {
    const heading = document([
      {
        id: 'c_1',
        body: [
          { id: 'b_p', type: 'paragraph', text: 'Not the title' },
          { id: 'b_h', type: 'heading', level: 2, text: 'Actual **title**' },
        ],
      },
    ]);
    expect(getOutline(heading).cards[0]?.title).toBe('Actual title');

    const paragraph = document([
      {
        id: 'c_1',
        body: [{ id: 'b_p', type: 'paragraph', text: `x${'y'.repeat(50)}` }],
      },
    ]);
    expect(getOutline(paragraph).cards[0]?.title).toBe(`x${'y'.repeat(39)}`);

    const empty = document([{ id: 'c_1', body: [{ id: 'b_1', type: 'divider' }] }]);
    expect(getOutline(empty).cards[0]?.title).toBe('');
  });
});
