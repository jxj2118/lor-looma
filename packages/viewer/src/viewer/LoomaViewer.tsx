import type { LoomaAsset, LoomaDocument, LoomaStore } from '@lor-looma/core';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { RenderNode } from '../card/LoomaCardView';
import { useOverflow } from '../frame/useOverflow';
import { useLoomaDocument } from '../hooks/useLoomaDocument';
import { LoomaRoot } from '../root/LoomaRoot';
import styles from './LoomaViewer.module.css';
import { PresentView } from './PresentView';
import { ScrollView } from './ScrollView';

export type ViewerMode = 'scroll' | 'present';

export interface LoomaViewerProps {
  document?: LoomaDocument;
  store?: LoomaStore;
  mode?: ViewerMode;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  resolveAsset?: (asset: LoomaAsset, id: string) => string;
  onOverflow?: (cardIds: string[]) => void;
  /** Upper bound for scaling up. Default: Infinity for presentation, 1 for document. */
  maxScale?: number;
  showPageNumber?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
  renderNode?: RenderNode;
  className?: string;
  style?: CSSProperties;
}

export interface LoomaViewerHandle {
  next(): void;
  prev(): void;
  goTo(page: number): void;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
}

function clampPage(page: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, page));
}

export const LoomaViewer = forwardRef<LoomaViewerHandle, LoomaViewerProps>(function LoomaViewer(
  {
    document: documentProp,
    store,
    mode = 'scroll',
    page: pageProp,
    defaultPage = 0,
    onPageChange,
    resolveAsset,
    onOverflow,
    maxScale,
    showPageNumber = true,
    onFullscreenChange,
    renderNode,
    className,
    style,
  },
  ref,
) {
  const doc = useLoomaDocument({ document: documentProp, store });
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  const modeRef = useRef(mode);
  const pagePropRef = useRef(pageProp);
  const onPageChangeRef = useRef(onPageChange);
  const onOverflowRef = useRef(onOverflow);
  const onFullscreenChangeRef = useRef(onFullscreenChange);
  const [internalPage, setInternalPage] = useState(defaultPage);
  const page = pageProp ?? internalPage;
  const pageRef = useRef(page);

  useEffect(() => {
    docRef.current = doc;
    modeRef.current = mode;
    pagePropRef.current = pageProp;
    pageRef.current = clampPage(page, doc.cards.length);
    onPageChangeRef.current = onPageChange;
    onOverflowRef.current = onOverflow;
    onFullscreenChangeRef.current = onFullscreenChange;
  }, [doc, mode, page, pageProp, onPageChange, onOverflow, onFullscreenChange]);

  const cardIds = doc.cards.map((card) => card.id);
  const overflowing = useOverflow(
    cardIds,
    (id) => {
      const element = rootRef.current?.querySelector(
        `[data-lm-card-id="${id}"] [data-lm-card-content]`,
      );
      return element instanceof HTMLElement ? element : null;
    },
    doc.format === 'presentation',
  );
  const seenOverflow = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (seenOverflow.current === overflowing) return;
    const previous = seenOverflow.current;
    seenOverflow.current = overflowing;
    if (previous === null) return;
    const ordered = docRef.current.cards.map((card) => card.id).filter((id) => overflowing.has(id));
    onOverflowRef.current?.(ordered);
  }, [overflowing]);

  useEffect(() => {
    if (pageProp === undefined) return;
    const clamped = clampPage(pageProp, doc.cards.length);
    if (clamped !== pageProp) onPageChangeRef.current?.(clamped);
  }, [pageProp, doc.cards.length]);

  useEffect(() => {
    if (mode !== 'present') return;
    rootRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const live = globalThis.document;
    if (!live) return;
    const onChange = () => {
      onFullscreenChangeRef.current?.(live.fullscreenElement === rootRef.current);
    };
    live.addEventListener('fullscreenchange', onChange);
    return () => live.removeEventListener('fullscreenchange', onChange);
  }, []);

  const commitPage = (next: number) => {
    const clamped = clampPage(next, docRef.current.cards.length);
    if (clamped === pageRef.current) return;
    if (pagePropRef.current === undefined) setInternalPage(clamped);
    onPageChangeRef.current?.(clamped);
    pageRef.current = clamped;
  };

  useImperativeHandle(
    ref,
    () => ({
      next() {
        commitPage(pageRef.current + 1);
      },
      prev() {
        commitPage(pageRef.current - 1);
      },
      goTo(target: number) {
        const clamped = clampPage(target, docRef.current.cards.length);
        commitPage(clamped);
        if (modeRef.current !== 'scroll') return;
        const id = docRef.current.cards[clamped]?.id;
        const element = id ? rootRef.current?.querySelector(`[data-lm-card-id="${id}"]`) : null;
        if (element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'start' });
        }
      },
      async enterFullscreen() {
        const element = rootRef.current;
        if (!element || typeof element.requestFullscreen !== 'function') return;
        await element.requestFullscreen();
      },
      async exitFullscreen() {
        const live = globalThis.document;
        if (!live || typeof live.exitFullscreen !== 'function') return;
        if (live.fullscreenElement !== rootRef.current) return;
        await live.exitFullscreen();
      },
    }),
    [],
  );

  const scaleCap = maxScale ?? (doc.format === 'document' ? 1 : Number.POSITIVE_INFINITY);
  const rootClass = className ? `${styles.root} ${className}` : styles.root;
  const displayed = clampPage(page, doc.cards.length);
  if (pageProp === undefined && page !== displayed) setInternalPage(displayed);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'present') return;
    const current = pageRef.current;
    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowDown' ||
      event.key === ' ' ||
      event.key === 'PageDown'
    ) {
      event.preventDefault();
      commitPage(current + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      commitPage(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      commitPage(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      commitPage(docRef.current.cards.length - 1);
    }
  };

  return (
    <LoomaRoot
      ref={rootRef}
      theme={doc.theme}
      className={rootClass}
      style={style}
      tabIndex={mode === 'present' ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      {mode === 'present' ? (
        <PresentView
          document={doc}
          page={displayed}
          maxScale={scaleCap}
          showPageNumber={showPageNumber}
          resolveAsset={resolveAsset}
          renderNode={renderNode}
          onPage={commitPage}
        />
      ) : (
        <ScrollView
          document={doc}
          resolveAsset={resolveAsset}
          renderNode={renderNode}
          maxScale={scaleCap}
          overflowing={overflowing}
        />
      )}
    </LoomaRoot>
  );
});
