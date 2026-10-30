import type { QuoteBlock } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import { TextSlot } from '../nodes/TextSlot';
import styles from './blocks.module.css';

export function Quote({ block }: { block: QuoteBlock }) {
  return (
    <blockquote className={`${styles.block} ${styles.quote}`}>
      <TextSlot
        nodeId={block.id}
        slot="text"
        text={block.text}
        as="div"
        className={styles.slotHost}
      />
      {block.cite ? (
        <footer className={styles.cite}>
          —{' '}
          <cite>
            <InlineText text={block.cite} />
          </cite>
        </footer>
      ) : null}
    </blockquote>
  );
}
