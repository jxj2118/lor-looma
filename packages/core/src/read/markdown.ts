import type { ListItem } from '../schema/blocks';
import type { CardBackground, LoomaCard } from '../schema/card';
import type { LoomaDocument } from '../schema/document';
import type { LoomaNode } from '../schema/nodes';

function backgroundComment(background: CardBackground): string {
  if (background.kind === 'color') return `<!-- background: color ${background.value} -->`;
  if (background.kind === 'image') return `<!-- background: image asset ${background.assetId} -->`;
  return `<!-- background: gradient ${background.from} to ${background.to} -->`;
}

function idComment(node: LoomaNode): string {
  if (node.type === 'columns')
    return `<!-- id: ${node.id} columns widths=${node.widths.join(',')} -->`;
  if (node.type === 'stack') return `<!-- id: ${node.id} stack -->`;
  if (node.type === 'grid') return `<!-- id: ${node.id} grid columns=${node.columns} -->`;
  return `<!-- id: ${node.id} -->`;
}

function listLines(
  items: readonly ListItem[],
  style: 'bullet' | 'number' | 'check',
  depth: number,
): string[] {
  const lines: string[] = [];
  items.forEach((item, index) => {
    const text = typeof item === 'string' ? item : item.text;
    const indent = '  '.repeat(depth);
    let marker = '- ';
    if (style === 'number') marker = `${index + 1}. `;
    if (style === 'check') {
      const checked = typeof item !== 'string' && item.checked === true;
      marker = checked ? '- [x] ' : '- [ ] ';
    }
    lines.push(`${indent}${marker}${text}`);
    if (typeof item !== 'string' && item.children) {
      lines.push(...listLines(item.children, style, depth + 1));
    }
  });
  return lines;
}

function quoteLines(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function table(rows: readonly (readonly string[])[], header: boolean): string {
  const width = rows[0]?.length ?? 0;
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  const rule = `${'| --- '.repeat(width)}|`;
  if (header) {
    const [first, ...rest] = rows;
    return [line(first ?? []), rule, ...rest.map((row) => line(row))].join('\n');
  }
  const blank = `${'|  '.repeat(width)}|`;
  return [blank, rule, ...rows.map((row) => line(row))].join('\n');
}

function imageSrc(doc: LoomaDocument, assetId: string): { alt: string; src: string } {
  const asset = doc.assets[assetId];
  if (!asset) return { alt: '', src: `missing:${assetId}` };
  const src = asset.src.startsWith('data:') && asset.src.length > 80 ? 'data:…' : asset.src;
  return { alt: asset.alt, src };
}

function nodeBody(node: LoomaNode, doc: LoomaDocument): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(node.level)} ${node.text}`;
    case 'paragraph':
      return node.text;
    case 'list':
      return listLines(node.items, node.style, 0).join('\n');
    case 'image': {
      const { alt, src } = imageSrc(doc, node.assetId);
      const image = `![${alt}](${src})`;
      return node.caption !== undefined ? `${image}\n*${node.caption}*` : image;
    }
    case 'table':
      return table(node.rows, node.header);
    case 'callout':
      return [`> [!${node.tone.toUpperCase()}]`, quoteLines(node.text)].join('\n');
    case 'quote': {
      const lines = [quoteLines(node.text)];
      if (node.cite) lines.push(`> — ${node.cite}`);
      return lines.join('\n');
    }
    case 'divider':
      return '---';
    case 'code':
      return `\`\`\`${node.language ?? ''}\n${node.code}\n\`\`\``;
    case 'unknown': {
      const rawType = node.raw.type;
      const name = typeof rawType === 'string' ? rawType : 'unknown';
      return `<!-- unsupported block: ${name} -->`;
    }
    case 'stack':
    case 'grid':
      return [
        idComment(node),
        ...node.children.map((child) => renderNode(child, doc)),
        `<!-- end ${node.id} -->`,
      ].join('\n\n');
    case 'columns': {
      const parts = [idComment(node)];
      node.children.forEach((column, index) => {
        parts.push(`<!-- column ${index + 1}/${node.children.length} -->`);
        for (const child of column) parts.push(renderNode(child, doc));
      });
      parts.push(`<!-- end ${node.id} -->`);
      return parts.join('\n\n');
    }
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

function renderNode(node: LoomaNode, doc: LoomaDocument): string {
  if (node.type === 'stack' || node.type === 'grid' || node.type === 'columns')
    return nodeBody(node, doc);
  const body = nodeBody(node, doc);
  return body.length > 0 ? `${idComment(node)}\n${body}` : idComment(node);
}

/** Read-only Markdown for one card. Ids are comments and cannot be written back. */
export function cardToMarkdown(card: LoomaCard, doc: LoomaDocument): string {
  const header = [`<!-- card: ${card.id} -->`];
  if (card.accent)
    header.push(`<!-- accent: ${card.accent.position}, asset ${card.accent.assetId} -->`);
  if (card.background) header.push(backgroundComment(card.background));
  const blocks = [header.join('\n'), ...card.body.map((node) => renderNode(node, doc))];
  if (card.notes !== undefined) blocks.push(`<!-- notes -->\n${card.notes}`);
  return blocks.join('\n\n');
}
