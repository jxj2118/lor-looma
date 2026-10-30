import {
  HIGHLIGHT_COLORS,
  INLINE_COLORS,
  normalizeInline,
  parseInline,
  serializeInline,
} from '@lor-looma/core';
import type { HighlightColor, InlineColor, InlineNode } from '@lor-looma/core';
import type { JSONContent } from '@tiptap/core';

export type EditorMode = 'single' | 'multi';

type MarkType = 'link' | 'lmColor' | 'lmHighlight' | 'bold' | 'italic' | 'strike' | 'code';

interface Mark {
  type: MarkType;
  href?: string;
  color?: string;
}

interface Run {
  kind: 'text' | 'break';
  text: string;
  marks: Mark[];
}

const MARK_ORDER: MarkType[] = [
  'link',
  'lmColor',
  'lmHighlight',
  'bold',
  'italic',
  'strike',
  'code',
];

const INLINE_COLOR_SET: ReadonlySet<string> = new Set(INLINE_COLORS);
const HIGHLIGHT_COLOR_SET: ReadonlySet<string> = new Set(HIGHLIGHT_COLORS);

function isInlineColor(value: string): value is InlineColor {
  return INLINE_COLOR_SET.has(value);
}

function isHighlightColor(value: string): value is HighlightColor {
  return HIGHLIGHT_COLOR_SET.has(value);
}

/** Active URL schemes are not stored as link marks. Non-URL hrefs stay, matching core. */
function isDangerousHref(href: string): boolean {
  let protocol: string;
  try {
    protocol = new URL(href).protocol;
  } catch {
    return false;
  }
  return protocol !== 'http:' && protocol !== 'https:' && protocol !== 'mailto:';
}

function sameMarks(left: readonly Mark[], right: readonly Mark[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (mark, index) =>
      mark.type === right[index]?.type &&
      mark.href === right[index]?.href &&
      mark.color === right[index]?.color,
  );
}

function canonicalize(marks: readonly Mark[]): Mark[] {
  if (marks.some((mark) => mark.type === 'code')) return [{ type: 'code' }];
  const byType = new Map<MarkType, Mark>();
  for (const mark of marks) {
    if (!byType.has(mark.type)) byType.set(mark.type, mark);
  }
  return MARK_ORDER.filter((type) => byType.has(type)).map((type) => byType.get(type)!);
}

function mergeRuns(runs: readonly Run[]): Run[] {
  const merged: Run[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.kind === 'text' &&
      run.kind === 'text' &&
      sameMarks(previous.marks, run.marks)
    ) {
      previous.text += run.text;
      continue;
    }
    merged.push({ kind: run.kind, text: run.text, marks: run.marks });
  }
  return merged;
}

function astToRuns(nodes: readonly InlineNode[], inherited: readonly Mark[] = []): Run[] {
  const runs: Run[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        runs.push({ kind: 'text', text: node.value, marks: canonicalize(inherited) });
        break;
      case 'break':
        runs.push({ kind: 'break', text: '', marks: canonicalize(inherited) });
        break;
      case 'code':
        runs.push({ kind: 'text', text: node.value, marks: [{ type: 'code' }] });
        break;
      case 'bold':
        runs.push(...astToRuns(node.children, [...inherited, { type: 'bold' }]));
        break;
      case 'italic':
        runs.push(...astToRuns(node.children, [...inherited, { type: 'italic' }]));
        break;
      case 'strike':
        runs.push(...astToRuns(node.children, [...inherited, { type: 'strike' }]));
        break;
      case 'link':
        if (isDangerousHref(node.href)) runs.push(...astToRuns(node.children, inherited));
        else
          runs.push(...astToRuns(node.children, [...inherited, { type: 'link', href: node.href }]));
        break;
      case 'color':
        runs.push(
          ...astToRuns(node.children, [...inherited, { type: 'lmColor', color: node.color }]),
        );
        break;
      case 'highlight':
        runs.push(
          ...astToRuns(node.children, [...inherited, { type: 'lmHighlight', color: node.color }]),
        );
        break;
    }
  }
  return runs;
}

function pmMark(mark: Mark): { type: string; attrs?: Record<string, string> } | null {
  switch (mark.type) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return { type: mark.type };
    case 'link':
      return mark.href ? { type: 'link', attrs: { href: mark.href } } : null;
    case 'lmColor':
      return mark.color && isInlineColor(mark.color)
        ? { type: 'lmColor', attrs: { color: mark.color } }
        : null;
    case 'lmHighlight':
      return mark.color && isHighlightColor(mark.color)
        ? { type: 'lmHighlight', attrs: { color: mark.color } }
        : null;
  }
}

function runsToContent(runs: readonly Run[]): JSONContent[] {
  const content: JSONContent[] = [];
  for (const run of mergeRuns(runs)) {
    const marks = run.marks.flatMap((mark) => {
      const encoded = pmMark(mark);
      return encoded ? [encoded] : [];
    });
    if (run.kind === 'break') {
      content.push(marks.length ? { type: 'hardBreak', marks } : { type: 'hardBreak' });
      continue;
    }
    if (run.text === '' && !run.marks.some((mark) => mark.type === 'code')) continue;
    content.push(
      marks.length ? { type: 'text', text: run.text, marks } : { type: 'text', text: run.text },
    );
  }
  return content;
}

