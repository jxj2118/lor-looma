import type { StepsContainer } from '@lor-looma/core';
import type { RenderNodeInfo } from '../nodes/context';
import { NodeView } from '../nodes/NodeView';
import styles from './containers.module.css';
import { gapCss } from './gap';

export function Steps({ block, info }: { block: StepsContainer; info: RenderNodeInfo }) {
  const direction = block.direction ?? 'vertical';
  return (
    <div data-lm-steps={direction} className={styles.steps} style={{ gap: gapCss(block.gap) }}>
      {block.children.length === 0 ? (
        <div data-lm-empty="" className={styles.empty} />
      ) : (
        block.children.map((child, index) => (
          <div key={child.id} className={styles.stepItem} data-lm-step={index + 1}>
            <div className={styles.stepRail}>
              <span className={styles.stepBadge}>{index + 1}</span>
              {index < block.children.length - 1 ? (
                <span className={styles.stepConnector} data-lm-connector="" aria-hidden="true" />
              ) : null}
            </div>
            <div className={styles.stepBody}>
              <NodeView
                node={child}
                info={{ depth: info.depth + 1, parentId: block.id, slot: null, index }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
