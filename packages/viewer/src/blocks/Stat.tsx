import type { StatBlock } from '@lor-looma/core';
import { useRenderSlot } from '../nodes/context';
import { TextSlot } from '../nodes/TextSlot';
import styles from './blocks.module.css';

export function Stat({ block }: { block: StatBlock }) {
  const renderSlot = useRenderSlot();
  const showDetail = block.detail !== undefined || renderSlot !== undefined;
  return (
    <div className={`${styles.block} ${styles.stat}`} data-tone={block.tone ?? 'primary'}>
      <div className={styles.statValue}>
        <TextSlot nodeId={block.id} slot="stat:value" text={block.value} />
      </div>
      <div className={styles.statLabel}>
        <TextSlot nodeId={block.id} slot="stat:label" text={block.label} />
      </div>
      {showDetail ? (
        <div className={styles.statDetail}>
          <TextSlot nodeId={block.id} slot="stat:detail" text={block.detail ?? ''} />
        </div>
      ) : null}
    </div>
  );
}
