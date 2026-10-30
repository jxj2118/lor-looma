import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { normalizeInline, parseInline } from '@lor-looma/core';
import type { InlineNode } from '@lor-looma/core';
import { describe, expect, it } from 'vitest';
import { createExtensions } from './extensions';
import { docToMarkdown, markdownToDoc } from './markdown';
import type { EditorMode } from './markdown';

const MARK_ORDER = ['link', 'color', 'highlight', 'bold', 'italic', 'strike', 'code'] as const;

interface FlatText {
  kind: 'text';
  text: string;
  marks: string[];
}

interface FlatBreak {
  kind: 'break';
}

type Flat = FlatText | FlatBreak;

function markToken(node: InlineNode): string | null {
  switch (node.type) {
    case 'link':
      return `link:${node.href}`;
    case 'color':
      return `color:${node.color}`;
    case 'highlight':
      return `highlight:${node.color}`;
    case 'bold':
    case 'italic':
    case 'strike':
      return node.type;
    default:
      return null;
  }
}

function orderMarks(marks: string[]): string[] {
  const unique = [...new Set(marks)];
  return unique.sort(
    (left, right) =>
      MARK_ORDER.indexOf(left.split(':')[0] as (typeof MARK_ORDER)[number]) -
      MARK_ORDER.indexOf(right.split(':')[0] as (typeof MARK_ORDER)[number]),
  );
}

function flattenNodes(nodes: readonly InlineNode[], inherited: string[]): Flat[] {
  const flat: Flat[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      flat.push({ kind: 'text', text: node.value, marks: inherited });
      continue;
    }
    if (node.type === 'break') {
      flat.push({ kind: 'break' });
      continue;
    }
    if (node.type === 'code') {
      flat.push({ kind: 'text', text: node.value, marks: ['code'] });
      continue;
    }
    const token = markToken(node);
    const next = token ? orderMarks([...inherited, token]) : inherited;
    flat.push(...flattenNodes(node.children, next));
  }
  return mergeFlat(flat);
}

function mergeFlat(items: Flat[]): Flat[] {
  const merged: Flat[] = [];
  for (const item of items) {
    const previous = merged[merged.length - 1];
    if (
      previous?.kind === 'text' &&
      item.kind === 'text' &&
      previous.marks.join('|') === item.marks.join('|')
    ) {
      previous.text += item.text;
      continue;
    }
    merged.push(item.kind === 'text' ? { ...item, marks: [...item.marks] } : item);
  }
  return merged;
}

function flatten(text: string): Flat[] {
  return flattenNodes(parseInline(text), []);
}

function expectSemantic(text: string, mode: EditorMode = 'single'): void {
  const once = docToMarkdown(markdownToDoc(text, mode), mode);
  expect(flatten(once), JSON.stringify(text)).toEqual(flatten(normalizeInline(text)));
  const twice = docToMarkdown(markdownToDoc(once, mode), mode);
  expect(twice, JSON.stringify(text)).toBe(once);
}

const CORPUS = [
  '',
  'plain',
  '**a**',
  '*a*',
  '~~a~~',
  '`a`',
  '[a](https://x.y)',
  '{color:red}a{/color}',
  '{highlight:yellow}a{/highlight}',
  'a\nb',
  'p1\n\np2',
  '**a *b* c**',
  '[a **b**](https://x.y)',
  '***x***',
  'a **b** *c* ~~d~~ `e*f`',
  'see [the **docs**](https://x.dev/a_(b))',
  '[link **bold**](https://example.com/path?q=1)',
  '{color:primary}red **bold**{/color} and {highlight:yellow}mark{/highlight}',
  'escaped \\* \\~ \\` \\[ \\] \\{ \\} \\\\ (parens are fine)',
  'line one\nline two',
  '[mail](mailto:a@b.co)',
  'a **b',
  '**a *b* c**',
  '{color:nope}x',
  'a\\qb',
  '[x](y) [z]',
  '`a*b`',
  '\\',
  '\\*not italic\\*',
  '2 * 3 = 6',
  '****',
  '`open',
  '{color:primary}hi{/color}',
  '{highlight:yellow}**hi**{/highlight}',
  'a\r\nb\nc',
  '[a](b\\)c)',
  '{color:primary}hi',
  '**{color:red}a{/color} *b***',
  '~~*{color:blue}z{/color}*~~',
  '{highlight:green}a\nb{/highlight}',
  'before [x](https://example.com) after',
  '`code` and **bold**',
  '{color:gray}{highlight:pink}mix{/highlight}{/color}',
];