function readMarks(marks: JSONContent['marks']): Mark[] {
  const decoded: Mark[] = [];
  for (const mark of marks ?? []) {
    if (!mark.type) continue;
    if (
      mark.type === 'bold' ||
      mark.type === 'italic' ||
      mark.type === 'strike' ||
      mark.type === 'code'
    ) {
      decoded.push({ type: mark.type });
      continue;
    }
    if (mark.type === 'link') {
      const href = mark.attrs?.href;
      if (typeof href === 'string' && href && !isDangerousHref(href))
        decoded.push({ type: 'link', href });
      continue;
    }
    if (mark.type === 'lmColor') {
      const color = mark.attrs?.color;
      if (typeof color === 'string' && isInlineColor(color))
        decoded.push({ type: 'lmColor', color });
      continue;
    }
    if (mark.type === 'lmHighlight') {
      const color = mark.attrs?.color;
      if (typeof color === 'string' && isHighlightColor(color)) {
        decoded.push({ type: 'lmHighlight', color });
      }
    }
  }
  return canonicalize(decoded);
}

function contentToRuns(content: readonly JSONContent[] | undefined): Run[] {
  const runs: Run[] = [];
  for (const node of content ?? []) {
    if (node.type === 'hardBreak') {
      runs.push({ kind: 'break', text: '', marks: readMarks(node.marks) });
      continue;
    }
    if (node.type === 'text' && typeof node.text === 'string') {
      const marks = readMarks(node.marks);
      if (node.text === '' && !marks.some((mark) => mark.type === 'code')) continue;
      runs.push({ kind: 'text', text: node.text, marks });
    }
  }
  return mergeRuns(runs);
}

function pushText(nodes: InlineNode[], value: string): void {
  if (value === '') return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') {
    nodes[nodes.length - 1] = { type: 'text', value: last.value + value };
    return;
  }
  nodes.push({ type: 'text', value });
}

function sameMark(left: Mark | undefined, right: Mark | undefined): boolean {
  if (!left || !right) return false;
  return left.type === right.type && left.href === right.href && left.color === right.color;
}

function wrap(mark: Mark, children: InlineNode[]): InlineNode | null {
  if (children.length === 0) return null;
  switch (mark.type) {
    case 'bold':
      return { type: 'bold', children };
    case 'italic':
      return { type: 'italic', children };
    case 'strike':
      return { type: 'strike', children };
    case 'link':
      return mark.href ? { type: 'link', href: mark.href, children } : null;
    case 'lmColor':
      return mark.color && isInlineColor(mark.color)
        ? { type: 'color', color: mark.color, children }
        : null;
    case 'lmHighlight':
      return mark.color && isHighlightColor(mark.color)
        ? { type: 'highlight', color: mark.color, children }
        : null;
    case 'code':
      return { type: 'code', value: plainValue(children) };
  }
}

function plainValue(nodes: readonly InlineNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'code') out += node.value;
    else if (node.type !== 'break') out += plainValue(node.children);
  }
  return out;
}

function buildNodes(runs: readonly Run[], depth: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let index = 0;
  while (index < runs.length) {
    const run = runs[index];
    if (!run) break;
    const mark = run.marks[depth];
    if (!mark) {
      if (run.kind === 'break') nodes.push({ type: 'break' });
      else pushText(nodes, run.text);
      index += 1;
      continue;
    }
    if (mark.type === 'code') {
      const code = wrap(mark, [{ type: 'text', value: run.text }]);
      if (code) nodes.push(code);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < runs.length && sameMark(runs[end]?.marks[depth], mark)) end += 1;
    const children = buildNodes(runs.slice(index, end), depth + 1);
    const wrapped = wrap(mark, children);
    if (wrapped) nodes.push(wrapped);
    else nodes.push(...children);
    index = end;
  }
  return nodes;
}

function paragraph(content: JSONContent[]): JSONContent {
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** Two consecutive breaks are a paragraph boundary in multi mode. */
function splitParagraphRuns(runs: readonly Run[]): Run[][] {
  const paragraphs: Run[][] = [];
  let current: Run[] = [];
  let index = 0;
  while (index < runs.length) {
    const run = runs[index];
    const next = runs[index + 1];
    if (run?.kind === 'break' && next?.kind === 'break') {
      paragraphs.push(current);
      current = [];
      index += 2;
      continue;
    }
    if (run) current.push(run);
    index += 1;
  }
  paragraphs.push(current);
  return paragraphs.length > 0 ? paragraphs : [[]];
}

export function markdownToDoc(text: string, mode: EditorMode): JSONContent {
  const runs = mergeRuns(astToRuns(parseInline(text.replace(/\r\n/g, '\n'))));
  const groups = mode === 'multi' ? splitParagraphRuns(runs) : [runs];
  return {
    type: 'doc',
    content: groups.map((group) => paragraph(runsToContent(group))),
  };
}

export function docToMarkdown(doc: JSONContent, mode: EditorMode): string {
  const paragraphs = (doc.content ?? []).filter((node) => node.type === 'paragraph');
  const parts = paragraphs.map((node) =>
    serializeInline(buildNodes(contentToRuns(node.content), 0)),
  );
  const joined = mode === 'multi' ? parts.join('\n\n') : parts.join('\n');
  return normalizeInline(joined);
}
