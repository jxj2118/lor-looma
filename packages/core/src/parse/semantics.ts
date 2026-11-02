import { MAX_CONTAINER_DEPTH, MAX_LIST_DEPTH } from '../constants';
import type { ListItem } from '../schema/blocks';
import type { LoomaDocument } from '../schema/document';
import type { LoomaNode } from '../schema/nodes';
import type { ParseIssue } from './issues';

function requireAsset(doc: LoomaDocument, id: string, path: string, issues: ParseIssue[]): void {
  if (!Object.prototype.hasOwnProperty.call(doc.assets, id)) {
    issues.push({ path, message: `references missing asset "${id}"` });
  }
}

function claimId(id: string, path: string, seen: Map<string, string>, issues: ParseIssue[]): void {
  const first = seen.get(id);
  if (first !== undefined) {
    issues.push({ path, message: `duplicate id "${id}" (first used at ${first})` });
    return;
  }
  seen.set(id, path);
}

function walkItems(
  items: readonly ListItem[],
  path: string,
  depth: number,
  issues: ParseIssue[],
): void {
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (depth > MAX_LIST_DEPTH) {
      issues.push({
        path: itemPath,
        message: `list items can be nested at most ${MAX_LIST_DEPTH} levels deep`,
      });
    }
    if (typeof item !== 'string' && item.children) {
      walkItems(item.children, `${itemPath}.children`, depth + 1, issues);
    }
  });
}

function checkTable(
  rows: readonly (readonly string[])[],
  path: string,
  issues: ParseIssue[],
): void {
  const first = rows[0]?.length ?? 0;
  for (let index = 1; index < rows.length; index += 1) {
    const length = rows[index]?.length ?? 0;
    if (length !== first) {
      issues.push({
        path,
        message: `all rows must have the same number of cells (row 0 has ${first}, row ${index} has ${length})`,
      });
      return;
    }
  }
  if (first < 1) {
    issues.push({
      path,
      message: `all rows must have the same number of cells (row 0 has ${first})`,
    });
  }
}

function walkNode(
  node: LoomaNode,
  path: string,
  depth: number,
  doc: LoomaDocument,
  seen: Map<string, string>,
  issues: ParseIssue[],
): void {
  claimId(node.id, path, seen, issues);

  if (
    node.type === 'stack' ||
    node.type === 'columns' ||
    node.type === 'grid' ||
    node.type === 'steps'
  ) {
    if (depth >= MAX_CONTAINER_DEPTH) {
      issues.push({
        path,
        message: `containers can be nested at most ${MAX_CONTAINER_DEPTH} levels deep`,
      });
    }
    if (node.type === 'columns' && node.widths.length !== node.children.length) {
      issues.push({
        path,
        message: `widths has ${node.widths.length} entries but children has ${node.children.length} columns`,
      });
    }
    if (node.type === 'columns') {
      node.children.forEach((column, columnIndex) => {
        column.forEach((child, rowIndex) => {
          walkNode(
            child,
            `${path}.children[${columnIndex}][${rowIndex}]`,
            depth + 1,
            doc,
            seen,
            issues,
          );
        });
      });
    } else {
      node.children.forEach((child, index) => {
        walkNode(child, `${path}.children[${index}]`, depth + 1, doc, seen, issues);
      });
    }
  }

  if (node.type === 'image') requireAsset(doc, node.assetId, `${path}.assetId`, issues);
  if (node.type === 'list') walkItems(node.items, `${path}.items`, 1, issues);
  if (node.type === 'table') checkTable(node.rows, path, issues);
}

export function validateDocumentSemantics(doc: LoomaDocument): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const seen = new Map<string, string>();
  doc.cards.forEach((card, cardIndex) => {
    const cardPath = `cards[${cardIndex}]`;
    claimId(card.id, cardPath, seen, issues);
    if (card.accent) requireAsset(doc, card.accent.assetId, `${cardPath}.accent.assetId`, issues);
    if (card.background?.kind === 'image') {
      requireAsset(doc, card.background.assetId, `${cardPath}.background.assetId`, issues);
    }
    card.body.forEach((node, index) => {
      walkNode(node, `${cardPath}.body[${index}]`, 0, doc, seen, issues);
    });
  });
  return issues;
}
