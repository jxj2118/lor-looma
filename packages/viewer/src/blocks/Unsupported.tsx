import type { UnknownBlock } from '@lor-looma/core';
import styles from './blocks.module.css';

function originalType(raw: UnknownBlock['raw']): string {
  const value = raw.type;
  if (typeof value === 'string' && value.length > 0) return value;
  if (value === undefined || value === null) return 'unknown';
  return String(value);
}

export function Unsupported({ block }: { block: UnknownBlock }) {
  return (
    <div className={`${styles.block} ${styles.unsupported}`}>
      <p className={styles.unsupportedLabel}>Unsupported block</p>
      <p className={styles.unsupportedType}>{originalType(block.raw)}</p>
    </div>
  );
}
