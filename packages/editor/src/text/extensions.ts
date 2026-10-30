import { HIGHLIGHT_COLORS, INLINE_COLORS, isSafeHref } from '@lor-looma/core';
import type { HighlightColor, InlineColor } from '@lor-looma/core';
import { Mark, mergeAttributes } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Code from '@tiptap/extension-code';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import Strike from '@tiptap/extension-strike';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import { highlightColorValue, inlineColorValue } from '@lor-looma/viewer';
import type { EditorMode } from './markdown';
import styles from './InlineEditor.module.css';

const INLINE_COLOR_SET: ReadonlySet<string> = new Set(INLINE_COLORS);
const HIGHLIGHT_COLOR_SET: ReadonlySet<string> = new Set(HIGHLIGHT_COLORS);

function isInlineColor(value: string): value is InlineColor {
  return INLINE_COLOR_SET.has(value);
}

function isHighlightColor(value: string): value is HighlightColor {
  return HIGHLIGHT_COLOR_SET.has(value);
}

const LmColor = Mark.create({
  name: 'lmColor',
  addAttributes() {
    return {
      color: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-lm-color]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const color = element.getAttribute('data-lm-color');
          if (!color || !isInlineColor(color)) return false;
          return { color };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes.color;
    if (typeof color !== 'string' || !isInlineColor(color)) return ['span', 0];
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: styles.color,
        'data-lm-color': color,
        style: `--lm-inline-color: ${inlineColorValue(color)}`,
      }),
      0,
    ];
  },
});

const LmHighlight = Mark.create({
  name: 'lmHighlight',
  addAttributes() {
    return {
      color: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-lm-highlight]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const color = element.getAttribute('data-lm-highlight');
          if (!color || !isHighlightColor(color)) return false;
          return { color };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes.color;
    if (typeof color !== 'string' || !isHighlightColor(color)) return ['span', 0];
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: styles.highlight,
        'data-lm-highlight': color,
        style: `--lm-inline-highlight: ${highlightColorValue(color)}`,
      }),
      0,
    ];
  },
});

export function createExtensions(options: { mode: EditorMode; placeholder?: string }): Extensions {
  const paragraph = Paragraph.extend({
    renderHTML({ HTMLAttributes }) {
      // Span stays valid inside h1/p/li/td. A div would be moved out of headings and paragraphs.
      return [options.mode === 'single' ? 'span' : 'p', HTMLAttributes, 0];
    },
  });
  const link = Link.extend({
    renderHTML({ HTMLAttributes }) {
      const href = typeof HTMLAttributes.href === 'string' ? HTMLAttributes.href : '';
      if (!isSafeHref(href)) return ['span', { 'data-lm-unsafe-link': '' }, 0];
      return [
        'a',
        mergeAttributes(HTMLAttributes, {
          href,
          class: styles.link,
          target: '_blank',
          rel: 'noopener noreferrer',
        }),
        0,
      ];
    },
  }).configure({
    openOnClick: false,
    autolink: false,
    linkOnPaste: true,
    protocols: ['http', 'https', 'mailto'],
    isAllowedUri: (url) => isSafeHref(url),
  });

  return [
    Document.extend({
      content: options.mode === 'single' ? 'paragraph' : 'paragraph+',
      renderHTML() {
        return [options.mode === 'single' ? 'span' : 'div', 0];
      },
    }),
    paragraph,
    Text,
    HardBreak,
    Bold,
    Italic,
    Strike,
    Code,
    link,
    LmColor,
    LmHighlight,
    UndoRedo,
    Placeholder.configure({ placeholder: options.placeholder ?? '' }),
  ];
}
