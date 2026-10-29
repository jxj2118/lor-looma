import { ALLOWED_LINK_PROTOCOLS } from '../constants';
import type { InlineNode } from './ast';
import { parseInline } from './parse';
import { serializeInline } from './serialize';

export type { InlineNode } from './ast';
export { parseInline } from './parse';
export { serializeInline } from './serialize';

/** Parses then serializes, producing the canonical form of inline text. */
export function normalizeInline(text: string): string {
  return serializeInline(parseInline(text));
}

function nodesToPlain(nodes: readonly InlineNode[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'code':
        out += node.value;
        break;
      case 'break':
        out += ' ';
        break;
      case 'bold':
      case 'italic':
      case 'strike':
      case 'link':
      case 'color':
      case 'highlight':
        out += nodesToPlain(node.children);
        break;
      default: {
        const unreachable: never = node;
        return unreachable;
      }
    }
  }
  return out;
}

/** Strips marks. Line breaks become spaces and links keep their labels. */
export function inlineToPlainText(text: string): string {
  return nodesToPlain(parseInline(text));
}

/** True when `href` uses http, https, or mailto. */
export function isSafeHref(href: string): boolean {
  let protocol: string;
  try {
    protocol = new URL(href).protocol;
  } catch {
    return false;
  }
  for (const allowed of ALLOWED_LINK_PROTOCOLS) {
    if (protocol === allowed) return true;
  }
  return false;
}
