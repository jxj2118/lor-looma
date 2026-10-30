import type { ParseIssue } from '../parse/issues';
import type { LoomaDocument, LoomaNode } from '../schema';
import { collectIds, findCard, findNode } from '../tree/tree';

export class CommandFailure extends Error {
  readonly commandIndex: number;
  readonly path: string;

  constructor(commandIndex: number, path: string, message: string) {
    super(message);
    this.name = 'CommandFailure';
    this.commandIndex = commandIndex;
    this.path = path;
  }
}

export function prefixed(prefix: string, path: string): string {
  if (path === '$' || path.length === 0) return prefix;
  return `${prefix}.${path}`;
}

export function failIssues(
  ctx: CommandContext,
  prefix: string,
  issues: readonly ParseIssue[],
): never {
  const issue = issues[0];
  if (!issue) ctx.fail(prefix, 'invalid value');
  ctx.fail(prefixed(prefix, issue.path), issue.message);
}

export class CommandContext {
  commandIndex = 0;
  readonly createdIds: string[] = [];
  readonly touchedIds: string[] = [];
  readonly removedIds: string[] = [];

  constructor(
    readonly draft: LoomaDocument,
    readonly taken: Set<string>,
  ) {}

  fail(path: string, message: string): never {
    throw new CommandFailure(this.commandIndex, path, message);
  }

  touch(id: string): void {
    if (!this.touchedIds.includes(id)) this.touchedIds.push(id);
  }

  /** Records a card or node and its descendants as removed, and frees their ids. */
  remove(id: string): void {
    const card = findCard(this.draft, id);
    if (card) {
      this.drop(card.card.id);
      for (const node of card.card.body) this.dropSubtree(node);
      return;
    }
    const found = findNode(this.draft, id);
    if (!found) return;
    this.dropSubtree(found.node);
  }

  private drop(id: string): void {
    if (!this.removedIds.includes(id)) this.removedIds.push(id);
    this.taken.delete(id);
  }

  private dropSubtree(node: LoomaNode): void {
    this.drop(node.id);
    if (node.type === 'columns') {
      for (const column of node.children) {
        for (const child of column) this.dropSubtree(child);
      }
      return;
    }
    if (node.type === 'stack' || node.type === 'grid') {
      for (const child of node.children) this.dropSubtree(child);
    }
  }
}

export function createCommandContext(draft: LoomaDocument, taken?: Set<string>): CommandContext {
  return new CommandContext(draft, taken ?? collectIds(draft));
}
