import { inlineToPlainText } from '../inline';
import type { ListItem } from '../schema/blocks';
import type { LoomaDocument } from '../schema/document';
import type { LoomaNode } from '../schema/nodes';

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  const plain = collapsed(text);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}…`;
}

function listTexts(items: readonly ListItem[]): string[] {
  const texts: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      texts.push(inlineToPlainText(item));
      continue;
    }
    texts.push(inlineToPlainText(item.text));
    if (item.children) texts.push(...listTexts(item.children));
  }
  return texts;
}

/** Plain-text preview of one block or container, truncated with an ellipsis. */
export function nodePreview(node: LoomaNode, doc: LoomaDocument, maxLength = 60): string {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
      return truncate(inlineToPlainText(node.text), maxLength);
    case 'quote': {
      const text = inlineToPlainText(node.text);
      const cite = node.cite ? inlineToPlainText(node.cite) : '';
      return truncate(cite ? `${text} — ${cite}` : text, maxLength);
    }
    case 'list':
      return truncate(listTexts(node.items).join('; '), maxLength);
    case 'table':
      return truncate(
        node.rows.map((row) => row.map((cell) => inlineToPlainText(cell)).join(' | ')).join(' / '),
        maxLength,
      );
    case 'image': {
      const label =
        node.caption !== undefined
          ? inlineToPlainText(node.caption)
          : (doc.assets[node.assetId]?.alt ?? '');
      return truncate(label ? `[image] ${label}` : '[image]', maxLength);
    }
    case 'code':
      return truncate(`[code] ${node.code.split('\n')[0] ?? ''}`, maxLength);
    case 'stat':
      return truncate(
        `${inlineToPlainText(node.value)} — ${inlineToPlainText(node.label)}`,
        maxLength,
      );
    case 'math':
      return truncate(node.tex, maxLength);
    case 'divider':
      return '[divider]';
    case 'unknown': {
      const rawType = node.raw.type;
      const name = typeof rawType === 'string' ? rawType : 'unknown';
      return truncate(`[unsupported: ${name}]`, maxLength);
    }
    case 'stack':
      return `[stack: ${node.children.length} items]`;
    case 'columns':
      return `[columns: ${node.children.length}]`;
    case 'grid':
      return `[grid: ${node.columns} columns, ${node.children.length} items]`;
    case 'steps':
      return `[steps: ${node.children.length} items]`;
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}
