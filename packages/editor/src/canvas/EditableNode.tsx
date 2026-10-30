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
  const { messages, readOnly, viewState, rootRef } = useEditorContext();
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
            const rect = event.currentTarget.getBoundingClientRect();
            const box = rootRef.current?.getBoundingClientRect();
            viewState.set({
              slash: {
                target: { kind: 'after', nodeId: node.id },
                source: 'button',
                query: '',
                anchor: {
                  x: rect.left - (box?.left ?? 0),
                  y: rect.bottom - (box?.top ?? 0),
                },
              },
            });
          }}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
