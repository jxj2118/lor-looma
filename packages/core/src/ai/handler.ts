import type { ApplyError } from '../commands';
import { ID_PATTERN } from '../ids';
import { getCards, getOutline } from '../read';
import type { ApplyOptions, LoomaStore } from '../store';
import { findNode } from '../tree/tree';
import { LOOMA_TOOL_NAMES } from './tools';
import type { LoomaToolName } from './tools';

export interface ToolHandlerOptions {
  /** Origin recorded on store changes. Default 'ai'. */
  origin?: string;
  /** Include a fresh outline in successful looma_apply results. Default true. */
  includeOutline?: boolean;
}

export type ToolResult =
  { ok: true; [key: string]: unknown } | { ok: false; error: string; errors?: ApplyError[] };

export type ToolHandler = (name: string, args: unknown) => ToolResult;

const ID_MESSAGE =
  'must be a valid id (letter first, then letters, digits, "_" or "-", max 64 chars)';
const MISSING_CARD_HINT =
  'Some ids are not cards. Card ids start with c_ in generated documents; call looma_get_outline to see them.';

const TOOL_LIST = LOOMA_TOOL_NAMES.join(', ');

function isArgsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArgs(
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let value = args;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `arguments are not valid JSON: ${message}` };
    }
  }
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (!isArgsObject(value)) return { ok: false, error: '$: expected an object' };
  return { ok: true, value };
}

function unknownKeys(
  args: Record<string, unknown>,
  allowed: readonly string[],
): string | undefined {
  const extra = Object.keys(args).filter((key) => !allowed.includes(key));
  if (extra.length === 0) return undefined;
  return `$: unknown key(s): ${extra.join(', ')}`;
}

function invalidCards(args: Record<string, unknown>): string | undefined {
  const extra = unknownKeys(args, ['ids', 'as']);
  if (extra) return extra;
  if (!Object.prototype.hasOwnProperty.call(args, 'ids') || !Array.isArray(args.ids)) {
    return 'ids: is required (expected an array of card ids)';
  }
  if (args.ids.length < 1) return 'ids: must have at least 1 items';
  for (let index = 0; index < args.ids.length; index += 1) {
    const id = args.ids[index];
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) return `ids[${index}]: ${ID_MESSAGE}`;
  }
  if (args.as !== undefined && args.as !== 'json' && args.as !== 'markdown') {
    return `as: must be one of "json", "markdown"; received ${JSON.stringify(args.as)}`;
  }
  return undefined;
}

function invalidApply(args: Record<string, unknown>): string | undefined {
  const extra = unknownKeys(args, ['commands', 'label']);
  if (extra) return extra;
  if (!Object.prototype.hasOwnProperty.call(args, 'commands') || !Array.isArray(args.commands)) {
    return 'commands: is required (expected an array of commands)';
  }
  if (args.commands.length < 1) return 'commands: must have at least 1 items';
  if (args.label !== undefined && typeof args.label !== 'string') {
    return `label: expected string, received ${typeof args.label}`;
  }
  return undefined;
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string');
}

function missingHint(store: LoomaStore, missing: readonly string[]): string | undefined {
  if (missing.length === 0) return undefined;
  const doc = store.getDocument();
  const sentences: string[] = [];
  let unknown = false;
  for (const id of missing) {
    const found = findNode(doc, id);
    if (found) {
      sentences.push(`"${id}" is a node inside card "${found.cardId}"; pass the card id instead.`);
    } else unknown = true;
  }
  if (unknown) sentences.push(MISSING_CARD_HINT);
  return sentences.join(' ');
}

function readCards(store: LoomaStore, args: Record<string, unknown>): ToolResult {
  const ids = stringIds(args.ids);
  if (args.as === 'markdown') {
    const read = getCards(store.getDocument(), ids, { as: 'markdown' });
    const result: ToolResult = { ok: true, markdown: read.markdown, missing: read.missing };
    const hint = missingHint(store, read.missing);
    if (hint) result.hint = hint;
    return result;
  }
  const read = getCards(store.getDocument(), ids);
  const result: ToolResult = { ok: true, cards: read.cards, missing: read.missing };
  const hint = missingHint(store, read.missing);
  if (hint) result.hint = hint;
  return result;
}

function commandOp(commands: unknown, index: number): string {
  if (!Array.isArray(commands)) return 'unknown';
  const command = commands[index];
  if (isArgsObject(command) && typeof command.op === 'string') return command.op;
  return 'unknown';
}

function detailList(errors: readonly ApplyError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join('; ');
}

function summarize(commands: unknown, errors: readonly ApplyError[]): string {
  const byCommand = new Map<number, ApplyError[]>();
  const documentErrors: ApplyError[] = [];
  for (const error of errors) {
    if (error.commandIndex === null) {
      documentErrors.push(error);
      continue;
    }
    const group = byCommand.get(error.commandIndex) ?? [];
    group.push(error);
    byCommand.set(error.commandIndex, group);
  }
  const parts: string[] = [];
  for (const index of [...byCommand.keys()].sort((left, right) => left - right)) {
    const group = byCommand.get(index) ?? [];
    parts.push(`Command ${index} (${commandOp(commands, index)}) failed: ${detailList(group)}.`);
  }
  if (documentErrors.length > 0) {
    parts.push(`The resulting document would be invalid: ${detailList(documentErrors)}.`);
  }
  return `No changes were applied. ${parts.join(' ')} Fix the command and send the whole batch again.`;
}

function applyCommands(
  store: LoomaStore,
  args: Record<string, unknown>,
  origin: string,
  includeOutline: boolean,
): ToolResult {
  const commands = Array.isArray(args.commands) ? args.commands : [];
  const options: ApplyOptions = { origin };
  if (typeof args.label === 'string') options.label = args.label;
  const applied = store.apply(commands, options);
  if (!applied.ok) {
    return { ok: false, error: summarize(commands, applied.errors), errors: applied.errors };
  }
  const result: ToolResult = {
    ok: true,
    createdIds: applied.createdIds,
    touchedIds: applied.touchedIds,
    removedIds: applied.removedIds,
  };
  if (includeOutline) result.outline = getOutline(store.getDocument());
  return result;
}

function isToolName(name: string): name is LoomaToolName {
  return (LOOMA_TOOL_NAMES as readonly string[]).includes(name);
}

function dispatch(
  store: LoomaStore,
  name: string,
  args: unknown,
  origin: string,
  includeOutline: boolean,
): ToolResult {
  if (!isToolName(name)) {
    return {
      ok: false,
      error: `unknown tool "${name}"; expected one of ${TOOL_LIST}`,
    };
  }
  const parsed = parseArgs(args);
  if (!parsed.ok) return parsed;
  if (name === 'looma_get_outline') {
    const invalid = unknownKeys(parsed.value, []);
    if (invalid) return { ok: false, error: invalid };
    return { ok: true, outline: getOutline(store.getDocument()) };
  }
  if (name === 'looma_get_cards') {
    const invalid = invalidCards(parsed.value);
    if (invalid) return { ok: false, error: invalid };
    return readCards(store, parsed.value);
  }
  const invalid = invalidApply(parsed.value);
  if (invalid) return { ok: false, error: invalid };
  return applyCommands(store, parsed.value, origin, includeOutline);
}

export function createToolHandler(store: LoomaStore, options?: ToolHandlerOptions): ToolHandler {
  const origin = options?.origin ?? 'ai';
  const includeOutline = options?.includeOutline ?? true;
  return (name, args) => {
    try {
      return dispatch(store, name, args, origin, includeOutline);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `internal error: ${message}` };
    }
  };
}
