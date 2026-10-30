import type { Patch } from 'immer';
import type { LoomaCommand } from '../commands/schema';

export interface HistoryEntry {
  patches: Patch[];
  inversePatches: Patch[];
  commands: LoomaCommand[];
  mergeKey?: string;
  updatedAt: number;
  origin: string;
  label?: string;
  touchedIds: string[];
  removedIds: string[];
  createdIds: string[];
}

export interface HistoryState {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  /** When false, the next apply starts a new entry even if the merge key matches. */
  coalesce: boolean;
}

export function createHistory(): HistoryState {
  return { undo: [], redo: [], coalesce: true };
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

/** Pushes an apply onto the undo stack, merging with the top entry when the rules allow. */
export function pushEntry(
  history: HistoryState,
  entry: HistoryEntry,
  limit: number,
  windowMs: number,
): void {
  history.redo = [];
  const top = history.undo.at(-1);
  const elapsed = top === undefined ? Number.POSITIVE_INFINITY : entry.updatedAt - top.updatedAt;
  if (
    history.coalesce &&
    entry.mergeKey !== undefined &&
    top !== undefined &&
    top.mergeKey === entry.mergeKey &&
    elapsed <= windowMs
  ) {
    top.patches.push(...entry.patches);
    top.inversePatches = [...entry.inversePatches, ...top.inversePatches];
    top.commands.push(...entry.commands);
    top.touchedIds = unique([...top.touchedIds, ...entry.touchedIds]);
    top.removedIds = unique([...top.removedIds, ...entry.removedIds]);
    top.createdIds = unique([...top.createdIds, ...entry.createdIds]);
    top.updatedAt = entry.updatedAt;
    return;
  }
  history.undo.push(entry);
  if (history.undo.length > limit) history.undo.splice(0, history.undo.length - limit);
}
