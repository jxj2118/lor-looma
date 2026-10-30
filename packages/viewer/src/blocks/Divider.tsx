import type { DividerBlock } from '@lor-looma/core';
import styles from './blocks.module.css';

export function Divider({ block: _block }: { block: DividerBlock }) {
  return <hr className={`${styles.block} ${styles.divider}`} />;
}
