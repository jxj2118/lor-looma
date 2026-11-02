import { createLoomaStore, findCard, findNode } from '@lor-looma/core';
import type { LoomaAsset, LoomaDocument, LoomaStore, StoreChange } from '@lor-looma/core';
import { LoomaRoot, useLoomaDocument } from '@lor-looma/viewer';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Canvas } from './canvas/Canvas';
import { Inspector } from './inspector/Inspector';
import { CardSidebar } from './sidebar/CardSidebar';
import { SlashMenu } from './insert/SlashMenu';
import { armFlash, clearFlash } from './canvas/flash';
import { Notice } from './chrome/Notice';
import { PlayOverlay } from './chrome/PlayOverlay';
import { Topbar } from './chrome/Topbar';
import type { LoomaLocale } from './i18n/locale';
import { messagesFor } from './i18n/useMessages';
import {
  normalizeSelectIds,
  pruneSelection,
  selectCard,
  selectionAfterDelete,
} from './state/selection';
import { duplicateSelection, duplicatedNodeIds, moveSelection } from './state/shortcuts';
import { EditorContext, createViewState } from './state/viewState';
import { defaultSlot, readSlot } from './text/slots';
import type { EditorSelection, ViewStateStore } from './state/viewState';
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
  locale?: LoomaLocale;
  className?: string;
  style?: CSSProperties;
}

export interface LoomaEditorHandle {
  store: LoomaStore;
  select(ids: string[]): void;
  scrollTo(id: string): void;
  getSelection(): EditorSelection & { editingId: string | null };
  /** Commit in-flight debounced edits and return the document. */
  flush(): LoomaDocument;
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
    locale = 'en-US',
    className,
    style,
  },
  ref,
) {
  const [ownedStore] = useState(() => (documentProp ? createLoomaStore(documentProp) : null));
  const store = storeProp ?? ownedStore;
  if (!store) throw new Error('LoomaEditor needs either a document or a store');

  const [viewState] = useState(() => createViewState());
  const messages = messagesFor(locale);
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
  const pendingFlushes = useRef(new Set<() => void>());
  const registerPendingFlush = useCallback((flush: () => void) => {
    pendingFlushes.current.add(flush);
    return () => {
      pendingFlushes.current.delete(flush);
    };
  }, []);
  const onChangeRef = useRef(onChange);
  const sourceDocument = useRef(documentProp);
  const highlightRef = useRef(highlightExternalChanges);
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const suppressCommitRef = useMemo(() => ({ current: false }), []);
  const slashActions = useMemo(() => ({ current: { move(_delta: number) {}, confirm() {} } }), []);
  const noticeId = useRef(0);
  const doc = useLoomaDocument({ store });
  const [playing, setPlaying] = useState(false);
  const [playPage, setPlayPage] = useState(0);
  const [editEpoch, setEditEpoch] = useState(0);
  const bindFinishEditing = useCallback(
    (fn: (() => void) | null) => {
      finishEditingRef.current = fn ?? (() => viewState.set({ editing: null }));
    },
    [viewState],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
    highlightRef.current = highlightExternalChanges;
  }, [onChange, highlightExternalChanges]);

  useEffect(() => {
    return store.subscribe((next, change) => {
      onChangeRef.current?.(next, change);
      if (change.kind === 'load') {
        suppressCommitRef.current = true;
        clearFlash(viewState, flashTimers.current);
        viewState.set({
          selection: { cardId: null, nodeIds: [] },
          hoverId: null,
          editing: null,
        });
        return;
      }
      const editing = viewState.get().editing;
      if (editing) {
        const live = findNode(next, editing.nodeId)?.node;
        const slotGone = !live || readSlot(live, editing.slot) === undefined;
        if (slotGone) {
          suppressCommitRef.current = true;
          viewState.set({ editing: null });
        } else if (change.origin !== 'user' && change.touchedIds.includes(editing.nodeId)) {
          noticeId.current += 1;
          setEditEpoch((epoch) => epoch + 1);
          viewState.set({
            notice: { id: noticeId.current, message: messages.externalChange },
          });
        }
      }
      const pruned = pruneSelection(next, viewState.get().selection);
      if (pruned !== viewState.get().selection) viewState.set({ selection: pruned });
      if (highlightRef.current && change.kind === 'apply' && change.origin !== 'user') {
        const ids = change.touchedIds.filter(
          (id) => findCard(next, id) !== null || findNode(next, id) !== null,
        );
        armFlash(viewState, ids, flashTimers.current);
      }
    });
  }, [messages.externalChange, store, suppressCommitRef, viewState]);

  useEffect(() => () => clearFlash(viewState, flashTimers.current), [viewState]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!viewState.get().editing) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          '[data-lm-inline-editor], [data-lm-format-toolbar], [data-lm-color-popover], [data-lm-node-menu]',
        )
      ) {
        return;
      }
      if (target instanceof HTMLElement) {
        const slotElement = target.closest('[data-lm-slot]');
        const nodeElement = target.closest('[data-lm-editor-node]');
        const editing = viewState.get().editing;
        if (
          editing &&
          slotElement &&
          nodeElement?.getAttribute('data-lm-editor-node') === editing.nodeId &&
          slotElement.getAttribute('data-lm-slot') === editing.slot
        ) {
          return;
        }
      }
      finishEditing();
    };
    root.addEventListener('pointerdown', onPointerDown, true);
    return () => root.removeEventListener('pointerdown', onPointerDown, true);
  }, [finishEditing, viewState]);

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
        const scope = rootRef.current?.querySelector('[data-lm-editor-canvas]') ?? rootRef.current;
        const target = scope?.querySelector(
          `[data-lm-card-id="${id}"], [data-lm-node-id="${id}"], [data-lm-editor-node="${id}"]`,
        );
        if (target instanceof HTMLElement && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'center' });
        }
      },
      getSelection() {
        const state = viewState.get();
        return { ...state.selection, editingId: state.editing?.nodeId ?? null };
      },
      flush() {
        finishEditing();
        for (const flushPending of [...pendingFlushes.current]) flushPending();
        return store.getDocument();
      },
    }),
    [finishEditing, store, viewState],
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
        locale,
        readOnly,
        uploadAsset,
        rootRef,
        layerRef,
        layerElement,
        highlightExternalChanges,
        finishEditing,
        bindFinishEditing,
        registerPendingFlush,
        editEpoch,
        bumpEditEpoch: () => setEditEpoch((epoch) => epoch + 1),
        suppressCommitRef,
        slashActions,
        resolveAsset,
      }}
    >
      <LoomaRoot
        ref={rootRef}
        theme={doc.theme}
        tabIndex={-1}
        className={className ? `${styles.root} ${className}` : styles.root}
        style={style}
        onKeyDown={(event) => onEditorKeyDown(event, { readOnly, store, viewState })}
      >
        <Topbar onPlay={openPlay} />
        <div className={styles.workspace}>
          {readOnly ? null : <CardSidebar />}
          <Canvas />
          {readOnly ? null : <Inspector />}
        </div>
        <div ref={setLayer} className={styles.layer}>
          <Notice />
          <SlashMenu />
          {playing ? <PlayOverlay open initialPage={playPage} onOpenChange={setPlaying} /> : null}
        </div>
      </LoomaRoot>
    </EditorContext.Provider>
  );
});

function isFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

function onEditorKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  {
    readOnly,
    store,
    viewState,
  }: { readOnly: boolean; store: LoomaStore; viewState: ViewStateStore },
): void {
  if (readOnly || viewState.get().editing || isFieldTarget(event.target)) return;
  if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
  const key = event.key.toLowerCase();
  const meta = event.metaKey || event.ctrlKey;
  if (meta && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (event.ctrlKey && key === 'y') {
    event.preventDefault();
    store.redo();
    return;
  }

  const selection = viewState.get().selection;
  if (meta && key === 'd' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    const plan = duplicateSelection(store.getDocument(), selection);
    if (!plan) return;
    const applied = store.apply(plan.commands, { origin: 'user', label: 'Duplicate' });
    if (!applied.ok) return;
    if (plan.selectKind === 'card') {
      const cardId = applied.createdIds.find((id) => findCard(applied.doc, id));
      if (cardId) viewState.set({ selection: selectCard(cardId) });
      return;
    }
    const nodeIds = duplicatedNodeIds(applied.doc, applied.createdIds);
    const anchor = nodeIds[0];
    const cardId = anchor
      ? (findNode(applied.doc, anchor)?.cardId ?? selection.cardId)
      : selection.cardId;
    viewState.set({ selection: { cardId, nodeIds } });
    return;
  }
  if (meta && !event.altKey && !event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
    event.preventDefault();
    const direction = key === 'arrowup' ? 'up' : 'down';
    const commands = moveSelection(store.getDocument(), selection, direction);
    if (!commands) return;
    store.apply(commands, { origin: 'user', label: direction === 'up' ? 'Move up' : 'Move down' });
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    const nodeId = selection.nodeIds[0];
    if (nodeId) {
      const found = findNode(store.getDocument(), nodeId);
      if (!found) {
        viewState.set({ selection: { cardId: null, nodeIds: [] } });
        return;
      }
      if (found.parentId === found.cardId) viewState.set({ selection: selectCard(found.cardId) });
      else viewState.set({ selection: { cardId: found.cardId, nodeIds: [found.parentId] } });
      return;
    }
    if (selection.cardId) viewState.set({ selection: { cardId: null, nodeIds: [] } });
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    if (selection.nodeIds.length === 0 && !selection.cardId) return;
    event.preventDefault();
    const doc = store.getDocument();
    const next = selectionAfterDelete(doc, selection);
    const commands =
      selection.nodeIds.length > 0
        ? selection.nodeIds.map((id) => ({ op: 'deleteNode' as const, id }))
        : [{ op: 'deleteCard' as const, id: selection.cardId ?? '' }];
    const result = store.apply(commands, { origin: 'user', label: 'Delete' });
    if (result.ok) viewState.set({ selection: next });
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey && selection.nodeIds.length === 1) {
    const nodeId = selection.nodeIds[0];
    if (!nodeId) return;
    const found = findNode(store.getDocument(), nodeId);
    const slot = found ? defaultSlot(found.node) : null;
    if (!found || !slot) return;
    event.preventDefault();
    viewState.set({ editing: { nodeId: found.node.id, slot, caret: 'end' } });
  }
}
