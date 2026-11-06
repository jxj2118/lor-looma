import type {
  LoomaSceneElement,
  SceneParagraph,
  SceneTextElement,
  SceneTextRun,
} from '@lor-looma/core';
import {
  fontStackForScene,
  paragraphStyleForScene,
  runStyleForScene,
  textContainerStyleForScene,
  type RenderSceneElementInfo,
} from '@lor-looma/viewer';
import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { useEditorContext, useViewState } from '../state/viewState';

function cloneRunStyle(run: SceneTextRun | undefined): Omit<SceneTextRun, 'text'> {
  if (!run) return {};
  const copy: Partial<SceneTextRun> = { ...run };
  delete copy.text;
  return copy;
}

function cloneParagraphMeta(paragraph: SceneParagraph): Omit<SceneParagraph, 'runs'> {
  const copy: Partial<SceneParagraph> = { ...paragraph };
  delete copy.runs;
  return copy;
}

function splitRunsByNewline(runs: SceneTextRun[]): SceneTextRun[][] {
  const lines: SceneTextRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split(/\r?\n/);
    const style = cloneRunStyle(run);
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      lines[lines.length - 1]!.push({ ...style, text: part });
    });
  }
  return lines.map((line) => {
    const nonEmpty = line.filter((r) => r.text.length > 0);
    if (nonEmpty.length > 0) return nonEmpty;
    const fallbackStyle = cloneRunStyle(runs[0]);
    return [{ ...fallbackStyle, text: '' }];
  });
}

function collectRunsFromParagraphDom(
  node: Node,
  templateRuns: readonly SceneTextRun[],
  inheritedRunIndex: number,
  out: { runIndex: number; text: string }[],
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = (node.nodeValue ?? '').replace(/\u200B/g, '');
    if (value.length > 0) {
      out.push({ runIndex: inheritedRunIndex, text: value });
    }
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.getAttribute('data-lm-scene-bullet') !== null) {
    return;
  }
  if (node.tagName === 'BR') {
    out.push({ runIndex: inheritedRunIndex, text: '\n' });
    return;
  }
  const attrRun = node.getAttribute('data-lm-run-index');
  const nextIndex =
    attrRun !== null && Number.isInteger(Number(attrRun))
      ? Math.max(0, Math.min(templateRuns.length - 1, Number(attrRun)))
      : inheritedRunIndex;

  for (const child of Array.from(node.childNodes)) {
    collectRunsFromParagraphDom(child, templateRuns, nextIndex, out);
  }
}

/**
 * Extracts `SceneParagraph[]` from the live contentEditable DOM while preserving
 * each run's exact font/size/color/bold/italic and paragraph attributes across
 * run boundaries and newline splits.
 */
export function extractParagraphsFromDom(
  host: HTMLElement,
  originalParagraphs: readonly SceneParagraph[],
): SceneParagraph[] {
  const fallbackParagraph: SceneParagraph = originalParagraphs[0] ?? {
    runs: [{ text: '' }],
  };
  const paragraphNodes = Array.from(
    host.querySelectorAll<HTMLElement>('[data-lm-paragraph-index]'),
  );

  if (paragraphNodes.length === 0) {
    const rawText = (host.textContent ?? '').replace(/\u200B/g, '');
    const baseRun = cloneRunStyle(fallbackParagraph.runs[0]);
    const pMeta = cloneParagraphMeta(fallbackParagraph);
    return rawText.split(/\r?\n/).map((line) => ({
      ...pMeta,
      runs: [{ ...baseRun, text: line }],
    }));
  }

  const result: SceneParagraph[] = [];

  paragraphNodes.forEach((pNode, domIndex) => {
    const rawAttr = pNode.getAttribute('data-lm-paragraph-index');
    const pIndex =
      rawAttr !== null && Number.isInteger(Number(rawAttr)) ? Number(rawAttr) : domIndex;
    const templateP =
      originalParagraphs[Math.min(pIndex, originalParagraphs.length - 1)] ?? fallbackParagraph;
    const templateRuns = templateP.runs.length > 0 ? templateP.runs : [{ text: '' }];

    const pieces: { runIndex: number; text: string }[] = [];
    collectRunsFromParagraphDom(pNode, templateRuns, 0, pieces);

    const mergedRuns: SceneTextRun[] = [];
    for (const piece of pieces) {
      const style = cloneRunStyle(templateRuns[piece.runIndex] ?? templateRuns[0]);
      const prev = mergedRuns[mergedRuns.length - 1];
      if (prev && JSON.stringify(cloneRunStyle(prev)) === JSON.stringify(style)) {
        prev.text += piece.text;
      } else {
        mergedRuns.push({ ...style, text: piece.text });
      }
    }

    if (mergedRuns.length === 0) {
      const baseStyle = cloneRunStyle(templateRuns[0]);
      mergedRuns.push({ ...baseStyle, text: '' });
    }

    const pProps = cloneParagraphMeta(templateP);
    const splitLines = splitRunsByNewline(mergedRuns);
    for (const lineRuns of splitLines) {
      result.push({
        ...pProps,
        runs: lineRuns,
      });
    }
  });

  return result.length > 0 ? result : [fallbackParagraph];
}

