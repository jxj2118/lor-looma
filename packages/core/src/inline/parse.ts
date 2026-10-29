import { HIGHLIGHT_COLORS, INLINE_COLORS } from '../constants';
import type { HighlightColor, InlineColor } from '../constants';
import type { InlineNode } from './ast';

const ESCAPABLE = new Set(['\\', '*', '~', '`', '[', ']', '(', ')', '{', '}']);
const INLINE_COLOR_SET: ReadonlySet<string> = new Set(INLINE_COLORS);
const HIGHLIGHT_COLOR_SET: ReadonlySet<string> = new Set(HIGHLIGHT_COLORS);

interface Sequence {
  nodes: InlineNode[];
  /** Index of the closer when `closed` is true; otherwise the end of the input. */
  pos: number;
  closed: boolean;
}

function isInlineColor(value: string): value is InlineColor {
  return INLINE_COLOR_SET.has(value);
}

function isHighlightColor(value: string): value is HighlightColor {
  return HIGHLIGHT_COLOR_SET.has(value);
}

function pushText(nodes: InlineNode[], value: string): void {
  if (value === '') return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') {
    last.value += value;
    return;
  }
  nodes.push({ type: 'text', value });
}

function readCode(src: string, pos: number): { value: string; end: number } | null {
  const close = src.indexOf('`', pos + 1);
  if (close === -1) return null;
  return { value: src.slice(pos + 1, close), end: close + 1 };
}

function scanHref(src: string, start: number): { href: string; end: number } | null {
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === undefined) break;
    if (ch === '\\') {
      const next = src[i + 1];
      if (next !== undefined && ESCAPABLE.has(next)) {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === ')') return { href: src.slice(start, i), end: i + 1 };
    if (/\s/.test(ch)) return null;
    i += 1;
  }
  return null;
}

function parseSequence(src: string, pos: number, closer: string | null, inLink: boolean): Sequence {
  const nodes: InlineNode[] = [];

  while (pos < src.length) {
    if (closer !== null && src.startsWith(closer, pos)) {
      return { nodes, pos, closed: true };
    }

    const ch = src[pos];
    if (ch === undefined) break;

    if (ch === '\\') {
      const next = src[pos + 1];
      if (next !== undefined && ESCAPABLE.has(next)) {
        pushText(nodes, next);
        pos += 2;
        continue;
      }
      pushText(nodes, '\\');
      pos += 1;
      continue;
    }

    if (ch === '`') {
      const code = readCode(src, pos);
      if (code) {
        nodes.push({ type: 'code', value: code.value });
        pos = code.end;
        continue;
      }
      pushText(nodes, '`');
      pos += 1;
      continue;
    }

    if (ch === '\n') {
      nodes.push({ type: 'break' });
      pos += 1;
      continue;
    }

    const wrapped = tryWrappers(src, pos, inLink);
    if (wrapped) {
      nodes.push(wrapped.node);
      pos = wrapped.pos;
      continue;
    }

    pushText(nodes, ch);
    pos += 1;
  }

  return { nodes, pos, closed: closer === null };
}

function tryWrap(
  src: string,
  pos: number,
  opener: string,
  closer: string,
  inLink: boolean,
): { nodes: InlineNode[]; pos: number } | null {
  if (!src.startsWith(opener, pos)) return null;
  const inner = parseSequence(src, pos + opener.length, closer, inLink);
  if (!inner.closed || inner.nodes.length === 0) return null;
  return { nodes: inner.nodes, pos: inner.pos + closer.length };
}

function tryLink(src: string, pos: number): { node: InlineNode; pos: number } | null {
  if (src[pos] !== '[') return null;
  const label = parseSequence(src, pos + 1, ']', true);
  if (!label.closed || label.nodes.length === 0) return null;
  const afterLabel = label.pos + 1;
  if (src[afterLabel] !== '(') return null;
  const href = scanHref(src, afterLabel + 1);
  if (!href) return null;
  return { node: { type: 'link', href: href.href, children: label.nodes }, pos: href.end };
}

function tryBrace(
  src: string,
  pos: number,
  inLink: boolean,
): { node: InlineNode; pos: number } | null {
  const color = /^\{color:([a-z]+)\}/.exec(src.slice(pos));
  if (color) {
    const name = color[1];
    if (name && isInlineColor(name)) {
      const closer = '{/color}';
      const inner = parseSequence(src, pos + color[0].length, closer, inLink);
      if (inner.closed && inner.nodes.length > 0) {
        return {
          node: { type: 'color', color: name, children: inner.nodes },
          pos: inner.pos + closer.length,
        };
      }
    }
    return null;
  }

  const highlight = /^\{highlight:([a-z]+)\}/.exec(src.slice(pos));
  if (!highlight) return null;
  const name = highlight[1];
  if (!name || !isHighlightColor(name)) return null;
  const closer = '{/highlight}';
  const inner = parseSequence(src, pos + highlight[0].length, closer, inLink);
  if (!inner.closed || inner.nodes.length === 0) return null;
  return {
    node: { type: 'highlight', color: name, children: inner.nodes },
    pos: inner.pos + closer.length,
  };
}

function tryWrappers(
  src: string,
  pos: number,
  inLink: boolean,
): { node: InlineNode; pos: number } | null {
  const bold = tryWrap(src, pos, '**', '**', inLink);
  if (bold) return { node: { type: 'bold', children: bold.nodes }, pos: bold.pos };

  const strike = tryWrap(src, pos, '~~', '~~', inLink);
  if (strike) return { node: { type: 'strike', children: strike.nodes }, pos: strike.pos };

  const italic = tryWrap(src, pos, '*', '*', inLink);
  if (italic) return { node: { type: 'italic', children: italic.nodes }, pos: italic.pos };

  if (!inLink) {
    const link = tryLink(src, pos);
    if (link) return link;
  }

  return tryBrace(src, pos, inLink);
}

/** Parses the inline Markdown subset into an AST. `\r\n` is normalized to `\n` first. */
export function parseInline(text: string): InlineNode[] {
  const src = text.replace(/\r\n/g, '\n');
  return parseSequence(src, 0, null, false).nodes;
}
