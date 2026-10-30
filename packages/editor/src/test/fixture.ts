import { parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';

export function editorDocument(patch?: {
  title?: string;
  cards?: LoomaDocument['cards'];
}): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_edit',
    title: patch?.title ?? 'Field notes',
    format: 'presentation',
    theme: { preset: 'clean' },
    cards: patch?.cards ?? [
      {
        id: 'c_1',
        body: [
          { id: 'b_h', type: 'heading', level: 2, text: 'Hello' },
          { id: 'b_p', type: 'paragraph', text: 'Body' },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_2', type: 'paragraph', text: 'Second' }] },
    ],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}
