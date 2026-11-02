import type { MathBlock as MathNode } from '@lor-looma/core';
import { InlineText } from '../inline/InlineText';
import { useRenderSlot } from '../nodes/context';
import { slotKey } from '../nodes/TextSlot';
import styles from './blocks.module.css';
import { renderMathTex } from './mathRender';

export function MathBlock({ block }: { block: MathNode }) {
  const renderSlot = useRenderSlot();
  const key = slotKey({ kind: 'code' });
  const renderDefault = () => (
    <div className={styles.mathDisplay} data-lm-math="" data-lm-slot={key}>
      {renderMathTex(block.tex)}
    </div>
  );

  return (
    <figure className={`${styles.block} ${styles.math}`}>
      {renderSlot ? renderSlot(block.id, key, renderDefault) : renderDefault()}
      {block.caption ? (
        <figcaption className={styles.caption}>
          <InlineText text={block.caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}
