import { findCard, findNode } from '@lor-looma/core';
import type { FoundNode, LoomaDocument, LoomaNode } from '@lor-looma/core';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { selectCard, selectionAfterDelete } from '../state/selection';
import { topLevelSplitTarget } from '../state/splitTarget';
import { duplicateSelection, duplicatedNodeIds, moveSelection } from '../state/shortcuts';
import { useEditorContext, useViewState } from '../state/viewState';
import { canDropNode } from './dnd/dropTarget';
import type { DropTarget } from './dnd/dropTarget';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import type { ReactNode } from 'react';
import type { RenderNodeInfo } from '@lor-looma/viewer';
import styles from './EditableNode.module.css';

interface NodeMenuState {
  x: number;
  y: number;
}

function siblingList(doc: LoomaDocument, found: FoundNode): LoomaNode[] | null {
  if (found.parentId === found.cardId) return findCard(doc, found.cardId)?.card.body ?? null;
  const parent = findNode(doc, found.parentId);
  if (!parent) return null;
  if (parent.node.type === 'columns') {
    if (found.slot === null) return null;
    return parent.node.children[found.slot] ?? null;
  }
  if (parent.node.type === 'stack' || parent.node.type === 'grid') return parent.node.children;
  return null;
}

export function EditableNode({
  node,
  renderDefault,
}: {
  node: LoomaNode;
  info: RenderNodeInfo;
  renderDefault: () => ReactNode;
}) {
  const { messages, readOnly, viewState, rootRef, layerElement, store } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const selected = useViewState((state) => state.selection.nodeIds.includes(node.id));
  const hovered = useViewState((state) => state.hoverId === node.id);
  const flashing = useViewState((state) => state.flashIds.has(node.id));
  const draggingId = useViewState((state) => state.dragState?.nodeId ?? null);
  const [menu, setMenu] = useState<NodeMenuState | null>(null);
  const { attributes, listeners, setActivatorNodeRef, isDragging } = useDraggable({
    id: node.id,
    disabled: readOnly,
  });

  const activeMenu = isDragging ? null : menu;

  useEffect(() => {
    if (!activeMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-lm-node-menu]')) return;
      setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [activeMenu]);

  function openMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const found = findNode(store.getDocument(), node.id);
    if (!found) return;
    viewState.set({ selection: { cardId: found.cardId, nodeIds: [node.id] } });
    const rect = event.currentTarget.getBoundingClientRect();
    const box = rootRef.current?.getBoundingClientRect();
    setMenu((current) =>
      current
        ? null
        : {
            x: rect.left - (box?.left ?? 0),
            y: rect.bottom + 4 - (box?.top ?? 0),
          },
    );
  }

  return (
    <div
      className={styles.node}
      data-lm-editor-node={node.id}
      data-selected={selected ? '' : undefined}
      data-hovered={(hovered || activeMenu !== null) && !readOnly ? '' : undefined}
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
          aria-expanded={activeMenu !== null}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          onClick={openMenu}
        >
          ⋮⋮
        </button>
      )}
      {(hovered || activeMenu !== null) && !readOnly ? (
        <button
          type="button"
          className={styles.add}
          aria-label={messages.addBlock}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenu(null);
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
      {!readOnly && node.type === 'columns'
        ? node.widths
            .slice(0, -1)
            .map((_, index) => <ColumnResizeHandle key={index} node={node} index={index} />)
        : null}
      {activeMenu && layerElement
        ? createPortal(
            <NodeContextMenu
              nodeId={node.id}
              x={activeMenu.x}
              y={activeMenu.y}
              onClose={() => setMenu(null)}
            />,
            layerElement,
          )
        : null}
    </div>
  );
}

