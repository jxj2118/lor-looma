import type { InlineNode } from './ast';

const TEXT_ESCAPES = new Set(['\\', '*', '~', '`', '[', ']', '{', '}']);

function escapeText(value: string): string {
  let out = '';
  for (const ch of value) {
    if (TEXT_ESCAPES.has(ch)) out += '\\';
    out += ch;
  }
  return out;
}

function serializeNode(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return escapeText(node.value);
    case 'break':
      return '\n';
    case 'code':
      if (node.value.includes('`')) return escapeText(node.value);
      return `\`${node.value}\``;
    case 'bold':
      return `**${serializeInline(node.children)}**`;
    case 'italic':
      return `*${serializeInline(node.children)}*`;
    case 'strike':
      return `~~${serializeInline(node.children)}~~`;
    case 'link':
      return `[${serializeInline(node.children)}](${node.href})`;
    case 'color':
      return `{color:${node.color}}${serializeInline(node.children)}{/color}`;
    case 'highlight':
      return `{highlight:${node.color}}${serializeInline(node.children)}{/highlight}`;
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

/** Serializes an inline AST back to canonical Markdown. */
export function serializeInline(nodes: readonly InlineNode[]): string {
  let out = '';
  for (const node of nodes) out += serializeNode(node);
  return out;
}
