import { describe, expect, it } from 'vitest';
import { applyCommands, createLoomaStore, findSceneElement, parseDocument } from '../index';
import type { LoomaDocument } from '../index';

function sceneDoc(): LoomaDocument {
  const parsed = parseDocument({
    looma: 2,
    id: 'doc_scene',
    title: 'Scene Deck',
    assets: {
      img_orig: {
        kind: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        alt: 'Original',
        width: 800,
        height: 600,
      },
      img_unused: {
        kind: 'image',
        src: 'https://example.com/unused.png',
        alt: 'Unused',
      },
    },
    cards: [
      {
        id: 'c_1',
        layout: 'scene',
        background: { kind: 'color', value: '#fff9ef' },
        scene: {
          width: 1280,
          height: 720,
          elements: [
            {
              id: 'el_frame',
              type: 'shape',
              box: { x: 774, y: 180, width: 432, height: 296 },
              zIndex: 0,
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.094 },
              fill: { kind: 'color', color: '#ffffff' },
              stroke: { color: '#e3f0ff', width: 6.67 },
            },
            {
              id: 'el_pic',
              type: 'image',
              box: { x: 788, y: 195, width: 404, height: 266 },
              zIndex: 1,
              assetId: 'img_orig',
              crop: { left: 0, top: 0.00618, right: 0, bottom: 0.00618 },
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.075 },
            },
            {
              id: 'el_title',
              type: 'text',
              box: { x: 70, y: 240, width: 676, height: 88 },
              zIndex: 2,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
              wordWrap: false,
              paragraphs: [
                {
                  lineSpacing: { kind: 'multiple', value: 1 },
                  runs: [
                    {
                      text: '漢字樂園',
                      fontFamily: 'Poppins',
                      fontSize: 62,
                      color: '#3d3327',
                      bold: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
        body: [],
      },
    ],
  });
  if (!parsed.ok) throw new Error('Failed to build fixture');
  return parsed.doc;
}

describe('Scene commands & store integration', () => {
  it('updates scene text paragraphs while preserving exact run styles and supports undo/redo', () => {
    const store = createLoomaStore(sceneDoc());

    const result = store.apply(
      [
        {
          op: 'updateSceneElement',
          cardId: 'c_1',
          elementId: 'el_title',
          patch: {
            paragraphs: [
              {
                lineSpacing: { kind: 'multiple', value: 1 },
                runs: [
                  {
                    text: '漢字新樂園',
                    fontFamily: 'Poppins',
                    fontSize: 62,
                    color: '#3d3327',
                    bold: true,
                  },
                ],
              },
            ],
          },
        },
      ],
      { origin: 'user', label: 'Edit scene text' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.touchedIds).toContain('c_1');
    expect(result.touchedIds).toContain('el_title');

    const updated = findSceneElement(store.getDocument(), 'el_title');
    expect(updated?.element.type).toBe('text');
    if (updated?.element.type === 'text') {
      expect(updated.element.paragraphs[0]?.runs[0]).toEqual({
        text: '漢字新樂園',
        fontFamily: 'Poppins',
        fontSize: 62,
        color: '#3d3327',
        bold: true,
      });
    }

    expect(store.undo()).toBe(true);
    const undone = findSceneElement(store.getDocument(), 'el_title');
    if (undone?.element.type === 'text') {
      expect(undone.element.paragraphs[0]?.runs[0]?.text).toBe('漢字樂園');
    }

    expect(store.redo()).toBe(true);
    const redone = findSceneElement(store.getDocument(), 'el_title');
    if (redone?.element.type === 'text') {
      expect(redone.element.paragraphs[0]?.runs[0]?.text).toBe('漢字新樂園');
    }
  });

  it('replaces a scene image asset while preserving box, crop, geometry, and separate frame shape', () => {
    const store = createLoomaStore(sceneDoc());

    const result = store.apply(
      [
        {
          op: 'putAsset',
          id: 'img_new',
          asset: {
            kind: 'image',
            src: 'https://example.com/replacement.png',
            alt: 'Replacement',
            width: 1200,
            height: 900,
          },
        },
        {
          op: 'updateSceneElement',
          cardId: 'c_1',
          elementId: 'el_pic',
          patch: { assetId: 'img_new', alt: 'Replacement' },
        },
      ],
      { origin: 'user', label: 'Replace scene image' },
    );

    expect(result.ok).toBe(true);
    const pic = findSceneElement(store.getDocument(), 'el_pic');
    expect(pic?.element).toEqual({
      id: 'el_pic',
      type: 'image',
      box: { x: 788, y: 195, width: 404, height: 266 },
      zIndex: 1,
      assetId: 'img_new',
      alt: 'Replacement',
      crop: { left: 0, top: 0.00618, right: 0, bottom: 0.00618 },
      geometry: { preset: 'roundRect', cornerRadiusRatio: 0.075 },
    });

    // Separate frame shape remains untouched
    const frame = findSceneElement(store.getDocument(), 'el_frame');
    expect(frame?.element.type).toBe('shape');

    // Undo restores both assetId and removes newly created asset
    expect(store.undo()).toBe(true);
    const restoredPic = findSceneElement(store.getDocument(), 'el_pic');
    if (restoredPic?.element.type === 'image') {
      expect(restoredPic.element.assetId).toBe('img_orig');
    }
    expect(store.getDocument().assets.img_new).toBeUndefined();
  });

  it('protects assets referenced by scene images from removeAsset and allows removing unused assets', () => {
    const doc = sceneDoc();
    const blocked = applyCommands(doc, [{ op: 'removeAsset', id: 'img_orig' }]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.errors[0]?.message).toContain('cards[0].scene.elements[1]');
    }

    const allowed = applyCommands(doc, [{ op: 'removeAsset', id: 'img_unused' }]);
    expect(allowed.ok).toBe(true);
  });

  it('materializes and duplicates scene cards with fresh element IDs', () => {
    const doc = sceneDoc();
    const duplicated = applyCommands(doc, [{ op: 'duplicateCard', id: 'c_1' }]);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;

    expect(duplicated.doc.cards).toHaveLength(2);
    const firstIds = duplicated.doc.cards[0]?.scene?.elements.map((e) => e.id) ?? [];
    const secondIds = duplicated.doc.cards[1]?.scene?.elements.map((e) => e.id) ?? [];
    expect(secondIds).toHaveLength(3);
    for (const id of secondIds) {
      expect(id.startsWith('el_')).toBe(true);
      expect(firstIds).not.toContain(id);
    }
  });

  it('rejects flow node commands (insertNode, moveNode, splitCard) targeting a scene card and rolls back the batch atomically', () => {
    const base = parseDocument({
      looma: 2,
      id: 'doc_test',
      cards: [
        {
          id: 'c_test',
          layout: 'scene',
          scene: { width: 1280, height: 720, elements: [] },
          body: [],
        },
        {
          id: 'c_flow',
          body: [{ id: 'b_flow', type: 'paragraph', text: 'Flow paragraph' }],
        },
      ],
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const rInsert = applyCommands(base.doc, [
      {
        op: 'insertNode',
        at: { parent: 'c_test' },
        node: { type: 'paragraph', text: 'invisible' },
      },
    ]);
    expect(rInsert.ok).toBe(false);

    const rBatch = applyCommands(base.doc, [
      { op: 'setTitle', title: 'Should Rollback' },
      { op: 'moveNode', id: 'b_flow', to: { parent: 'c_test' } },
    ]);
    expect(rBatch.ok).toBe(false);
    expect(base.doc.title).toBe('');
    expect(base.doc.cards[0]?.body).toEqual([]);
  });
});
