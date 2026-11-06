import { parseDocument } from '@lor-looma/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoomaCardView, LoomaViewer, cardLogicalSize } from '../index';

function buildSceneDocument(
  format: 'presentation' | 'document' = 'presentation',
  width = 1280,
  height = 720,
) {
  const parsed = parseDocument({
    looma: 2,
    id: 'doc_scene_view',
    title: 'Scene View Test',
    format,
    assets: {
      img_hero: {
        kind: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        alt: 'Hero Illustration',
      },
    },
    cards: [
      {
        id: 'c_scene_1',
        layout: 'scene',
        background: { kind: 'color', value: '#fff9ef' },
        scene: {
          width,
          height,
          elements: [
            {
              id: 'el_circle',
              type: 'shape',
              box: { x: 930, y: -150, width: 470, height: 470 },
              zIndex: 0,
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.5 },
              fill: { kind: 'color', color: '#fbbf24', opacity: 0.2 },
            },
            {
              id: 'el_frame',
              type: 'shape',
              box: { x: 774, y: 180, width: 432, height: 296 },
              zIndex: 1,
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.094 },
              fill: { kind: 'color', color: '#ffffff' },
              stroke: { color: '#e3f0ff', width: 6.67, opacity: 0.5 },
            },
            {
              id: 'el_line',
              type: 'shape',
              box: { x: 70, y: 395, width: 92, height: 2 },
              zIndex: 4,
              geometry: { preset: 'line' },
              stroke: { color: '#fbbf24', width: 2, opacity: 0.8 },
            },
            {
              id: 'el_image',
              type: 'image',
              box: { x: 788, y: 195, width: 404, height: 266 },
              zIndex: 2,
              assetId: 'img_hero',
              crop: { left: 0, top: 0.1, right: 0, bottom: 0.1 },
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.075 },
            },
            {
              id: 'el_text',
              type: 'text',
              box: { x: 70, y: 240, width: 676, height: 88 },
              zIndex: 3,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
              verticalAlign: 'middle',
              wordWrap: false,
              paragraphs: [
                {
                  align: 'left',
                  lineSpacing: { kind: 'multiple', value: 1.45 },
                  runs: [
                    {
                      text: '漢字樂園',
                      fontFamily: 'Poppins',
                      fontSize: 62,
                      color: '#3d3327',
                      bold: true,
                    },
                    {
                      text: ' P3',
                      fontFamily: 'Poppins',
                      fontSize: 24,
                      color: '#1d4ed8',
                      italic: true,
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
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.doc;
}

describe('SceneView & cardLogicalSize', () => {
  it('computes logical size from card.scene for both presentation and document modes, supporting 16:9, 4:3, and custom ratios', () => {
    const doc16x9 = buildSceneDocument('presentation', 1280, 720);
    expect(cardLogicalSize(doc16x9.cards[0], 'presentation')).toEqual({ width: 1280, height: 720 });
    expect(cardLogicalSize(doc16x9.cards[0], 'document')).toEqual({ width: 1280, height: 720 });

    const doc4x3 = buildSceneDocument('document', 960, 720);
    expect(cardLogicalSize(doc4x3.cards[0], 'presentation')).toEqual({ width: 960, height: 720 });
    expect(cardLogicalSize(doc4x3.cards[0], 'document')).toEqual({ width: 960, height: 720 });
  });

  it('renders scene shapes, cropped images, and exact multi-run text in LoomaCardView', () => {
    const doc = buildSceneDocument('presentation', 1280, 720);
    const { container } = render(<LoomaCardView card={doc.cards[0]!} document={doc} />);

    const sceneRoot = container.querySelector('[data-lm-scene]');
    expect(sceneRoot).not.toBeNull();

    const circle = container.querySelector('[data-lm-scene-element="el_circle"]') as HTMLElement;
    expect(circle).not.toBeNull();
    expect(circle.style.left).toBe('930px');
    expect(circle.style.top).toBe('-150px');
    expect(circle.style.opacity).toBe('');
    expect(circle.style.backgroundColor).toBe('rgba(251, 191, 36, 0.2)');

    const frame = container.querySelector('[data-lm-scene-element="el_frame"]') as HTMLElement;
    expect(frame.style.borderColor).toBe('rgba(227, 240, 255, 0.5)');

    const lineSvg = container.querySelector('svg[data-lm-scene-element="el_line"]');
    expect(lineSvg).not.toBeNull();
    const lineTag = lineSvg?.querySelector('line');
    expect(lineTag?.getAttribute('stroke')).toBe('rgba(251, 191, 36, 0.8)');

    const imgEl = container.querySelector(
      '[data-lm-scene-element="el_image"] img',
    ) as HTMLImageElement;
    expect(imgEl).not.toBeNull();
    expect(imgEl.style.height).toBe('125%');

    const textEl = container.querySelector('[data-lm-scene-element="el_text"]') as HTMLElement;
    expect(textEl).not.toBeNull();
    expect(textEl.textContent).toBe('漢字樂園 P3');
    const runs = textEl.querySelectorAll('[data-lm-scene-run]');
    expect(runs).toHaveLength(2);
    expect((runs[0] as HTMLElement).style.fontSize).toBe('62px');
    expect((runs[1] as HTMLElement).style.fontSize).toBe('24px');
  });

  it('renders full proportional scene cards in document mode (both scroll and present views) without ignoring or clipping height', () => {
    const doc = buildSceneDocument('document', 960, 720);
    const scrollView = render(<LoomaViewer document={doc} mode="scroll" />);
    const scrollCard = scrollView.container.querySelector(
      '[data-lm-card-id="c_scene_1"]',
    ) as HTMLElement;
    expect(scrollCard).not.toBeNull();
    expect(scrollCard.style.width).toBe('960px');
    expect(scrollCard.style.height).toBe('720px');

    const presentView = render(<LoomaViewer document={doc} mode="present" />);
    const presentCard = presentView.container.querySelector(
      '[data-lm-card-id="c_scene_1"]',
    ) as HTMLElement;
    expect(presentCard).not.toBeNull();
    expect(presentCard.style.width).toBe('960px');
    expect(presentCard.style.height).toBe('720px');
  });
});
