import type { LoomaNode } from '@lor-looma/core';
import type { ReactNode } from 'react';
import type { RenderNodeInfo } from '@lor-looma/viewer';
import { useEditorContext, useViewState } from '../state/viewState';
import styles from './EditableNode.module.css';

export function EditableNode({
  node,
  renderDefault,
}: {
  node: LoomaNode;
  info: RenderNodeInfo;
  renderDefault: () => ReactNode;
}) {
  const { messages, readOnly } = useEditorContext();
  const selected = useViewState((state) => state.selection.nodeIds.includes(node.id));
  const hovered = useViewState((state) => state.hoverId === node.id);
  const flashing = useViewState((state) => state.flashIds.has(node.id));

  return (
    <div
      className={styles.node}
      data-lm-editor-node={node.id}
      data-selected={selected ? '' : undefined}
      data-hovered={hovered && !readOnly ? '' : undefined}
      data-flash={flashing ? '' : undefined}
    >
      {renderDefault()}
      {hovered && !readOnly ? (
        <button
          type="button"
          className={styles.add}
          aria-label={messages.addBlock}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
