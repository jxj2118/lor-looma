import type { ParagraphBlock } from '@lor-looma/core';
import { TextSlot } from '../nodes/TextSlot';
import styles from './blocks.module.css';

export function Paragraph({ block }: { block: ParagraphBlock }) {
  return (
    <p className={`${styles.block} ${styles.paragraph}`} data-align={block.align}>
      <TextSlot nodeId={block.id} slot="text" text={block.text} />
    </p>
  );
}
