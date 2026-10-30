import type { CalloutBlock } from '@lor-looma/core';
import { TextSlot } from '../nodes/TextSlot';
import styles from './blocks.module.css';

export function Callout({ block }: { block: CalloutBlock }) {
  return (
    <div className={`${styles.block} ${styles.callout}`} role="note" data-tone={block.tone}>
      <TextSlot
        nodeId={block.id}
        slot="text"
        text={block.text}
        as="div"
        className={styles.calloutBody}
      />
    </div>
  );
}