const PARTS = [
  '*',
  '**',
  '~~',
  '`',
  '[',
  ']',
  '(',
  ')',
  '{color:red}',
  '{/color}',
  '{highlight:yellow}',
  '{/highlight}',
  '\\',
  '\n',
  'a',
  'b ',
  'https://x.y',
  ' ',
  'mailto:a@b.co',
];

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe('markdownToDoc', () => {
  it('maps each inline mark and line break', () => {
    expect(markdownToDoc('plain', 'single')).toMatchObject({
      content: [{ content: [{ type: 'text', text: 'plain' }] }],
    });
    expect(markdownToDoc('**a**', 'single').content?.[0]?.content?.[0]?.marks).toEqual([
      { type: 'bold' },
    ]);
    expect(markdownToDoc('*a*', 'single').content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe(
      'italic',
    );
    expect(markdownToDoc('~~a~~', 'single').content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe(
      'strike',
    );
    expect(markdownToDoc('`a`', 'single').content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe(
      'code',
    );
    expect(markdownToDoc('[a](https://x.y)', 'single').content?.[0]?.content?.[0]?.marks).toEqual([
      { type: 'link', attrs: { href: 'https://x.y' } },
    ]);
    expect(
      markdownToDoc('{color:red}a{/color}', 'single').content?.[0]?.content?.[0]?.marks,
    ).toEqual([{ type: 'lmColor', attrs: { color: 'red' } }]);
    expect(
      markdownToDoc('{highlight:yellow}a{/highlight}', 'single').content?.[0]?.content?.[0]?.marks,
    ).toEqual([{ type: 'lmHighlight', attrs: { color: 'yellow' } }]);
    expect(markdownToDoc('a\nb', 'single').content).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }],
      },
    ]);
  });

  it('splits multi-mode blank lines into paragraphs and keeps them inside one single-mode paragraph', () => {
    const multi = markdownToDoc('p1\n\np2', 'multi');
    expect(multi.content).toHaveLength(2);
    expect(multi.content?.[0]?.content?.[0]).toMatchObject({ type: 'text', text: 'p1' });
    expect(multi.content?.[1]?.content?.[0]).toMatchObject({ type: 'text', text: 'p2' });

    const single = markdownToDoc('p1\n\np2', 'single');
    expect(single.content).toHaveLength(1);
    expect(single.content?.[0]?.content?.filter((node) => node.type === 'hardBreak')).toHaveLength(
      2,
    );
  });

  it('turns an empty string into one empty paragraph and back into an empty string', () => {
    expect(markdownToDoc('', 'single')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expect(docToMarkdown(markdownToDoc('', 'single'), 'single')).toBe('');
    expect(docToMarkdown(markdownToDoc('', 'multi'), 'multi')).toBe('');
  });

  it('does not create a link mark for a javascript href', () => {
    const doc = markdownToDoc('[a](javascript:alert(1))', 'single');
    expect(JSON.stringify(doc)).not.toContain('"link"');
    expect(docToMarkdown(doc, 'single')).toBe('a)');
  });

  it('drops marks the schema does not keep and joins multi-mode paragraphs', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'ignored' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'bold' }] },
            { type: 'text', text: 'b' },
            { type: 'text', text: '', marks: [{ type: 'italic' }] },
            { type: 'weird' },
            { type: 'text', text: 'c', marks: [{ type: 'link', attrs: { href: '' } }] },
            {
              type: 'text',
              text: 'd',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
            { type: 'text', text: 'e', marks: [{ type: 'lmColor', attrs: { color: 'nope' } }] },
            {
              type: 'text',
              text: 'f',
              marks: [{ type: 'lmHighlight', attrs: { color: 'nope' } }],
            },
            { type: 'text', text: 'g', marks: [{ type: 'unknown' }, { type: '' }] },
            { type: 'text', text: '', marks: [{ type: 'code' }] },
            { type: 'hardBreak', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'h', marks: [{ type: 'code' }, { type: 'bold' }] },
          ],
        },
        { type: 'paragraph' },
      ],
    };
    expect(docToMarkdown(doc, 'multi')).toBe('**a**bcdefg``**\n**`h`\n\n');
    expect(docToMarkdown({ type: 'doc' }, 'single')).toBe('');
  });
});

