import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parse';
import { getOutline } from '../read';
import fixture from '../test/fixtures/full-presentation.json' with { type: 'json' };
import { createLoomaStore } from '../store';

describe('editing scenario', () => {
  it('applies a batch, undoes it, and redoes the same outline', () => {
    const parsed = parseDocument(fixture);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const store = createLoomaStore(parsed.doc);
    const initial = store.getDocument();
    const origins: string[] = [];
    store.subscribe((_doc, change) => {
      origins.push(change.origin);
    });

    const result = store.apply(
      [
        {
          op: 'insertCard',
          card: {
            id: 'c_new',
            body: [
              { id: 'b_new_h', type: 'heading', level: 2, text: 'New card' },
              {
                id: 'n_new_cols',
                type: 'columns',
                widths: [1, 1],
                children: [
                  [{ id: 'b_new_l', type: 'paragraph', text: 'Left' }],
                  [{ id: 'b_new_r', type: 'paragraph', text: 'Right' }],
                ],
              },
            ],
          },
        },
        {
          op: 'insertNode',
          node: { id: 'b_new_call', type: 'callout', text: 'Note this' },
          at: { after: 'b_new_h' },
        },
        {
          op: 'wrapNodes',
          ids: ['b_lead', 'b_quote'],
          container: { type: 'stack', id: 'n_wrap' },
        },
        { op: 'updateNode', id: 'b_new_h', patch: { text: 'Updated heading' } },
        { op: 'deleteNode', id: 'b_quote' },
      ],
      { origin: 'ai' },
    );
    expect(result.ok).toBe(true);
    expect(origins).toEqual(['ai']);

    const outline = getOutline(store.getDocument());
    expect(outline).toMatchInlineSnapshot(`
      {
        "cardCount": 5,
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
                "id": "n_wrap",
                "preview": "[stack: 1 items]",
                "type": "stack",
              },
              {
                "depth": 1,
                "id": "b_lead",
                "preview": "Plants turn sunlight, water, and air into chemical energy.",
                "type": "paragraph",
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
          {
            "id": "c_new",
            "index": 4,
            "nodes": [
              {
                "depth": 0,
                "id": "b_new_h",
                "preview": "Updated heading",
                "type": "heading",
              },
              {
                "depth": 0,
                "id": "b_new_call",
                "preview": "Note this",
                "type": "callout",
              },
              {
                "depth": 0,
                "id": "n_new_cols",
                "preview": "[columns: 2]",
                "type": "columns",
              },
              {
                "depth": 1,
                "id": "b_new_l",
                "preview": "Left",
                "type": "paragraph",
              },
              {
                "depth": 1,
                "id": "b_new_r",
                "preview": "Right",
                "type": "paragraph",
              },
            ],
            "title": "Updated heading",
          },
        ],
        "format": "presentation",
        "id": "doc_photosynthesis",
        "title": "Introduction to Photosynthesis",
      }
    `);

    expect(store.undo()).toBe(true);
    expect(store.getDocument()).toEqual(initial);
    expect(store.redo()).toBe(true);
    expect(getOutline(store.getDocument())).toEqual(outline);
  });
});