function applyInlineStylesToDomNode(target: HTMLElement, styleObj: CSSProperties): void {
  Object.assign(target.style, styleObj);
}

function populateHostDom(host: HTMLElement, paragraphs: readonly SceneParagraph[]): void {
  host.replaceChildren();
  paragraphs.forEach((paragraph, pIndex) => {
    const pDiv = document.createElement('div');
    pDiv.setAttribute('data-lm-paragraph-index', String(pIndex));
    pDiv.style.margin = '0';
    pDiv.style.padding = '0';
    // Apply paragraphStyleForScene AFTER margin/padding reset so spaceBefore/After/marginLeft/indent are preserved!
    applyInlineStylesToDomNode(pDiv, paragraphStyleForScene(paragraph));

    if (paragraph.bullet?.kind === 'char') {
      const bulletSpan = document.createElement('span');
      bulletSpan.setAttribute('data-lm-scene-bullet', '');
      bulletSpan.setAttribute('contenteditable', 'false');
      bulletSpan.style.display = 'inline-block';
      bulletSpan.style.marginRight = '0.35em';
      if (paragraph.bullet.color) bulletSpan.style.color = paragraph.bullet.color;
      if (paragraph.bullet.fontFamily) {
        bulletSpan.style.fontFamily = fontStackForScene(paragraph.bullet.fontFamily);
      }
      bulletSpan.textContent = paragraph.bullet.char;
      pDiv.appendChild(bulletSpan);
    } else if (paragraph.bullet?.kind === 'number') {
      const bulletSpan = document.createElement('span');
      bulletSpan.setAttribute('data-lm-scene-bullet', '');
      bulletSpan.setAttribute('contenteditable', 'false');
      bulletSpan.style.display = 'inline-block';
      bulletSpan.style.marginRight = '0.35em';
      bulletSpan.textContent = `${(paragraph.bullet.startAt ?? 1) + pIndex}.`;
      pDiv.appendChild(bulletSpan);
    }

    paragraph.runs.forEach((run, rIndex) => {
      const span = document.createElement('span');
      span.setAttribute('data-lm-run-index', String(rIndex));
      applyInlineStylesToDomNode(span, runStyleForScene(run));
      span.textContent = run.text;
      pDiv.appendChild(span);
    });

    host.appendChild(pDiv);
  });
}

function placeCaret(host: HTMLElement, caret: 'start' | 'end'): void {
  host.focus();
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return;
  const selection = window.getSelection();
  if (!selection) return;
  try {
    const range = document.createRange();
    range.selectNodeContents(host);
    range.collapse(caret === 'start');
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Ignore selection errors in headless environments
  }
}

