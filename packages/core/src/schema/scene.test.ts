import { describe, expect, it } from 'vitest';
import {
  LOOMA_SCHEMA_VERSION,
  LoomaCardSchema,
  LoomaDocumentSchema,
  LoomaSceneSchema,
  assertSupportedSchemaVersion,
  findSceneElement,
  parseDocument,
  validateDocumentSemantics,
} from '../index';
import { migrateDocument } from '../parse/migrate';
import { cloneJson } from '../parse/repair';
import type { ParseIssue } from '../parse/issues';
import { collectIds } from '../tree/tree';

function checkVersionSupportedByV1(raw: Record<string, unknown>): ParseIssue | undefined {
  const V1_SCHEMA_VERSION = 1;
  const warnings: ParseIssue[] = [];
  const doc = cloneJson(raw);
  if (typeof doc.looma === 'number' && doc.looma > V1_SCHEMA_VERSION) {
    return {
      path: 'looma',
      message: `document uses schema version ${doc.looma}, but this library only supports up to ${V1_SCHEMA_VERSION}`,
    };
  }
  return migrateDocument(doc, true, warnings);
}

describe('looma:2 Scene Schema & Version Contract', () => {
  it('upgrades LOOMA_SCHEMA_VERSION to 2 and migrates v1 documents losslessly', () => {
    expect(LOOMA_SCHEMA_VERSION).toBe(2);

    const v1Doc = {
      looma: 1,
      id: 'doc_v1',
      title: 'Legacy Deck',
      format: 'presentation',
      cards: [
        {
          id: 'c_1',
          body: [{ id: 'b_1', type: 'heading', level: 1, text: 'Hello v1' }],
        },
      ],
    };

    const parsed = parseDocument(v1Doc, { repair: false });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.looma).toBe(2);
    expect(parsed.doc.cards[0]?.body).toEqual([
      { id: 'b_1', type: 'heading', level: 1, text: 'Hello v1' },
    ]);
    expect(parsed.doc.cards[0]?.scene).toBeUndefined();
  });

  it('explicitly rejects looma:2 scene documents in a frozen v1 consumer and rejects looma:3 in v2', () => {
    const v2SceneDoc = {
      looma: 2,
      id: 'doc_scene',
      title: 'Scene Deck',
      cards: [
        {
          id: 'c_1',
          layout: 'scene',
          scene: {
            width: 1280,
            height: 720,
            elements: [
              {
                id: 'el_1',
                type: 'text',
                box: { x: 40, y: 50, width: 400, height: 80 },
                zIndex: 0,
                paragraphs: [{ runs: [{ text: 'Cover Title', fontSize: 48, color: '#3d3327' }] }],
              },
            ],
          },
          body: [],
        },
      ],
    };

    // 1. Version check for a v1 consumer rejects looma: 2 immediately before card parsing
    const v1Issue = checkVersionSupportedByV1(v2SceneDoc);
    expect(v1Issue).toEqual({
      path: 'looma',
      message: 'document uses schema version 2, but this library only supports up to 1',
    });

    // 2. assertSupportedSchemaVersion helper also enforces maxVersion
    expect(assertSupportedSchemaVersion(v2SceneDoc, 1)).toEqual({
      path: 'looma',
      message: 'document uses schema version 2, but this library only supports up to 1',
    });

    // 3. Current v2 migrateDocument / parseDocument rejects looma: 3
    const warnings: ParseIssue[] = [];
    expect(migrateDocument({ looma: 3, id: 'doc_future' }, true, warnings)).toEqual({
      path: 'looma',
      message: 'document uses schema version 3, but this library only supports up to 2',
    });
    expect(parseDocument({ looma: 3, id: 'doc_future' })).toEqual({
      ok: false,
      errors: [
        {
          path: 'looma',
          message: 'document uses schema version 3, but this library only supports up to 2',
        },
      ],
    });
  });

  it('validates 16:9, 4:3, and custom aspect ratio scenes with negative bleed coordinates', () => {
    for (const size of [
      { width: 1280, height: 720 },
      { width: 960, height: 720 },
      { width: 1080, height: 1350 },
    ]) {
      const parsed = LoomaSceneSchema.safeParse({
        width: size.width,
        height: size.height,
        elements: [
          {
            id: 'el_bleed',
            type: 'shape',
            box: { x: -100, y: -150, width: 470, height: 470, rotation: 0 },
            zIndex: 0,
            geometry: { preset: 'roundRect', cornerRadiusRatio: 0.5 },
            fill: { kind: 'color', color: '#fbbf24', opacity: 0.2 },
          },
        ],
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('enforces canonical scene/flow card state and rejects contradictory layout/scene combinations', () => {
    // Valid scene card
    const validScene = LoomaCardSchema.safeParse({
      id: 'c_1',
      layout: 'scene',
      scene: { width: 1280, height: 720, elements: [] },
      body: [],
    });
    expect(validScene.success).toBe(true);

    // layout: 'scene' without scene must fail
    const missingScene = parseDocument({
      looma: 2,
      id: 'doc_1',
      cards: [{ id: 'c_1', layout: 'scene', body: [] }],
    });
    expect(missingScene.ok).toBe(false);

    // layout: 'flow' with scene present must fail
    const flowWithScene = parseDocument({
      looma: 2,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          layout: 'flow',
          scene: { width: 1280, height: 720, elements: [] },
          body: [],
        },
      ],
    });
    expect(flowWithScene.ok).toBe(false);

    // layout: 'scene' with non-empty flow body must fail
    const sceneWithBody = parseDocument({
      looma: 2,
      id: 'doc_1',
      cards: [
        {
          id: 'c_1',
          layout: 'scene',
          scene: { width: 1280, height: 720, elements: [] },
          body: [{ id: 'b_1', type: 'paragraph', text: 'conflict' }],
        },
      ],
    });
    expect(sceneWithBody.ok).toBe(false);
  });

  it('does not silently strip a malformed scene or missing elements/runs into an empty scene during repair', () => {
    const brokenSceneDoc = {
      looma: 2,
      id: 'doc_bad_scene',
      cards: [
        {
          id: 'c_1',
          layout: 'scene',
          scene: { width: -100, height: 0, elements: 'not-an-array' },
        },
      ],
    };
    expect(parseDocument(brokenSceneDoc, { repair: true }).ok).toBe(false);

    // Missing `elements` array on scene must fail rather than defaulting to []
    const missingElementsDoc = {
      looma: 2,
      id: 'doc_missing_elements',
      cards: [
        {
          id: 'c_1',
          layout: 'scene',
          scene: { width: 1280, height: 720 },
        },
      ],
    };
    expect(parseDocument(missingElementsDoc, { repair: true }).ok).toBe(false);

    // Missing `runs` array on paragraph must fail rather than defaulting to []
    const missingRunsDoc = {
      looma: 2,
      id: 'doc_missing_runs',
      cards: [
        {
          id: 'c_1',
          layout: 'scene',
          scene: {
            width: 1280,
            height: 720,
            elements: [
              {
                id: 'el_t',
                type: 'text',
                box: { x: 0, y: 0, width: 100, height: 40 },
                zIndex: 0,
                paragraphs: [{ align: 'left' }],
              },
            ],
          },
        },
      ],
    };
    expect(parseDocument(missingRunsDoc, { repair: true }).ok).toBe(false);
  });

  it('enforces crop bounds (left+right < 1, top+bottom < 1), safe hrefs, and finite dimensions', () => {
    const badCrop = LoomaSceneSchema.safeParse({
      width: 1280,
      height: 720,
      elements: [
        {
          id: 'el_img',
          type: 'image',
          box: { x: 0, y: 0, width: 200, height: 200 },
          zIndex: 0,
          assetId: 'img_1',
          crop: { left: 0.6, right: 0.5, top: 0, bottom: 0 },
        },
      ],
    });
    expect(badCrop.success).toBe(false);

    const badHref = LoomaSceneSchema.safeParse({
      width: 1280,
      height: 720,
      elements: [
        {
          id: 'el_txt',
          type: 'text',
          box: { x: 0, y: 0, width: 200, height: 80 },
          zIndex: 0,
          paragraphs: [
            {
              runs: [{ text: 'evil', href: 'javascript:alert(1)' }],
            },
          ],
        },
      ],
    });
    expect(badHref.success).toBe(false);
  });

  it('checks scene element ID uniqueness, asset references, and findSceneElement/collectIds', () => {
    const doc = LoomaDocumentSchema.parse({
      looma: 2,
      id: 'doc_1',
      assets: {
        img_valid: { kind: 'image', src: 'https://example.com/a.png' },
      },
      cards: [
        {
          id: 'c_1',
          layout: 'scene',
          scene: {
            width: 1280,
            height: 720,
            elements: [
              {
                id: 'el_dup',
                type: 'image',
                box: { x: 10, y: 20, width: 300, height: 200 },
                zIndex: 0,
                assetId: 'img_missing',
              },
              {
                id: 'el_dup',
                type: 'text',
                box: { x: 10, y: 240, width: 300, height: 60 },
                zIndex: 1,
                paragraphs: [{ runs: [{ text: 'Hello' }] }],
              },
            ],
          },
        },
      ],
    });

    const issues = validateDocumentSemantics(doc);
    expect(issues).toEqual([
      {
        path: 'cards[0].scene.elements[0].assetId',
        message: 'references missing asset "img_missing"',
      },
      {
        path: 'cards[0].scene.elements[1]',
        message: 'duplicate id "el_dup" (first used at cards[0].scene.elements[0])',
      },
    ]);

    const found = findSceneElement(doc, 'el_dup');
    expect(found?.cardId).toBe('c_1');
    expect(found?.path).toBe('cards[0].scene.elements[0]');
    expect(collectIds(doc).has('el_dup')).toBe(true);
  });
});
