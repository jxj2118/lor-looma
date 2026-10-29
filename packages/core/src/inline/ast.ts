import type { HighlightColor, InlineColor } from '../constants';

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'break' }
  | { type: 'code'; value: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'strike'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'color'; color: InlineColor; children: InlineNode[] }
  | { type: 'highlight'; color: HighlightColor; children: InlineNode[] };
