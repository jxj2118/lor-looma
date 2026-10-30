import { createLoomaStore, findNode, parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { enUS } from '../i18n/en-US';
import { getCatalog } from './catalog';
import { buildInsert, insertionDepth } from './insertNode';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_insert',
    title: 'Insert',
    cards: [
      {
        id: 'c_1',
        body: [
          { id: 'b_p', type: 'paragraph', text: '' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [
                {
                  id: 'n_stack',
                  type: 'stack',
                  children: [{ id: 'b_inner', type: 'paragraph', text: 'Inner' }],
                },
              ],
            ],
          },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

describe('buildInsert', () => {
  const heading = getCatalog(enUS).find((item) => item.id === 'heading2');
  const columns = getCatalog(enUS).find((item) => item.id === 'columns2');

  it('reuses the replaced id and points next at a container child', () => {
    const doc = document();
    expect(insertionDepth(doc, { kind: 'after', nodeId: 'b_left' })).toBe(1);
    expect(insertionDepth(doc, { kind: 'after', nodeId: 'b_inner' })).toBe(2);
    const replaced = buildInsert(doc, { kind: 'replace', nodeId: 'b_p' }, heading?.build());
    const store = createLoomaStore(doc);
    expect(store.apply(replaced.commands, { origin: 'user' }).ok).toBe(true);
    expect(findNode(store.getDocument(), 'b_p')?.node).toMatchObject({ type: 'heading', level: 2 });
    expect(replaced.next).toMatchObject({ nodeId: 'b_p', slot: 'text', caret: 'start' });

    const inserted = buildInsert(doc, { kind: 'after', nodeId: 'b_p' }, columns?.build());
    const after = createLoomaStore(doc);
    expect(after.apply(inserted.commands, { origin: 'user' }).ok).toBe(true);
    expect(inserted.next?.slot).toBe('text');
    const child = inserted.next ? findNode(after.getDocument(), inserted.next.nodeId) : null;
    expect(child?.node.type).toBe('paragraph');

    const intoCard = buildInsert(document(), { kind: 'card', cardId: 'c_1' }, heading?.build());
    const cardStore = createLoomaStore(document());
    expect(cardStore.apply(intoCard.commands, { origin: 'user' }).ok).toBe(true);
    expect(cardStore.getDocument().cards[0]?.body.at(-1)).toMatchObject({ type: 'heading' });
  });

  it('has nowhere to edit after a divider or image, and walks into a grid', () => {
    const doc = document();
    const catalog = getCatalog(enUS);
    const divider = catalog.find((item) => item.id === 'divider');
    const image = catalog.find((item) => item.id === 'image');
    const grid = catalog.find((item) => item.id === 'grid2');
    expect(buildInsert(doc, { kind: 'after', nodeId: 'b_p' }, divider?.build()).next).toBeNull();
    const withImage = buildInsert(doc, { kind: 'after', nodeId: 'b_p' }, image?.build('asset_1'));
    expect(withImage.next).toBeNull();
    expect(withImage.commands[0]).toMatchObject({
      op: 'insertNode',
      node: { type: 'image', assetId: 'asset_1' },
    });
    const inserted = buildInsert(doc, { kind: 'card', cardId: 'c_1' }, grid?.build());
    expect(inserted.next?.slot).toBe('text');
    expect(insertionDepth(doc, { kind: 'after', nodeId: 'missing' })).toBe(0);
    expect(insertionDepth(doc, { kind: 'card', cardId: 'c_1' })).toBe(0);
    const missing = buildInsert(doc, { kind: 'after', nodeId: 'missing' }, divider?.build());
    expect(missing.commands[0]).toMatchObject({ op: 'insertNode' });
  });
});
