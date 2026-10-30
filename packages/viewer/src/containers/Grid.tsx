import type { GridContainer } from '@lor-looma/core';
import type { RenderNodeInfo } from '../nodes/context';
import { NodeView } from '../nodes/NodeView';
import styles from './containers.module.css';
import { gapCss } from './gap';

export function Grid({ block, info }: { block: GridContainer; info: RenderNodeInfo }) {
  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))`,
        gap: gapCss(block.gap),
      }}
    >
      {block.children.length === 0 ? (
        <div data-lm-empty="" className={styles.empty} />
      ) : (
        block.children.map((child, index) => (
          <NodeView
            key={child.id}
            node={child}
            info={{ depth: info.depth + 1, parentId: block.id, slot: null, index }}
          />
        ))
      )}
    </div>
  );
}
