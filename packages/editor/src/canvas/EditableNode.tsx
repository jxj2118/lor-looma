import { findNode } from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import type { ReactNode } from 'react';
import type { RenderNodeInfo } from '@lor-looma/viewer';
import { canDropNode } from './dnd/dropTarget';
import type { DropTarget } from './dnd/dropTarget';
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
  const { messages, readOnly, viewState, rootRef, store } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const selected = useViewState((state) => state.selection.nodeIds.includes(node.id));
  const hovered = useViewState((state) => state.hoverId === node.id);
  const flashing = useViewState((state) => state.flashIds.has(node.id));
  const draggingId = useViewState((state) => state.dragState?.nodeId ?? null);
  const { attributes, listeners, setActivatorNodeRef, isDragging } = useDraggable({
    id: node.id,
    disabled: readOnly,
  });

  return (
    <div
      className={styles.node}
      data-lm-editor-node={node.id}
      data-selected={selected ? '' : undefined}
      data-hovered={hovered && !readOnly ? '' : undefined}
      data-dragging={isDragging ? '' : undefined}
      data-flash={flashing ? '' : undefined}
    >
      {readOnly ? null : (
        <DropEdge edge="before" nodeId={node.id} draggedId={draggingId} doc={doc} />
      )}
      {renderDefault()}
      {readOnly ? null : (
        <DropEdge edge="after" nodeId={node.id} draggedId={draggingId} doc={doc} />
      )}
      {readOnly ? null : <EmptyContainerDrop node={node} draggedId={draggingId} doc={doc} />}
      {readOnly ? null : (
        <button
          type="button"
          className={styles.handle}
          aria-label={messages.dragNode}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const found = findNode(store.getDocument(), node.id);
            if (!found) return;
            viewState.set({ selection: { cardId: found.cardId, nodeIds: [node.id] } });
          }}
        >
          ⋮⋮
        </button>
      )}
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

function DropEdge({
  edge,
  nodeId,
  draggedId,
  doc,
}: {
  edge: 'before' | 'after';
  nodeId: string;
  draggedId: string | null;
  doc: LoomaDocument;
}) {
  const target: DropTarget = { kind: edge, nodeId };
  const { setNodeRef, isOver } = useDroppable({ id: `${edge}:${nodeId}` });
  const allowed = draggedId !== null && canDropNode(doc, draggedId, target);
  return (
    <div
      ref={setNodeRef}
      className={edge === 'before' ? styles.dropBefore : styles.dropAfter}
      data-over={isOver && allowed ? '' : undefined}
    />
  );
}

function EmptyContainerDrop({
  node,
  draggedId,
  doc,
}: {
  node: LoomaNode;
  draggedId: string | null;
  doc: LoomaDocument;
}) {
  if (node.type === 'columns') {
    if (node.children.every((column) => column.length > 0)) return null;
    return (
      <div
        className={styles.columnHits}
        data-gap={node.gap ?? 'md'}
        style={{ gridTemplateColumns: node.widths.map((width) => `${width}fr`).join(' ') }}
      >
        {node.children.map((column, slot) =>
          column.length === 0 ? (
            <InsideDrop
              key={slot}
              draggedId={draggedId}
              doc={doc}
              target={{ kind: 'inside', parentId: node.id, slot, index: 0 }}
              dropId={`inside:${node.id}:${slot}`}
            />
          ) : (
            <div key={slot} />
          ),
        )}
      </div>
    );
  }
  if ((node.type === 'stack' || node.type === 'grid') && node.children.length === 0) {
    return (
      <InsideDrop
        draggedId={draggedId}
        doc={doc}
        target={{ kind: 'inside', parentId: node.id, index: 0 }}
        dropId={`inside:${node.id}`}
      />
    );
  }
  return null;
}

function InsideDrop({
  dropId,
  target,
  draggedId,
  doc,
}: {
  dropId: string;
  target: DropTarget;
  draggedId: string | null;
  doc: LoomaDocument;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const allowed = draggedId !== null && canDropNode(doc, draggedId, target);
  return (
    <div
      ref={setNodeRef}
      className={styles.inside}
      data-over={isOver && allowed ? '' : undefined}
    />
  );
}
