import type { Patch } from 'immer';
import { enablePatches, produceWithPatches } from 'immer';
import { zodIssuesToParseIssues } from '../parse/issues';
import { cloneJson } from '../parse/repair';
import { validateDocumentSemantics } from '../parse/semantics';
import type { LoomaDocument } from '../schema';
import { collectIds } from '../tree/tree';
import { CommandFailure, createCommandContext } from './context';
import { deleteCard, duplicateCard, insertCard, moveCard, updateCard } from './handlers/cards';
import { putAsset, removeAsset, setFormat, setTheme, setTitle } from './handlers/document';
import { LoomaCommandSchema } from './schema';
import type { ParsedLoomaCommand } from './schema';

enablePatches();

export interface ApplyError {
  /** Index of the failing command, or null when the final document check failed. */
  commandIndex: number | null;
  /** Relative to the command (e.g. `node.level`, `at.after`) when commandIndex is set; a document path otherwise. */
  path: string;
  message: string;
}

export interface ApplySuccess {
  ok: true;
  doc: LoomaDocument;
  patches: Patch[];
  inversePatches: Patch[];
  /** Every id created by the batch (generated or caller-provided), in creation order. */
  createdIds: string[];
  /** Cards and nodes that were inserted, updated, moved, replaced or wrapped (deduplicated, in order). */
  touchedIds: string[];
  /** Cards and nodes that no longer exist after the batch. */
  removedIds: string[];
}

export type ApplyResult = ApplySuccess | { ok: false; errors: ApplyError[] };

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

function dispatch(ctx: ReturnType<typeof createCommandContext>, command: ParsedLoomaCommand): void {
  switch (command.op) {
    case 'setTitle':
      return setTitle(ctx, command);
    case 'setFormat':
      return setFormat(ctx, command);
    case 'setTheme':
      return setTheme(ctx, command);
    case 'putAsset':
      return putAsset(ctx, command);
    case 'removeAsset':
      return removeAsset(ctx, command);
    case 'insertCard':
      return insertCard(ctx, command);
    case 'updateCard':
      return updateCard(ctx, command);
    case 'moveCard':
      return moveCard(ctx, command);
    case 'duplicateCard':
      return duplicateCard(ctx, command);
    case 'deleteCard':
      return deleteCard(ctx, command);
    case 'insertNode':
    case 'updateNode':
    case 'replaceNode':
    case 'moveNode':
    case 'deleteNode':
    case 'wrapNodes':
    case 'unwrapNode':
    case 'insertColumn':
    case 'deleteColumn':
      ctx.fail('op', `${command.op} is not implemented`);
      return;
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

export function applyCommands(doc: LoomaDocument, commands: readonly unknown[]): ApplyResult {
  if (!Array.isArray(commands)) {
    return {
      ok: false,
      errors: [{ commandIndex: null, path: '$', message: 'commands must be an array' }],
    };
  }

  const parsed: ParsedLoomaCommand[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const result = LoomaCommandSchema.safeParse(command);
    if (!result.success) {
      return {
        ok: false,
        errors: zodIssuesToParseIssues(result.error.issues, command).map((issue) => ({
          commandIndex: index,
          path: issue.path,
          message: issue.message,
        })),
      };
    }
    parsed.push(result.data);
  }

  const taken = collectIds(doc);
  const base = cloneJson(doc);
  const recorded = {
    createdIds: [] as string[],
    touchedIds: [] as string[],
    removedIds: [] as string[],
  };

  let produced: LoomaDocument;
  let patches: Patch[];
  let inversePatches: Patch[];
  try {
    const drafted = produceWithPatches(base, (draft) => {
      const ctx = createCommandContext(draft, taken);
      for (let index = 0; index < parsed.length; index += 1) {
        const command = parsed[index];
        if (!command) continue;
        ctx.commandIndex = index;
        dispatch(ctx, command);
      }
      recorded.createdIds = ctx.createdIds;
      recorded.touchedIds = ctx.touchedIds;
      recorded.removedIds = ctx.removedIds;
    });
    produced = drafted[0];
    patches = drafted[1];
    inversePatches = drafted[2];
  } catch (error) {
    if (error instanceof CommandFailure) {
      return {
        ok: false,
        errors: [{ commandIndex: error.commandIndex, path: error.path, message: error.message }],
      };
    }
    throw error;
  }

  const semantic = validateDocumentSemantics(produced);
  if (semantic.length > 0) {
    return {
      ok: false,
      errors: semantic.map((issue) => ({
        commandIndex: null,
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  const live = collectIds(produced);
  return {
    ok: true,
    doc: produced,
    patches,
    inversePatches,
    createdIds: recorded.createdIds,
    touchedIds: unique(recorded.touchedIds).filter((id) => live.has(id)),
    removedIds: unique(recorded.removedIds).filter((id) => !live.has(id)),
  };
}
