import { createLoomaStore, findCard } from '@lor-looma/core';
import type { LoomaAsset, LoomaDocument, LoomaStore, StoreChange } from '@lor-looma/core';
import { LoomaRoot, useLoomaDocument } from '@lor-looma/viewer';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Canvas } from './canvas/Canvas';
import { Notice } from './chrome/Notice';
import { PlayOverlay } from './chrome/PlayOverlay';
import { Topbar } from './chrome/Topbar';
import { useMessages } from './i18n/useMessages';
import { normalizeSelectIds } from './state/selection';
import { EditorContext, createViewState } from './state/viewState';
import type { EditorSelection } from './state/viewState';
import styles from './LoomaEditor.module.css';

export type UploadAsset = (file: File) => Promise<{
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}>;

export interface LoomaEditorProps {
  document?: LoomaDocument;
  store?: LoomaStore;
  onChange?: (doc: LoomaDocument, change: StoreChange) => void;
  uploadAsset?: UploadAsset;
  readOnly?: boolean;
  highlightExternalChanges?: boolean;
  resolveAsset?: (asset: LoomaAsset, id: string) => string;
  className?: string;
  style?: CSSProperties;
}

export interface LoomaEditorHandle {
  store: LoomaStore;
  select(ids: string[]): void;
  scrollTo(id: string): void;
  getSelection(): EditorSelection & { editingId: string | null };
}

export type { EditorSelection };

export const LoomaEditor = forwardRef<LoomaEditorHandle, LoomaEditorProps>(function LoomaEditor(
  {
    document: documentProp,
    store: storeProp,
    onChange,
    uploadAsset,
    readOnly = false,
    highlightExternalChanges = true,
    resolveAsset,
    className,
    style,
  },
  ref,
) {
  const [ownedStore] = useState(() => (documentProp ? createLoomaStore(documentProp) : null));
  const store = storeProp ?? ownedStore;
  if (!store) throw new Error('LoomaEditor needs either a document or a store');

  const [viewState] = useState(() => createViewState());
  const messages = useMessages();
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [layerElement, setLayerElement] = useState<HTMLDivElement | null>(null);
  const setLayer = useCallback((node: HTMLDivElement | null) => {
    layerRef.current = node;
    setLayerElement(node);
  }, []);
  const finishEditingRef = useRef<() => void>(() => {});
  const finishEditing = useCallback(() => {
    finishEditingRef.current();
  }, []);
  const onChangeRef = useRef(onChange);
  const sourceDocument = useRef(documentProp);
  const doc = useLoomaDocument({ store });
  const [playing, setPlaying] = useState(false);
  const [playPage, setPlayPage] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => store.subscribe((next, change) => onChangeRef.current?.(next, change)), [store]);

  useEffect(() => {
    if (storeProp || !documentProp || documentProp === sourceDocument.current) return;
    sourceDocument.current = documentProp;
    if (documentProp !== store.getDocument()) store.load(documentProp);
  }, [documentProp, store, storeProp]);

  useImperativeHandle(
    ref,
    () => ({
      store,
      select(ids) {
        viewState.set({ selection: normalizeSelectIds(store.getDocument(), ids) });
      },
      scrollTo(id) {
        const target = rootRef.current?.querySelector(
          `[data-lm-card-id="${id}"], [data-lm-node-id="${id}"]`,
        );
        if (target instanceof HTMLElement && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'center' });
        }
      },
      getSelection() {
        const state = viewState.get();
        return { ...state.selection, editingId: state.editing?.nodeId ?? null };
      },
    }),
    [store, viewState],
  );

  const openPlay = () => {
    finishEditing();
    const cardId = viewState.get().selection.cardId;
    const index = cardId ? (findCard(store.getDocument(), cardId)?.index ?? 0) : 0;
    setPlayPage(index);
    setPlaying(true);
  };

  return (
    <EditorContext.Provider
      value={{
        viewState,
        store,
        messages,
        readOnly,
        uploadAsset,
        rootRef,
        layerRef,
        layerElement,
        highlightExternalChanges,
        finishEditing,
        resolveAsset,
      }}
    >
      <LoomaRoot
        ref={rootRef}
        theme={doc.theme}
        tabIndex={-1}
        className={className ? `${styles.root} ${className}` : styles.root}
        style={style}
      >
        <Topbar onPlay={openPlay} />
        <Canvas />
        <div ref={setLayer} className={styles.layer}>
          <Notice />
          {playing ? <PlayOverlay open initialPage={playPage} onOpenChange={setPlaying} /> : null}
        </div>
      </LoomaRoot>
    </EditorContext.Provider>
  );
});
