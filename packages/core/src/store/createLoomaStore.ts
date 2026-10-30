import { applyPatches, enablePatches, freeze } from 'immer';
import { applyCommands } from '../commands/applyCommands';
import { LoomaCommandSchema } from '../commands/schema';
import type { LoomaCommand } from '../commands/schema';
import { formatIssue, parseDocument } from '../parse';
import type { LoomaDocument } from '../schema';
import { collectIds } from '../tree/tree';
import { createHistory, pushEntry } from './history';
import type { HistoryEntry } from './history';

enablePatches();

const DEFAULT_HISTORY_LIMIT = 200;
const DEFAULT_MERGE_WINDOW_MS = 1000;

export interface StoreOptions {
  /** Maximum number of undo steps kept. Default 200. */
  historyLimit?: number;
  /** Merge window for consecutive applies with the same mergeKey. Default 1000 ms. */
  mergeWindowMs?: number;
  /** Clock used for merging; injectable for tests. Default Date.now. */
  now?: () => number;
}

export interface ApplyOptions {
  /** Who made the change. Default 'user'. Hosts pass 'ai' for model-driven edits. */
  origin?: string;
  label?: string;
  mergeKey?: string;
}

export interface StoreChange {
  kind: 'apply' | 'undo' | 'redo' | 'load';
  origin: string;
  label?: string;
  commands: readonly LoomaCommand[];
  touchedIds: readonly string[];
  removedIds: readonly string[];
}

export type StoreListener = (doc: LoomaDocument, change: StoreChange) => void;

export interface LoomaStore {
  getDocument(): LoomaDocument;
  apply(commands: readonly unknown[], options?: ApplyOptions): ReturnType<typeof applyCommands>;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: StoreListener): () => void;
  /** Replaces the whole document and clears history. Throws if the document is invalid. */
  load(doc: LoomaDocument): void;
}

function invalidDocument(input: unknown): TypeError {
  const parsed = parseDocument(input, { repair: false });
  const lines = parsed.ok ? [] : parsed.errors.map((issue) => formatIssue(issue));
  return new TypeError(`Invalid Looma document:\n${lines.join('\n')}`);
}

function acceptDocument(input: LoomaDocument): LoomaDocument {
  const parsed = parseDocument(input, { repair: false });
  if (!parsed.ok) throw invalidDocument(input);
  return freeze(parsed.doc, true);
}

function unique(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function rethrowLater(error: unknown): void {
  const queue = globalThis as { queueMicrotask?: (callback: () => void) => void };
  const schedule = queue.queueMicrotask ?? queueMicrotask;
  schedule(() => {
    throw error;
  });
}

function parsedCommands(commands: readonly unknown[]): LoomaCommand[] {
  const parsed: LoomaCommand[] = [];
  for (const command of commands) {
    const result = LoomaCommandSchema.safeParse(command);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

export function createLoomaStore(doc: LoomaDocument, options?: StoreOptions): LoomaStore {
  const historyLimit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const mergeWindowMs = options?.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const now = options?.now ?? Date.now;
  const history = createHistory();
  const listeners: StoreListener[] = [];
  let current = acceptDocument(doc);

  function emit(change: StoreChange): void {
    for (const listener of [...listeners]) {
      if (!listeners.includes(listener)) continue;
      try {
        listener(current, change);
      } catch (error) {
        rethrowLater(error);
      }
    }
  }

  function changeFrom(
    entry: HistoryEntry,
    kind: 'undo' | 'redo',
    touchedIds: readonly string[],
    removedIds: readonly string[],
  ): StoreChange {
    const change: StoreChange = {
      kind,
      origin: entry.origin,
      commands: entry.commands,
      touchedIds,
      removedIds,
    };
    if (entry.label !== undefined) change.label = entry.label;
    return change;
  }

  return {
    getDocument() {
      return current;
    },
    apply(commands, applyOptions) {
      const result = applyCommands(current, commands);
      if (!result.ok || result.patches.length === 0) return result;
      const entry: HistoryEntry = {
        patches: [...result.patches],
        inversePatches: [...result.inversePatches],
        commands: parsedCommands(commands),
        updatedAt: now(),
        origin: applyOptions?.origin ?? 'user',
        touchedIds: [...result.touchedIds],
        removedIds: [...result.removedIds],
        createdIds: [...result.createdIds],
      };
      if (applyOptions?.label !== undefined) entry.label = applyOptions.label;
      if (applyOptions?.mergeKey !== undefined) entry.mergeKey = applyOptions.mergeKey;
      pushEntry(history, entry, historyLimit, mergeWindowMs);
      history.coalesce = true;
      current = result.doc;
      const change: StoreChange = {
        kind: 'apply',
        origin: entry.origin,
        commands: entry.commands,
        touchedIds: result.touchedIds,
        removedIds: result.removedIds,
      };
      if (entry.label !== undefined) change.label = entry.label;
      emit(change);
      return result;
    },
    undo() {
      const entry = history.undo.pop();
      if (!entry) return false;
      current = freeze(applyPatches(current, entry.inversePatches), true);
      history.redo.push(entry);
      history.coalesce = false;
      const live = collectIds(current);
      emit(
        changeFrom(
          entry,
          'undo',
          unique([
            ...entry.touchedIds.filter((id) => live.has(id)),
            ...entry.removedIds.filter((id) => live.has(id)),
          ]),
          entry.createdIds.filter((id) => !live.has(id)),
        ),
      );
      return true;
    },
    redo() {
      const entry = history.redo.pop();
      if (!entry) return false;
      current = freeze(applyPatches(current, entry.patches), true);
      history.undo.push(entry);
      history.coalesce = false;
      emit(changeFrom(entry, 'redo', entry.touchedIds, entry.removedIds));
      return true;
    },
    canUndo() {
      return history.undo.length > 0;
    },
    canRedo() {
      return history.redo.length > 0;
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    load(next) {
      current = acceptDocument(next);
      history.undo = [];
      history.redo = [];
      history.coalesce = false;
      emit({ kind: 'load', origin: 'user', commands: [], touchedIds: [], removedIds: [] });
    },
  };
}
