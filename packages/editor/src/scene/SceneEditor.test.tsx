import { LoomaEditor, type LoomaEditorHandle } from '../index';
import { findSceneElement, parseDocument } from '@lor-looma/core';
import { LoomaViewer } from '@lor-looma/viewer';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { extractParagraphsFromDom } from './EditableSceneElement';

function buildSceneEditorFixture() {
  const parsed = parseDocument({
    looma: 2,
    id: 'doc_scene_editor',
    title: '漢字樂園',
    format: 'presentation',
    assets: {
      img_hero: {
        kind: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        alt: 'Original Hero',
        width: 1536,
        height: 1024,
      },
    },
    cards: [
      {
        id: 'c_cover',
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
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.09459 },
              fill: { kind: 'color', color: '#ffffff' },
              stroke: { color: '#e3f0ff', width: 6.67 },
            },
            {
              id: 'el_pic',
              type: 'image',
              box: { x: 788, y: 195, width: 404, height: 266 },
              zIndex: 1,
              assetId: 'img_hero',
              crop: { left: 0, top: 0.00618, right: 0, bottom: 0.00618 },
              geometry: { preset: 'roundRect', cornerRadiusRatio: 0.07519 },
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
            {
              id: 'el_mixed',
              type: 'text',
              box: { x: 70, y: 340, width: 676, height: 60 },
              zIndex: 3,
              paragraphs: [
                {
                  align: 'left',
                  lineSpacing: { kind: 'multiple', value: 1.45 },
                  spaceBefore: 12,
                  spaceAfter: 8,
                  marginLeft: 16,
                  indent: -8,
                  runs: [
                    {
                      text: '學習目標',
                      fontFamily: 'Poppins',
                      fontSize: 36,
                      color: '#3d3327',
                      bold: true,
                    },
                    {
                      text: ' Learning Objectives',
                      fontFamily: 'Poppins',
                      fontSize: 20,
                      color: '#8a7e6e',
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

describe('SceneEditor: in-place text edit, image replacement, undo/redo, and save/reopen', () => {
  it('edits scene text in-place while preserving exact font/size/color, handles IME composition and Enter/paste newlines, and flushes before export', () => {
    const ref = createRef<LoomaEditorHandle>();
    const { container } = render(<LoomaEditor ref={ref} document={buildSceneEditorFixture()} />);

    const titleEl = container.querySelector('[data-lm-editor-node="el_title"]') as HTMLElement;
    expect(titleEl).not.toBeNull();

    // Click selects the scene element
    fireEvent.click(titleEl);
    expect(ref.current?.getSelection().nodeIds).toEqual(['el_title']);

    // Double-click enters in-place editing
    fireEvent.doubleClick(titleEl);
    const editorHost = container.querySelector(
      '[data-lm-scene-text-editor="el_title"]',
    ) as HTMLElement;
    expect(editorHost).not.toBeNull();

    // Sequential character-by-character typing: must NOT replace the DOM node or reset caret!
    const runSpan = editorHost.querySelector('[data-lm-run-index="0"]') as HTMLElement;
    runSpan.textContent = '漢字樂園A';
    fireEvent.input(editorHost);
    // The exact same DOM span instance must still be in the document after store.apply!
    expect(editorHost.querySelector('[data-lm-run-index="0"]')).toBe(runSpan);

    runSpan.textContent = '漢字樂園AB';
    fireEvent.input(editorHost);
    expect(editorHost.querySelector('[data-lm-run-index="0"]')).toBe(runSpan);
    expect(
      (
        findSceneElement(ref.current!.store.getDocument(), 'el_title')?.element as {
          paragraphs: { runs: { text: string }[] }[];
        }
      ).paragraphs[0]?.runs[0]?.text,
    ).toBe('漢字樂園AB');

    // Simulate IME composition: should NOT commit while composing
    fireEvent.compositionStart(editorHost);
    runSpan.textContent = '漢字新樂園';
    fireEvent.input(editorHost);
    const duringIme = findSceneElement(ref.current!.store.getDocument(), 'el_title');
    if (duringIme?.element.type === 'text') {
      expect(duringIme.element.paragraphs[0]?.runs[0]?.text).toBe('漢字樂園AB');
    }

    // Composition end + flush commits the edit while keeping Poppins / 62px / #3d3327 / bold
    fireEvent.compositionEnd(editorHost);
    const flushedDoc = ref.current!.flush();
    const afterTitle = findSceneElement(flushedDoc, 'el_title');
    expect(afterTitle?.element.type).toBe('text');
    if (afterTitle?.element.type === 'text') {
      expect(afterTitle.element.paragraphs[0]?.runs[0]).toEqual({
        text: '漢字新樂園',
        fontFamily: 'Poppins',
        fontSize: 62,
        color: '#3d3327',
        bold: true,
      });
    }

    // Also verify paragraph spacing & indent are preserved in edit mode on el_mixed
    const mixedEl = container.querySelector('[data-lm-editor-node="el_mixed"]') as HTMLElement;
    fireEvent.doubleClick(mixedEl);
    const mixedHost = container.querySelector(
      '[data-lm-scene-text-editor="el_mixed"]',
    ) as HTMLElement;
    const mixedParagraphDiv = mixedHost.querySelector(
      '[data-lm-paragraph-index="0"]',
    ) as HTMLElement;
    expect(mixedParagraphDiv.style.marginTop).toBe('12px');
    expect(mixedParagraphDiv.style.marginBottom).toBe('8px');
    expect(mixedParagraphDiv.style.paddingLeft).toBe('16px');
    expect(mixedParagraphDiv.style.textIndent).toBe('-8px');
  });

  it('preserves mixed-run styles across boundaries and splits paragraphs on Enter or multi-line paste', () => {
    const doc = buildSceneEditorFixture();
    const mixedEl = findSceneElement(doc, 'el_mixed')?.element;
    expect(mixedEl?.type).toBe('text');
    if (!mixedEl || mixedEl.type !== 'text') return;

    // Build a DOM container matching EditableSceneElement's structure with 2 mixed runs
    const host = document.createElement('div');
    host.innerHTML = `<div data-lm-paragraph-index="0"><span data-lm-run-index="0">學習新目標</span><span data-lm-run-index="1"> Updated Objectives\nSecond Line</span></div>`;

    const extracted = extractParagraphsFromDom(host, mixedEl.paragraphs);
    expect(extracted).toHaveLength(2);
    expect(extracted[0]?.runs).toEqual([
      {
        text: '學習新目標',
        fontFamily: 'Poppins',
        fontSize: 36,
        color: '#3d3327',
        bold: true,
      },
      {
        text: ' Updated Objectives',
        fontFamily: 'Poppins',
        fontSize: 20,
        color: '#8a7e6e',
      },
    ]);
    expect(extracted[1]?.runs).toEqual([
      {
        text: 'Second Line',
        fontFamily: 'Poppins',
        fontSize: 20,
        color: '#8a7e6e',
      },
    ]);
  });

  it('replaces a scene image via Inspector while preserving frame shape, box, and crop, and supports undo/redo and save/reopen', () => {
    const ref = createRef<LoomaEditorHandle>();
    const { container, unmount } = render(
      <LoomaEditor ref={ref} document={buildSceneEditorFixture()} />,
    );

    // 1. Edit title first
    const titleEl = container.querySelector('[data-lm-editor-node="el_title"]') as HTMLElement;
    fireEvent.doubleClick(titleEl);
    const editorHost = container.querySelector(
      '[data-lm-scene-text-editor="el_title"]',
    ) as HTMLElement;
    const runSpan = editorHost.querySelector('[data-lm-run-index="0"]') as HTMLElement;
    runSpan.textContent = '漢字新樂園';
    fireEvent.blur(editorHost);

    // 2. Select image element and replace image via Inspector
    const picEl = container.querySelector('[data-lm-editor-node="el_pic"]') as HTMLElement;
    fireEvent.click(picEl);
    expect(ref.current?.getSelection().nodeIds).toEqual(['el_pic']);

    const urlInput = screen.getByLabelText(/Image URL/i);
    fireEvent.change(urlInput, {
      target: {
        value:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    });
    const replaceBtn = screen.getByRole('button', { name: /Replace image/i });
    fireEvent.click(replaceBtn);

    const afterReplaceDoc = ref.current!.store.getDocument();
    const updatedPic = findSceneElement(afterReplaceDoc, 'el_pic');
    expect(updatedPic?.element.type).toBe('image');
    if (updatedPic?.element.type === 'image') {
      expect(updatedPic.element.assetId).not.toBe('img_hero');
      expect(updatedPic.element.box).toEqual({ x: 788, y: 195, width: 404, height: 266 });
      expect(updatedPic.element.crop).toEqual({
        left: 0,
        top: 0.00618,
        right: 0,
        bottom: 0.00618,
      });
      expect(updatedPic.element.geometry).toEqual({
        preset: 'roundRect',
        cornerRadiusRatio: 0.07519,
      });
    }

    // 3. Undo twice restores original image then original title; Redo twice re-applies both
    expect(ref.current?.undo()).toBe(true);
    expect(
      (
        findSceneElement(ref.current!.store.getDocument(), 'el_pic')?.element as {
          assetId?: string;
        }
      )?.assetId,
    ).toBe('img_hero');

    expect(ref.current?.undo()).toBe(true);
    const undoneTitle = findSceneElement(ref.current!.store.getDocument(), 'el_title');
    if (undoneTitle?.element.type === 'text') {
      expect(undoneTitle.element.paragraphs[0]?.runs[0]?.text).toBe('漢字樂園');
    }

    expect(ref.current?.redo()).toBe(true);
    expect(ref.current?.redo()).toBe(true);

    // 4. Export / serialize to JSON, parseDocument, and reopen in both Editor and Document-mode Viewer
    const exportedJson = JSON.stringify(ref.current!.flush(), null, 2);
    unmount();

    const reopened = parseDocument(exportedJson, { repair: false });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;

    const reopenedView = render(
      <LoomaViewer document={{ ...reopened.doc, format: 'document' }} mode="scroll" />,
    );
    expect(reopenedView.container.textContent).toContain('漢字新樂園');
    const docCard = reopenedView.container.querySelector(
      '[data-lm-card-id="c_cover"]',
    ) as HTMLElement;
    expect(docCard.style.width).toBe('1280px');
    expect(docCard.style.height).toBe('720px');
  });

  it('commits edits and enables Undo after store.load() / consecutive import while Editor is already mounted', () => {
    const ref = createRef<LoomaEditorHandle>();
    const { container } = render(<LoomaEditor ref={ref} document={buildSceneEditorFixture()} />);

    // Load a replacement scene document while Editor is already mounted (triggers change.kind === 'load')
    const replacement = parseDocument({
      looma: 2,
      id: 'doc_mixed_probe',
      title: 'Mixed run browser probe',
      format: 'presentation',
      cards: [
        {
          id: 'c_probe',
          layout: 'scene',
          scene: {
            width: 1280,
            height: 720,
            elements: [
              {
                id: 'el_probe',
                type: 'text',
                box: { x: 100, y: 100, width: 900, height: 300 },
                zIndex: 0,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                wordWrap: true,
                paragraphs: [
                  {
                    runs: [
                      { text: 'Alpha ', fontSize: 24, color: '#ff0000', bold: true },
                      { text: 'Beta', fontSize: 32, color: '#0000ff', italic: true },
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
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;

    act(() => {
      ref.current!.store.load(replacement.doc);
    });

    const probeNode = container.querySelector('[data-lm-editor-node="el_probe"]') as HTMLElement;
    expect(probeNode).not.toBeNull();
    fireEvent.doubleClick(probeNode);

    const editorHost = container.querySelector(
      '[data-lm-scene-text-editor="el_probe"]',
    ) as HTMLElement;
    expect(editorHost).not.toBeNull();

    // Step 1: Insert newline before Beta (simulating Enter at boundary)
    const run1 = editorHost.querySelector('[data-lm-run-index="1"]') as HTMLElement;
    run1.textContent = '\nBeta';
    fireEvent.input(editorHost);

    // Step 2: Type 'X' before Beta in the second commit (must still map run-index="1" to blue 32px italic!)
    run1.textContent = '\nXBeta';
    fireEvent.input(editorHost);

    // Step 3: Escape exits editing and commits
    fireEvent.keyDown(editorHost, { key: 'Escape' });
    expect(container.querySelector('[data-lm-scene-text-editor="el_probe"]')).toBeNull();

    expect(ref.current!.store.canUndo()).toBe(true);
    const updated = findSceneElement(ref.current!.flush(), 'el_probe');
    expect(updated?.element.type).toBe('text');
    if (updated?.element.type === 'text') {
      expect(updated.element.paragraphs).toEqual([
        {
          runs: [{ text: 'Alpha ', fontSize: 24, color: '#ff0000', bold: true }],
        },
        {
          runs: [{ text: 'XBeta', fontSize: 32, color: '#0000ff', italic: true }],
        },
      ]);
    }
  });
});