describe('inline round-trip', () => {
  it.each(CORPUS)('keeps the flattened marks of %j', (text) => {
    expectSemantic(text, 'single');
    expectSemantic(text, 'multi');
  });

  it('round-trips 2000 deterministic random strings', () => {
    const random = createRandom(42);
    for (let index = 0; index < 2000; index += 1) {
      const length = 1 + Math.floor(random() * 24);
      let text = '';
      for (let piece = 0; piece < length; piece += 1) {
        text += PARTS[Math.floor(random() * PARTS.length)] ?? '';
      }
      expectSemantic(text, index % 2 === 0 ? 'single' : 'multi');
    }
  });
});

describe('createExtensions', () => {
  it('loads inline markdown and drops block markup that the schema does not allow', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: createExtensions({ mode: 'single' }),
      content: markdownToDoc('**a** b', 'single'),
    });
    expect(docToMarkdown(editor.getJSON(), 'single')).toBe('**a** b');
    editor.commands.insertContent('<h1>x</h1><ul><li>y</li></ul>');
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('heading');
    expect(json).not.toContain('bulletList');
    expect(json).not.toContain('listItem');
    editor.destroy();
  });

  it('parses color and highlight spans and renders an unsafe link as text', () => {
    const host = document.createElement('div');
    const editor = new Editor({
      element: host,
      extensions: createExtensions({ mode: 'single', placeholder: 'Hint' }),
      content:
        '<p><span data-lm-color="red">R</span><span data-lm-color="nope">N</span><span data-lm-highlight="yellow">Y</span><span data-lm-highlight="nope">Z</span><a href="https://ok.example">ok</a><a href="javascript:x">bad</a></p>',
    });
    const html = editor.getHTML();
    expect(html).toContain('data-lm-color="red"');
    expect(html).not.toContain('data-lm-color="nope"');
    expect(html).toContain('data-lm-highlight="yellow"');
    expect(html).not.toContain('data-lm-highlight="nope"');
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bad',
              marks: [{ type: 'link', attrs: { href: 'javascript:x' } }],
            },
          ],
        },
      ],
    });
    expect(editor.getHTML()).toContain('data-lm-unsafe-link');
    expect(editor.getHTML()).not.toContain('href="javascript:x"');
    editor.commands.setTextSelection({ from: 1, to: 2 });
    editor.commands.setMark('lmColor', { color: 'nope' });
    editor.commands.setMark('lmHighlight', { color: 'nope' });
    expect(editor.getHTML()).not.toContain('data-lm-color="nope"');
    editor.destroy();

    const multiHost = document.createElement('div');
    const multi = new Editor({
      element: multiHost,
      extensions: createExtensions({ mode: 'multi' }),
      content: markdownToDoc('a\n\nb', 'multi'),
    });
    const rendered = DOMSerializer.fromSchema(multi.schema).serializeNode(multi.state.doc);
    if (!(rendered instanceof HTMLElement)) throw new Error('expected an element');
    expect(rendered.nodeName).toBe('DIV');
    expect(rendered.querySelector('p')).not.toBeNull();
    multi.destroy();
  });
});
