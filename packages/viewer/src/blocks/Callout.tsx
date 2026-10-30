import type { CalloutBlock } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import styles from './blocks.module.css';

function segments(text: string): string[] {
  return text.split(/\n\n/);
}

export function Callout({ block }: { block: CalloutBlock }) {
  return (
    <div className={`${styles.block} ${styles.callout}`} role="note" data-tone={block.tone}>
      <div className={styles.calloutBody}>
        {segments(block.text).map((part, index) => (
          <p key={index} className={styles.paragraph}>
            <InlineText text={part} />
          </p>
        ))}
      </div>
    </div>
  );
}
