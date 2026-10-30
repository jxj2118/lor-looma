import type { HeadingBlock } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import styles from './blocks.module.css';

const TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

export function Heading({ block }: { block: HeadingBlock }) {
  const Tag = TAG[block.level];
  return (
    <Tag className={`${styles.block} ${styles.heading}`} data-level={block.level}>
      <InlineText text={block.text} />
    </Tag>
  );
}
