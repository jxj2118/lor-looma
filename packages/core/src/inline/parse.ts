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

interface Memo {
  src: string;
  cache: Map<string, Sequence>;
}

function isInlineColor(value: string): value is InlineColor {
  return INLINE_COLOR_SET.has(value);
}

function isHighlightColor(value: string): value is HighlightColor {
  return HIGHLIGHT_COLOR_SET.has(value);
}

/** Replaces the last text node instead of mutating it, so a cached node stays unchanged. */
function pushText(nodes: InlineNode[], value: string): void {
  if (value === '') return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') {
    nodes[nodes.length - 1] = { type: 'text', value: last.value + value };
    return;
  }
  nodes.push({ type: 'text', value });
}

function cloneNodes(nodes: readonly InlineNode[]): InlineNode[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text':
        return { type: 'text', value: node.value };
      case 'break':
        return { type: 'break' };
      case 'code':
        return { type: 'code', value: node.value };
      case 'bold':
        return { type: 'bold', children: cloneNodes(node.children) };
      case 'italic':
        return { type: 'italic', children: cloneNodes(node.children) };
      case 'strike':
        return { type: 'strike', children: cloneNodes(node.children) };
      case 'link':
        return { type: 'link', href: node.href, children: cloneNodes(node.children) };
      case 'color':
        return { type: 'color', color: node.color, children: cloneNodes(node.children) };
      case 'highlight':
        return { type: 'highlight', color: node.color, children: cloneNodes(node.children) };
      default: {
        const unreachable: never = node;
        return unreachable;
      }
    }
  });
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

function memoKey(pos: number, closer: string | null, inLink: boolean): string {
  return `${pos}:${inLink ? 1 : 0}:${closer ?? ''}`;
}

function parseSequence(memo: Memo, pos: number, closer: string | null, inLink: boolean): Sequence {
  const key = memoKey(pos, closer, inLink);
  const cached = memo.cache.get(key);
  if (cached) return cached;

  const src = memo.src;
  const nodes: InlineNode[] = [];
  while (pos < src.length) {
    if (closer !== null && src.startsWith(closer, pos)) {
      const found: Sequence = { nodes, pos, closed: true };
      memo.cache.set(key, found);
      return found;
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

    const wrapped = tryWrappers(memo, pos, inLink);
    if (wrapped && 'failedAt' in wrapped) {
      if (closer !== null && wrapped.closer === closer) {
        const unfinished: Sequence = { nodes: [], pos: wrapped.failedAt, closed: false };
        memo.cache.set(key, unfinished);
        return unfinished;
      }
    } else if (wrapped) {
      nodes.push(...wrapped.nodes);
      pos = wrapped.pos;
      continue;
    }

    pushText(nodes, ch);
    pos += 1;
  }

  const finished: Sequence = { nodes, pos, closed: closer === null };
  memo.cache.set(key, finished);
  return finished;
}

type WrapNodes = { nodes: InlineNode[]; pos: number };
type WrapMiss = { failedAt: number; closer: string };
type WrapResult = WrapNodes | WrapMiss | null;

function isMiss(result: WrapResult): result is WrapMiss {
  return result !== null && 'failedAt' in result;
}

function tryWrap(
  memo: Memo,
  pos: number,
  opener: string,
  closer: string,
  inLink: boolean,
): WrapResult {
  const src = memo.src;
  if (!src.startsWith(opener, pos)) return null;
  const contentStart = pos + opener.length;
  if (src.indexOf(closer, contentStart) === -1) return null;
  const inner = parseSequence(memo, contentStart, closer, inLink);
  if (!inner.closed) return { failedAt: inner.pos, closer };
  if (inner.nodes.length === 0) return null;
  return { nodes: cloneNodes(inner.nodes), pos: inner.pos + closer.length };
}

function tryLink(memo: Memo, pos: number): { node: InlineNode; pos: number } | null {
  const src = memo.src;
  if (src[pos] !== '[') return null;
  if (src.indexOf(']', pos + 1) === -1) return null;
  const label = parseSequence(memo, pos + 1, ']', true);
  if (!label.closed || label.nodes.length === 0) return null;
  const afterLabel = label.pos + 1;
  if (src[afterLabel] !== '(') return null;
  if (src.indexOf(')', afterLabel + 1) === -1) return null;
  const href = scanHref(src, afterLabel + 1);
  if (!href) return null;
  return {
    node: { type: 'link', href: href.href, children: cloneNodes(label.nodes) },
    pos: href.end,
  };
}

function readBraceName(
  src: string,
  pos: number,
  prefix: string,
): { name: string; end: number } | null {
  if (!src.startsWith(prefix, pos)) return null;
  let i = pos + prefix.length;
  const nameStart = i;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '}') break;
    if (ch === undefined || ch < 'a' || ch > 'z') return null;
    i += 1;
    if (i - nameStart > 32) return null;
  }
  if (src[i] !== '}') return null;
  return { name: src.slice(nameStart, i), end: i + 1 };
}

function tryBrace(memo: Memo, pos: number, inLink: boolean): WrapResult {
  const src = memo.src;
  const color = readBraceName(src, pos, '{color:');
  if (color) {
    if (!isInlineColor(color.name)) return null;
    const closer = '{/color}';
    if (src.indexOf(closer, color.end) === -1) return null;
    const inner = parseSequence(memo, color.end, closer, inLink);
    if (!inner.closed) return { failedAt: inner.pos, closer };
    if (inner.nodes.length === 0) return null;
    return {
      nodes: [{ type: 'color', color: color.name, children: cloneNodes(inner.nodes) }],
      pos: inner.pos + closer.length,
    };
  }

  const highlight = readBraceName(src, pos, '{highlight:');
  if (!highlight || !isHighlightColor(highlight.name)) return null;
  const closer = '{/highlight}';
  if (src.indexOf(closer, highlight.end) === -1) return null;
  const inner = parseSequence(memo, highlight.end, closer, inLink);
  if (!inner.closed) return { failedAt: inner.pos, closer };
  if (inner.nodes.length === 0) return null;
  return {
    nodes: [{ type: 'highlight', color: highlight.name, children: cloneNodes(inner.nodes) }],
    pos: inner.pos + closer.length,
  };
}

function tryWrappers(memo: Memo, pos: number, inLink: boolean): WrapResult {
  const bold = tryWrap(memo, pos, '**', '**', inLink);
  if (isMiss(bold)) return bold;
  if (bold) return { nodes: [{ type: 'bold', children: bold.nodes }], pos: bold.pos };

  const strike = tryWrap(memo, pos, '~~', '~~', inLink);
  if (isMiss(strike)) return strike;
  if (strike) return { nodes: [{ type: 'strike', children: strike.nodes }], pos: strike.pos };

  const italic = tryWrap(memo, pos, '*', '*', inLink);
  if (isMiss(italic)) return italic;
  if (italic) return { nodes: [{ type: 'italic', children: italic.nodes }], pos: italic.pos };

  if (!inLink) {
    const link = tryLink(memo, pos);
    if (link) return { nodes: [link.node], pos: link.pos };
  }

  return tryBrace(memo, pos, inLink);
}

/** Parses the inline Markdown subset into an AST. `\r\n` is normalized to `\n` first. */
export function parseInline(text: string): InlineNode[] {
  const memo: Memo = { src: text.replace(/\r\n/g, '\n'), cache: new Map() };
  return parseSequence(memo, 0, null, false).nodes;
}