function NodeContextMenu({
  nodeId,
  x,
  y,
  onClose,
}: {
  nodeId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { store, messages, viewState } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const found = findNode(doc, nodeId);
  if (!found) return null;
  const list = siblingList(doc, found);
  const atStart = found.index <= 0;
  const atEnd = !list || found.index >= list.length - 1;
  const selection = { cardId: found.cardId, nodeIds: [nodeId] };
  const splitTarget = topLevelSplitTarget(doc, nodeId);

  function move(direction: 'up' | 'down') {
    const commands = moveSelection(store.getDocument(), selection, direction);
    if (!commands) return;
    store.apply(commands, {
      origin: 'user',
      label: direction === 'up' ? 'Move up' : 'Move down',
    });
    onClose();
  }

  function duplicate() {
    const plan = duplicateSelection(store.getDocument(), selection);
    if (!plan) return;
    const applied = store.apply(plan.commands, { origin: 'user', label: 'Duplicate' });
    if (!applied.ok) return;
    const nodeIds = duplicatedNodeIds(applied.doc, applied.createdIds);
    const anchor = nodeIds[0];
    const cardId = anchor ? (findNode(applied.doc, anchor)?.cardId ?? found?.cardId ?? null) : null;
    viewState.set({ selection: { cardId, nodeIds } });
    onClose();
  }

  function remove() {
    const next = selectionAfterDelete(store.getDocument(), selection);
    const applied = store.apply([{ op: 'deleteNode', id: nodeId }], {
      origin: 'user',
      label: 'Delete',
    });
    if (applied.ok) viewState.set({ selection: next });
    onClose();
  }

  function splitHere() {
    if (!splitTarget) return;
    const applied = store.apply(
      [{ op: 'splitCard', id: splitTarget.cardId, atNodeId: splitTarget.topNodeId }],
      { origin: 'user', label: 'Split card' },
    );
    if (!applied.ok) return;
    const newCardId = applied.createdIds[0];
    if (newCardId) viewState.set({ selection: selectCard(newCardId), editing: null });
    onClose();
  }

  function unwrap() {
    if (!found) return;
    const applied = store.apply([{ op: 'unwrapNode', id: nodeId }], {
      origin: 'user',
      label: 'Unwrap',
    });
    if (applied.ok) {
      viewState.set({
        selection:
          found.parentId === found.cardId
            ? { cardId: found.cardId, nodeIds: [] }
            : { cardId: found.cardId, nodeIds: [found.parentId] },
      });
    }
    onClose();
  }

  const isContainer =
    found.node.type === 'stack' || found.node.type === 'columns' || found.node.type === 'grid';

  return (
    <div className={styles.menu} data-lm-node-menu="" role="menu" style={{ left: x, top: y }}>
      <button type="button" role="menuitem" onClick={duplicate}>
        {messages.duplicate}
      </button>
      <button type="button" role="menuitem" disabled={atStart} onClick={() => move('up')}>
        {messages.moveUp}
      </button>
      <button type="button" role="menuitem" disabled={atEnd} onClick={() => move('down')}>
        {messages.moveDown}
      </button>
      {splitTarget ? (
        <button type="button" role="menuitem" onClick={splitHere}>
          {messages.splitCardHere}
        </button>
      ) : null}
      {isContainer ? (
        <button type="button" role="menuitem" onClick={unwrap}>
          {messages.unwrapContainer}
        </button>
      ) : null}
      {found.parentId !== found.cardId ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            viewState.set({ selection: { cardId: found.cardId, nodeIds: [found.parentId] } });
            onClose();
          }}
        >
          {messages.selectParent}
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={remove}>
        {messages.delete}
      </button>
    </div>
  );
}

function ColumnResizeHandle({
  node,
  index,
}: {
  node: Extract<LoomaNode, { type: 'columns' }>;
  index: number;
}) {
  const { store, messages } = useEditorContext();
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  const total = node.widths.reduce((sum, width) => sum + width, 0) || 1;
  const before = node.widths.slice(0, index + 1).reduce((sum, width) => sum + width, 0);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const grid = event.currentTarget
      .closest('[data-lm-editor-node]')
      ?.querySelector('[data-lm-columns]');
    if (!(grid instanceof HTMLElement)) return;
    stopRef.current?.();
    const bounds = grid.getBoundingClientRect();
    const startX = event.clientX;
    const widths = node.widths.map((width) => width);
    const leftStart = widths[index] ?? 1;
    const rightStart = widths[index + 1] ?? 1;
    const sum = leftStart + rightStart;
    const weightTotal = widths.reduce((acc, width) => acc + width, 0) || 1;
    const widthPx = bounds.width > 0 ? bounds.width : 1;

    const move = (moveEvent: PointerEvent) => {
      let left = leftStart + ((moveEvent.clientX - startX) / widthPx) * weightTotal;
      const min = 0.2;
      if (sum >= min * 2) {
        if (left < min) left = min;
        if (sum - left < min) left = sum - min;
      }
      left = Math.round(left * 100) / 100;
      let right = Math.round((sum - left) * 100) / 100;
      if (right < min && sum >= min * 2) {
        right = min;
        left = Math.round((sum - right) * 100) / 100;
      }
      const next = widths.slice();
      next[index] = left;
      next[index + 1] = right;
      store.apply([{ op: 'updateNode', id: node.id, patch: { widths: next } }], {
        origin: 'user',
        label: 'Resize columns',
        mergeKey: `col-width:${node.id}`,
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopRef.current = null;
    };
    stopRef.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={messages.resizeColumns}
      data-lm-column-resizer={index}
      className={styles.columnResizer}
      style={{ left: `${(before / total) * 100}%` }}
      onPointerDown={onPointerDown}
    />
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
