import { BLOCK_TYPES, CONTAINER_TYPES } from '../constants';
import type { ContainerType } from '../constants';
import { createId, isValidId } from '../ids';
import type { IdKind } from '../ids';
import type { ParseIssue } from './issues';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) copy[key] = cloneJson(value[key]);
    return copy as T;
  }
  return value;
}

interface RepairContext {
  repair: boolean;
  warnings: ParseIssue[];
  reserved: Set<string>;
  seen: Set<string>;
}

function isBlockType(value: unknown): boolean {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

function isContainerType(value: unknown): value is ContainerType {
  return typeof value === 'string' && (CONTAINER_TYPES as readonly string[]).includes(value);
}

function formatType(type: unknown): string {
  if (type === undefined) return 'undefined';
  return JSON.stringify(type) ?? 'undefined';
}

function collectNodeIds(node: unknown, ids: Set<string>): void {
  if (!isPlainObject(node)) return;
  if (typeof node.id === 'string') ids.add(node.id);
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (Array.isArray(child)) {
      for (const nested of child) collectNodeIds(nested, ids);
    } else {
      collectNodeIds(child, ids);
    }
  }
}

function collectDocumentIds(doc: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  if (typeof doc.id === 'string') ids.add(doc.id);
  if (isPlainObject(doc.assets)) {
    for (const key of Object.keys(doc.assets)) ids.add(key);
  }
  if (!Array.isArray(doc.cards)) return ids;
  for (const card of doc.cards) {
    if (!isPlainObject(card)) continue;
    if (typeof card.id === 'string') ids.add(card.id);
    if (!Array.isArray(card.body)) continue;
    for (const node of card.body) collectNodeIds(node, ids);
  }
  return ids;
}

function ensureId(value: unknown, kind: IdKind, path: string, ctx: RepairContext): string {
  if (typeof value === 'string' && isValidId(value) && !ctx.seen.has(value)) {
    ctx.seen.add(value);
    return value;
  }
  const fresh = createId(kind, ctx.reserved);
  ctx.reserved.add(fresh);
  ctx.seen.add(fresh);
  const fieldPath = path.length === 0 ? 'id' : `${path}.id`;
  if (typeof value === 'string' && isValidId(value)) {
    ctx.warnings.push({
      path: fieldPath,
      message: `duplicate id "${value}", renamed to "${fresh}"`,
    });
  } else {
    ctx.warnings.push({
      path: fieldPath,
      message: `missing or invalid id, generated "${fresh}"`,
    });
  }
  return fresh;
}

function padTable(node: Record<string, unknown>, path: string, warnings: ParseIssue[]): void {
  if (!Array.isArray(node.rows)) return;
  const rows = node.rows;
  let longest = 0;
  for (const row of rows) {
    if (Array.isArray(row) && row.length > longest) longest = row.length;
  }
  let padded = false;
  const next = rows.map((row) => {
    if (!Array.isArray(row) || row.length >= longest) return row;
    padded = true;
    return [...row, ...Array.from({ length: longest - row.length }, () => '')];
  });
  if (!padded) return;
  node.rows = next;
  warnings.push({ path, message: 'padded shorter rows with empty cells' });
}

function repairNode(node: unknown, path: string, ctx: RepairContext): unknown {
  if (!isPlainObject(node)) return node;
  const type = node.type;
  const preserved = type === 'unknown' && node.raw !== undefined;
  const wrap = !preserved && !isBlockType(type) && !isContainerType(type);
  const raw = wrap ? cloneJson(node) : undefined;

  if (ctx.repair) {
    node.id = ensureId(node.id, isContainerType(type) ? 'container' : 'block', path, ctx);
  }

  if (wrap) {
    ctx.warnings.push({
      path,
      message: `unknown block type ${formatType(type)}, kept as an unsupported block`,
    });
    return { id: node.id, type: 'unknown', raw };
  }

  if (
    ctx.repair &&
    type === 'columns' &&
    node.widths === undefined &&
    Array.isArray(node.children)
  ) {
    const widths = node.children.map(() => 1);
    node.widths = widths;
    ctx.warnings.push({
      path,
      message: `missing widths, filled with ${widths.join(', ')}`,
    });
  }

  if (ctx.repair && type === 'table') padTable(node, path, ctx.warnings);

  if (type === 'columns' && Array.isArray(node.children)) {
    node.children = node.children.map((column, columnIndex) => {
      if (!Array.isArray(column)) return column;
      return column.map((child, rowIndex) =>
        repairNode(child, `${path}.children[${columnIndex}][${rowIndex}]`, ctx),
      );
    });
  } else if (
    (type === 'stack' || type === 'grid' || type === 'steps') &&
    Array.isArray(node.children)
  ) {
    node.children = node.children.map((child, index) =>
      repairNode(child, `${path}.children[${index}]`, ctx),
    );
  }

  return node;
}

export function preprocessDocument(
  doc: Record<string, unknown>,
  warnings: ParseIssue[],
  repair: boolean,
): void {
  const ctx: RepairContext = {
    repair,
    warnings,
    reserved: repair ? collectDocumentIds(doc) : new Set<string>(),
    seen: new Set<string>(),
  };
  if (repair) doc.id = ensureId(doc.id, 'document', '', ctx);
  if (!Array.isArray(doc.cards)) return;
  doc.cards = doc.cards.map((card, index) => {
    if (!isPlainObject(card)) return card;
    const path = `cards[${index}]`;
    if (repair) card.id = ensureId(card.id, 'card', path, ctx);
    if (Array.isArray(card.body)) {
      card.body = card.body.map((node, nodeIndex) =>
        repairNode(node, `${path}.body[${nodeIndex}]`, ctx),
      );
    }
    return card;
  });
}
