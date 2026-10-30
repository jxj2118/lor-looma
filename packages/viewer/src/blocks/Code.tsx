import type { CodeBlock } from '@lor-looma/core';
import styles from './blocks.module.css';

export function Code({ block }: { block: CodeBlock }) {
  return (
    <pre className={`${styles.block} ${styles.code}`} data-language={block.language}>
      <code>{block.code}</code>
    </pre>
  );
}
