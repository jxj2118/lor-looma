import type { ColumnsContainer } from '@lor-looma/core';
import type { RenderNodeInfo } from '../nodes/context';
import { NodeView } from '../nodes/NodeView';
import styles from './containers.module.css';
import { gapCss } from './gap';

export function Columns({ block, info }: { block: ColumnsContainer; info: RenderNodeInfo }) {
  const gap = gapCss(block.gap);
  return (
    <div
      data-lm-columns=""
      className={styles.columns}
      style={{
        gridTemplateColumns: block.widths.map((width) => `${width}fr`).join(' '),
        alignItems: block.align ?? 'start',
        gap,
      }}
    >
      {block.children.map((column, slot) => (
        <div key={slot} data-lm-slot={slot} className={styles.slot} style={{ gap }}>
          {column.length === 0 ? (
            <div data-lm-empty="" className={styles.empty} />
          ) : (
            column.map((child, index) => (
              <NodeView
                key={child.id}
                node={child}
                info={{ depth: info.depth + 1, parentId: block.id, slot, index }}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