function SceneTextInlineEditor({ cardId, element }: { cardId: string; element: SceneTextElement }) {
  const {
    store,
    viewState,
    bindFinishEditing,
    registerPendingFlush,
    suppressCommitRef,
    editEpoch,
  } = useEditorContext();
  const hostRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const initialParagraphsRef = useRef<readonly SceneParagraph[]>(element.paragraphs);
  const committedJsonRef = useRef(JSON.stringify(element.paragraphs));
  const epochRef = useRef(editEpoch);

  const commitFromDom = useCallback(
    (exitAfter: boolean) => {
      if (suppressCommitRef.current) {
        if (exitAfter) viewState.set({ editing: null });
        return;
      }
      const host = hostRef.current;
      if (!host) {
        if (exitAfter) viewState.set({ editing: null });
        return;
      }
      const nextParagraphs = extractParagraphsFromDom(host, initialParagraphsRef.current);
      const nextJson = JSON.stringify(nextParagraphs);
      if (nextJson !== committedJsonRef.current) {
        committedJsonRef.current = nextJson;
        store.apply(
          [
            {
              op: 'updateSceneElement',
              cardId,
              elementId: element.id,
              patch: { paragraphs: nextParagraphs },
            },
          ],
          {
            origin: 'user',
            label: 'Edit scene text',
            mergeKey: `scene-text:${element.id}`,
          },
        );
      }
      if (exitAfter) {
        viewState.set({ editing: null });
      }
    },
    [cardId, element.id, store, suppressCommitRef, viewState],
  );

  // Mount-only initialization: populate uncontrolled contentEditable DOM once so
  // React re-renders on store commits NEVER touch the live DOM or reset the browser caret!
  useEffect(() => {
    suppressCommitRef.current = false;
    const host = hostRef.current;
    if (!host) return;
    initialParagraphsRef.current = element.paragraphs;
    committedJsonRef.current = JSON.stringify(element.paragraphs);
    populateHostDom(host, element.paragraphs);
    const caret = viewState.get().editing?.caret ?? 'end';
    placeCaret(host, caret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync DOM only when external AI/undo change bumps editEpoch
  useEffect(() => {
    if (epochRef.current === editEpoch) return;
    epochRef.current = editEpoch;
    suppressCommitRef.current = false;
    const host = hostRef.current;
    if (!host) return;
    initialParagraphsRef.current = element.paragraphs;
    committedJsonRef.current = JSON.stringify(element.paragraphs);
    populateHostDom(host, element.paragraphs);
    placeCaret(host, 'end');
  }, [editEpoch, element.paragraphs, suppressCommitRef]);

  useEffect(() => {
    bindFinishEditing(() => {
      composingRef.current = false;
      commitFromDom(true);
    });
    return () => bindFinishEditing(null);
  }, [bindFinishEditing, commitFromDom]);

  useEffect(() => {
    return registerPendingFlush(() => {
      if (!composingRef.current) {
        commitFromDom(false);
      }
    });
  }, [commitFromDom, registerPendingFlush]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      composingRef.current = false;
      commitFromDom(true);
      return;
    }
    if (event.key === 'Enter' && !composingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const nl = document.createTextNode('\n');
        range.insertNode(nl);
        range.setStartAfter(nl);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      commitFromDom(false);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (!composingRef.current) {
      commitFromDom(false);
    }
  };

  return (
    <div
      ref={hostRef}
      data-lm-inline-editor=""
      data-lm-scene-text-editor={element.id}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{
        ...textContainerStyleForScene(element),
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        outline: '2px solid #2563eb',
        outlineOffset: '2px',
        cursor: 'text',
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
        commitFromDom(false);
      }}
      onInput={() => {
        if (!composingRef.current) {
          commitFromDom(false);
        }
      }}
      onBlur={() => {
        composingRef.current = false;
        commitFromDom(true);
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}

export function EditableSceneElement({
  element,
  info,
  renderDefault,
}: {
  element: LoomaSceneElement;
  info: RenderSceneElementInfo;
  renderDefault: () => ReactNode;
}) {
  const { readOnly } = useEditorContext();
  const selected = useViewState((state) => state.selection.nodeIds.includes(element.id));
  const hovered = useViewState((state) => state.hoverId === element.id);
  const editing = useViewState(
    (state) => state.editing?.nodeId === element.id && state.editing?.slot === 'text',
  );

  if (element.type === 'shape') {
    return <>{renderDefault()}</>;
  }

  const boxStyle: CSSProperties = {
    position: 'absolute',
    left: `${element.box.x}px`,
    top: `${element.box.y}px`,
    width: `${element.box.width}px`,
    height: `${element.box.height}px`,
    zIndex: editing ? 99_999 : element.zIndex,
    boxSizing: 'border-box',
    ...(element.box.rotation ? { transform: `rotate(${element.box.rotation}deg)` } : null),
    ...(selected && !editing
      ? { outline: '2px solid #2563eb', outlineOffset: '2px' }
      : hovered && !readOnly && !editing
        ? { outline: '1px dashed rgba(37, 99, 235, 0.65)', outlineOffset: '1px' }
        : null),
  };

  if (editing && element.type === 'text' && !readOnly) {
    return (
      <div
        data-lm-editor-node={element.id}
        data-lm-scene-element={element.id}
        data-lm-scene-type="text"
        data-selected=""
        style={boxStyle}
      >
        <SceneTextInlineEditor cardId={info.cardId} element={element} />
      </div>
    );
  }

  return (
    <div
      data-lm-editor-node={element.id}
      data-selected={selected ? '' : undefined}
      data-hovered={hovered && !readOnly ? '' : undefined}
      style={{ display: 'contents' }}
    >
      {renderDefault()}
      {selected || (hovered && !readOnly) ? (
        <div
          aria-hidden="true"
          style={{
            ...boxStyle,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}
