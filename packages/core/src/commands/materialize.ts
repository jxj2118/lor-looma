import { BLOCK_TYPES, CONTAINER_TYPES } from '../constants';
import type { IdKind } from '../ids';
import { createId, isValidId } from '../ids';
import { zodIssuesToParseIssues } from '../parse/issues';
import type { ParseIssue } from '../parse/issues';
import { cloneJson, isPlainObject } from '../parse/repair';
import { LoomaAssetSchema } from '../schema/asset';
import type { LoomaAsset } from '../schema/asset';
import { LoomaCardSchema } from '../schema/card';
import type { LoomaCard } from '../schema/card';
import { LoomaNodeSchema } from '../schema/nodes';
import type { LoomaNode } from '../schema/nodes';

export type Materialized<T> = { ok: true; value: T } | { ok: false; issues: ParseIssue[] };

const SUPPORTED_TYPES = new Set<string>([...BLOCK_TYPES, ...CONTAINER_TYPES]);
const SUPPORTED_LIST = [...BLOCK_TYPES, ...CONTAINER_TYPES].join(', ');
const ID_MESSAGE =
  'must be a valid id (letter first, then letters, digits, "_" or "-", max 64 chars)';

function at(path: string, field: string): string {
  return path.length === 0 ? field : `${path}.${field}`;
}

function describeType(type: unknown): string {
  if (typeof type === 'string') return JSON.stringify(type);
  if (type === undefined) return 'undefined';
  return JSON.stringify(type) ?? 'undefined';
}

function idKind(type: string): IdKind {
  if (type === 'stack' || type === 'columns' || type === 'grid' || type === 'steps') {
    return 'container';
  }
  return 'block';
}

function assignId(
  target: Record<string, unknown>,
  path: string,
  kind: IdKind,
  taken: Set<string>,
  created: string[],
  issues: ParseIssue[],
): void {
  const idPath = at(path, 'id');
  if (target.id === undefined) {
    const id = createId(kind, taken);
    target.id = id;
    taken.add(id);
    created.push(id);
    return;
  }
  if (!isValidId(target.id)) {
    issues.push({ path: idPath, message: ID_MESSAGE });
    return;
  }
  if (taken.has(target.id)) {
    issues.push({
      path: idPath,
      message: `id "${target.id}" is already in use; omit it to let Looma generate one`,
    });
    return;
  }
  taken.add(target.id);
  created.push(target.id);
}

function assignNodeIds(
  node: unknown,
  path: string,
  taken: Set<string>,
  created: string[],
  issues: ParseIssue[],
): void {
  if (!isPlainObject(node)) {
    issues.push({ path: path.length === 0 ? '$' : path, message: 'expected an object' });
    return;
  }
  const type = node.type;
  if (type === 'unknown') {
    issues.push({ path: at(path, 'type'), message: 'unsupported blocks cannot be created' });
    return;
  }
  if (typeof type !== 'string' || !SUPPORTED_TYPES.has(type)) {
    issues.push({
      path: at(path, 'type'),
      message: `unknown block type ${describeType(type)}; expected one of ${SUPPORTED_LIST}`,
    });
    return;
  }
  assignId(node, path, idKind(type), taken, created, issues);
  if (type === 'columns' && Array.isArray(node.children)) {
    node.children.forEach((column, columnIndex) => {
      if (!Array.isArray(column)) return;
      column.forEach((child, rowIndex) => {
        assignNodeIds(
          child,
          at(path, `children[${columnIndex}][${rowIndex}]`),
          taken,
          created,
          issues,
        );
      });
    });
    return;
  }
  if ((type === 'stack' || type === 'grid' || type === 'steps') && Array.isArray(node.children)) {
    node.children.forEach((child, index) => {
      assignNodeIds(child, at(path, `children[${index}]`), taken, created, issues);
    });
  }
}

function adopt(taken: Set<string>, created: string[], fresh: readonly string[]): void {
  for (const id of fresh) {
    taken.add(id);
    created.push(id);
  }
}

export function materializeNode(
  input: unknown,
  taken: Set<string>,
  created: string[],
): Materialized<LoomaNode> {
  const cloned = cloneJson(input);
  const scratchTaken = new Set(taken);
  const scratchCreated: string[] = [];
  const issues: ParseIssue[] = [];
  assignNodeIds(cloned, '', scratchTaken, scratchCreated, issues);
  if (issues.length > 0) return { ok: false, issues };
  const parsed = LoomaNodeSchema.safeParse(cloned);
  if (!parsed.success)
    return { ok: false, issues: zodIssuesToParseIssues(parsed.error.issues, cloned) };
  adopt(taken, created, scratchCreated);
  return { ok: true, value: parsed.data };
}

export function materializeCard(
  input: unknown,
  taken: Set<string>,
  created: string[],
): Materialized<LoomaCard> {
  const cloned = cloneJson(input);
  if (!isPlainObject(cloned)) {
    return { ok: false, issues: [{ path: '$', message: 'expected an object' }] };
  }
  const scratchTaken = new Set(taken);
  const scratchCreated: string[] = [];
  const issues: ParseIssue[] = [];
  assignId(cloned, '', 'card', scratchTaken, scratchCreated, issues);
  if (Array.isArray(cloned.body)) {
    cloned.body.forEach((node, index) => {
      assignNodeIds(node, `body[${index}]`, scratchTaken, scratchCreated, issues);
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  const parsed = LoomaCardSchema.safeParse(cloned);
  if (!parsed.success)
    return { ok: false, issues: zodIssuesToParseIssues(parsed.error.issues, cloned) };
  adopt(taken, created, scratchCreated);
  return { ok: true, value: parsed.data };
}

export function materializeAsset(input: unknown): Materialized<LoomaAsset> {
  const cloned = cloneJson(input);
  const parsed = LoomaAssetSchema.safeParse(cloned);
  if (!parsed.success)
    return { ok: false, issues: zodIssuesToParseIssues(parsed.error.issues, cloned) };
  return { ok: true, value: parsed.data };
}
