import type { ReactNode } from 'react';
import { InlineText } from '../inline/InlineText';
import { useRenderSlot } from './context';
import styles from './TextSlot.module.css';

export type SlotKey = string;

export type ParsedSlot =
  | { kind: 'text' }
  | { kind: 'item'; path: number[] }
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'code' };

const ITEM_KEY = /^item:(\d+(?:\.\d+)*)$/;
const CELL_KEY = /^cell:(\d+):(\d+)$/;

export function slotKey(slot: ParsedSlot): SlotKey {
  switch (slot.kind) {
    case 'text':
      return 'text';
    case 'code':
      return 'code';
    case 'item':
      return `item:${slot.path.join('.')}`;
    case 'cell':
      return `cell:${slot.row}:${slot.col}`;
    default: {
      const unreachable: never = slot;
      return unreachable;
    }
  }
}

export function parseSlotKey(key: SlotKey): ParsedSlot | null {
  if (key === 'text') return { kind: 'text' };
  if (key === 'code') return { kind: 'code' };
  const item = ITEM_KEY.exec(key);
  const itemPath = item?.[1];
  if (itemPath) return { kind: 'item', path: itemPath.split('.').map((part) => Number(part)) };
  if (key.startsWith('item:')) return null;
  const cell = CELL_KEY.exec(key);
  const row = cell?.[1];
  const col = cell?.[2];
  if (row !== undefined && col !== undefined) {
    return { kind: 'cell', row: Number(row), col: Number(col) };
  }
  return null;
}

export type RenderSlot = (
  nodeId: string,
  slot: SlotKey,
  renderDefault: () => ReactNode,
) => ReactNode;

export interface TextSlotProps {
  nodeId: string;
  slot: SlotKey;
  text: string;
  /** Plain text instead of inline Markdown. Used by code slots. */
  plain?: boolean;
  as?: 'span' | 'div';
  className?: string;
}

function slotBody(text: string, plain: boolean, paragraphs: boolean): ReactNode {
  if (plain) return text;
  if (!paragraphs) return <InlineText text={text} />;
  return text.split(/\n\n/).map((part, index) => (
    <p key={index}>
      <InlineText text={part} />
    </p>
  ));
}

export function TextSlot({
  nodeId,
  slot,
  text,
  plain = false,
  as = 'span',
  className,
}: TextSlotProps) {
  const renderSlot = useRenderSlot();
  const paragraphs = as === 'div' && !plain;
  const renderDefault = () => {
    const Tag = as;
    const classes = [as === 'span' ? styles.slot : undefined, className].filter(Boolean).join(' ');
    return (
      <Tag data-lm-slot={slot} className={classes || undefined}>
        {slotBody(text, plain, paragraphs)}
      </Tag>
    );
  };
  if (renderSlot) return renderSlot(nodeId, slot, renderDefault);
  return renderDefault();
}
