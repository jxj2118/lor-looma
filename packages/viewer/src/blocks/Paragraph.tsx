import type { ParagraphBlock } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import styles from './blocks.module.css';

export function Paragraph({ block }: { block: ParagraphBlock }) {
  return (
    <p className={`${styles.block} ${styles.paragraph}`} data-align={block.align}>
      <InlineText text={block.text} />
    </p>
  );
}
