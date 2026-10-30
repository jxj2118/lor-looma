import type { QuoteBlock } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import styles from './blocks.module.css';

function segments(text: string): string[] {
  return text.split(/\n\n/);
}

export function Quote({ block }: { block: QuoteBlock }) {
  return (
    <blockquote className={`${styles.block} ${styles.quote}`}>
      {segments(block.text).map((part, index) => (
        <p key={index}>
          <InlineText text={part} />
        </p>
      ))}
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
