import type { CodeBlock } from '@lor-looma/core';
import { useRenderSlot } from '../nodes/context';
import { slotKey } from '../nodes/TextSlot';
import styles from './blocks.module.css';

export function Code({ block }: { block: CodeBlock }) {
  const renderSlot = useRenderSlot();
  const key = slotKey({ kind: 'code' });
  const renderDefault = () => block.code;
  return (
    <pre className={`${styles.block} ${styles.code}`} data-language={block.language}>
      <code data-lm-slot={key}>
        {renderSlot ? renderSlot(block.id, key, renderDefault) : block.code}
      </code>
    </pre>
  );
}
