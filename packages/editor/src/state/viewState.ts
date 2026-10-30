import type { LoomaAsset, LoomaStore } from '@lor-looma/core';
import type { SlotKey } from '@lor-looma/viewer';
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import type { Messages } from '../i18n/en-US';

export interface EditorSelection {
  cardId: string | null;
  nodeIds: string[];
}

export interface EditingState {
  nodeId: string;
  slot: SlotKey;
  caret: 'start' | 'end';
}

export interface SlashState {
  target:
    | { kind: 'replace'; nodeId: string }
    | { kind: 'after'; nodeId: string }
    | { kind: 'card'; cardId: string };
  anchor: { x: number; y: number };
  query: string;
  source: 'text' | 'button';
}

export interface ViewState {
  selection: EditorSelection;
  hoverId: string | null;
  editing: EditingState | null;
  flashIds: ReadonlySet<string>;
  notice: { id: number; message: string } | null;
  slash: SlashState | null;
}

export interface ViewStateStore {
  get(): ViewState;
  set(update: Partial<ViewState> | ((state: ViewState) => Partial<ViewState>)): void;
  subscribe(listener: () => void): () => void;
}

const VIEW_KEYS: (keyof ViewState)[] = [
  'selection',
  'hoverId',
  'editing',
  'flashIds',
  'notice',
  'slash',
];

function createInitial(initial?: Partial<ViewState>): ViewState {
  return {
    selection: initial?.selection ?? { cardId: null, nodeIds: [] },
    hoverId: initial?.hoverId ?? null,
    editing: initial?.editing ?? null,
    flashIds: initial?.flashIds ?? new Set<string>(),
    notice: initial?.notice ?? null,
    slash: initial?.slash ?? null,
  };
}

export function createViewState(initial?: Partial<ViewState>): ViewStateStore {
  let state = createInitial(initial);
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      const next: ViewState = { ...state, ...patch };
      if (VIEW_KEYS.every((key) => Object.is(state[key], next[key]))) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface EditorContextValue {
  viewState: ViewStateStore;
  store?: LoomaStore;
  messages?: Messages;
  readOnly?: boolean;
  uploadAsset?: (file: File) => Promise<{
    src: string;
    width?: number;
    height?: number;
    alt?: string;
  }>;
  rootRef?: RefObject<HTMLDivElement | null>;
  layerRef?: RefObject<HTMLDivElement | null>;
  /** Layer element, tracked in state so portals can render without reading a ref. */
  layerElement?: HTMLDivElement | null;
  highlightExternalChanges?: boolean;
  finishEditing?: () => void;
  bindFinishEditing?: (fn: (() => void) | null) => void;
  editEpoch?: number;
  bumpEditEpoch?: () => void;
  suppressCommitRef?: { current: boolean };
  slashActions?: {
    current: { move: (delta: number) => void; confirm: () => void };
  };
  resolveAsset?: (asset: LoomaAsset, id: string) => string;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

/** `selector` must return an Object.is-stable value when its slice of state has not changed. */
export function useViewState<T>(selector: (state: ViewState) => T): T {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useViewState must be used inside LoomaEditor');
  const store = context.viewState;
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

export function useEditorContext(): EditorContextValue & {
  store: LoomaStore;
  messages: Messages;
  rootRef: RefObject<HTMLDivElement | null>;
  layerRef: RefObject<HTMLDivElement | null>;
  readOnly: boolean;
  finishEditing: () => void;
  bindFinishEditing: (fn: (() => void) | null) => void;
  editEpoch: number;
  bumpEditEpoch: () => void;
  suppressCommitRef: { current: boolean };
  slashActions: { current: { move: (delta: number) => void; confirm: () => void } };
} {
  const context = useContext(EditorContext);
  if (!context?.store || !context.messages || !context.rootRef || !context.layerRef) {
    throw new Error('useEditorContext must be used inside LoomaEditor');
  }
  return {
    ...context,
    store: context.store,
    messages: context.messages,
    rootRef: context.rootRef,
    layerRef: context.layerRef,
    readOnly: context.readOnly ?? false,
    highlightExternalChanges: context.highlightExternalChanges ?? true,
    finishEditing: context.finishEditing ?? (() => {}),
    bindFinishEditing: context.bindFinishEditing ?? (() => {}),
    editEpoch: context.editEpoch ?? 0,
    bumpEditEpoch: context.bumpEditEpoch ?? (() => {}),
    suppressCommitRef: context.suppressCommitRef ?? { current: false },
    slashActions: context.slashActions ?? {
      current: { move() {}, confirm() {} },
    },
  };
}
