import { findNode } from '@lor-looma/core';
import type { LoomaCard, LoomaDocument } from '@lor-looma/core';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  LOGICAL_SIZE,
  LoomaCardView,
  ScaledFrame,
  useCardOverflow,
  useLoomaDocument,
} from '@lor-looma/viewer';
import type { RenderNode, RenderSlot } from '@lor-looma/viewer';
import { parseSlotKey } from '@lor-looma/viewer';
import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { selectCard, selectNode } from '../state/selection';
import { useEditorContext, useViewState } from '../state/viewState';
import { defaultSlot, isTextNodeType } from '../text/slots';
import { toggleChecked } from '../text/structure';
import { buildMoveNodeCommand, canDropNode, parseDropId } from './dnd/dropTarget';
import { EditableNode } from './EditableNode';
import { EditableSlot } from './EditableSlot';
import styles from './Canvas.module.css';

const nodeCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return [];
  const ranked = [...hits].sort((left, right) => {
    const area = (id: typeof left.id) => {
      const rect = args.droppableRects.get(id);
      return (rect?.width ?? 0) * (rect?.height ?? 0);
    };
    return area(left.id) - area(right.id);
  });
  const first = ranked[0];
  return first ? [first] : [];
};

export function Canvas() {
  const { store, messages, readOnly, viewState, finishEditing, layerElement } = useEditorContext();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const doc = useLoomaDocument({ store });
  const canvasRef = useRef<HTMLDivElement>(null);
  const renderNode = useCallback<RenderNode>(
    (node, renderDefault, info) => (
      <EditableNode node={node} info={info} renderDefault={renderDefault} />
    ),
    [],
  );
  const renderSlot = useCallback<RenderSlot>(
    (nodeId, slot, renderDefault) => (
      <EditableSlot nodeId={nodeId} slot={slot} renderDefault={renderDefault} />
    ),
    [],
  );
  const cardIds = doc.cards.map((card) => card.id);
  const overflowing = useCardOverflow(
    cardIds,
    (id) => {
      const element = canvasRef.current?.querySelector(
        `[data-lm-card-id="${id}"] [data-lm-card-content]`,
      );
      return element instanceof HTMLElement ? element : null;
    },
    doc.format === 'presentation',
  );
  const presentation = doc.format === 'presentation';
  const logicalWidth = presentation ? LOGICAL_SIZE.presentation.width : LOGICAL_SIZE.document.width;
  const logicalHeight = presentation ? LOGICAL_SIZE.presentation.height : undefined;

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const id = target.closest('[data-lm-editor-node]')?.getAttribute('data-lm-editor-node') ?? null;
    if (viewState.get().hoverId !== id) viewState.set({ hoverId: id });
  };

  const onClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, a, input, textarea, select')) return;
    const mark = target.closest('[aria-hidden="true"]');
    const markedNode = mark?.closest('[data-lm-editor-node]')?.getAttribute('data-lm-editor-node');
    if (mark && markedNode) {
      const found = findNode(store.getDocument(), markedNode);
      if (found?.node.type === 'list' && found.node.style === 'check') {
        const path = listItemPath(mark);
        const items = path ? toggleChecked(found.node.items, path) : null;
        if (items) {
          store.apply([{ op: 'updateNode', id: found.node.id, patch: { items } }], {
            origin: 'user',
            label: 'Edit structure',
          });
          return;
        }
      }
    }
    const nodeId = target.closest('[data-lm-editor-node]')?.getAttribute('data-lm-editor-node');
    if (nodeId) {
      viewState.set({
        selection: selectNode(doc, viewState.get().selection, nodeId, event.shiftKey),
      });
      return;
    }
    const cardId = target.closest('[data-lm-card-id]')?.getAttribute('data-lm-card-id');
    if (cardId) {
      viewState.set({ selection: selectCard(cardId) });
      return;
    }
    viewState.set({ selection: { cardId: null, nodeIds: [] } });
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const nodeId = target.closest('[data-lm-editor-node]')?.getAttribute('data-lm-editor-node');
    if (!nodeId) return;
    const found = findNode(store.getDocument(), nodeId);
    if (!found || !isTextNodeType(found.node.type)) return;
    const raw = target.closest('[data-lm-slot]')?.getAttribute('data-lm-slot');
    const slot = raw && parseSlotKey(raw) ? raw : defaultSlot(found.node);
    if (!slot) return;
    finishEditing();
    viewState.set({
      selection: { cardId: found.cardId, nodeIds: [nodeId] },
      editing: { nodeId, slot, caret: 'end' },
    });
  };

  function onDragStart(event: DragStartEvent) {
    viewState.set({ dragState: { nodeId: String(event.active.id) } });
  }

  function onDragCancel() {
    viewState.set({ dragState: null });
  }

  function onDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id);
    viewState.set({ dragState: null });
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    const target = parseDropId(overId);
    if (!target) return;
    const command = buildMoveNodeCommand(store.getDocument(), draggedId, target);
    if (!command) return;
    const result = store.apply([command], { origin: 'user', label: 'Move block' });
    if (!result.ok) return;
    const found = findNode(result.doc, draggedId);
    if (found) viewState.set({ selection: { cardId: found.cardId, nodeIds: [draggedId] } });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={nodeCollision}
      accessibility={{ container: layerElement ?? undefined }}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div
        ref={canvasRef}
        className={styles.canvas}
        data-lm-editor-canvas=""
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (viewState.get().hoverId !== null) viewState.set({ hoverId: null });
        }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {doc.cards.length === 0 ? (
          <div className={styles.empty}>
            <p>{messages.emptyDocument}</p>
            {readOnly ? null : <AddCard />}
          </div>
        ) : (
          <div className={styles.list}>
            {doc.cards.map((card) => (
              <EditorCard
                key={card.id}
                card={card}
                doc={doc}
                overflow={presentation && overflowing.has(card.id)}
                logicalWidth={logicalWidth}
                logicalHeight={logicalHeight}
                renderNode={renderNode}
                renderSlot={renderSlot}
              />
            ))}
            {readOnly ? null : <AddCard />}
          </div>
        )}
      </div>
    </DndContext>
  );
}

function listItemPath(mark: Element): number[] | null {
  const path: number[] = [];
  let item = mark.closest('li');
  while (item) {
    const parent = item.parentElement;
    if (!parent) return null;
    const index = [...parent.children].filter((child) => child.tagName === 'LI').indexOf(item);
    if (index < 0) return null;
    path.unshift(index);
    item = parent.parentElement?.closest('li') ?? null;
  }
  return path.length > 0 ? path : null;
}

function EditorCard({
  card,
  doc,
  overflow,
  logicalWidth,
  logicalHeight,
  renderNode,
  renderSlot,
}: {
  card: LoomaCard;
  doc: LoomaDocument;
  overflow: boolean;
  logicalWidth: number;
  logicalHeight: number | undefined;
  renderNode: RenderNode;
  renderSlot: RenderSlot;
}) {
  const { messages, resolveAsset, readOnly, viewState } = useEditorContext();
  const selected = useViewState(
    (state) => state.selection.cardId === card.id && state.selection.nodeIds.length === 0,
  );
  const flashing = useViewState((state) => state.flashIds.has(card.id));

  return (
    <div
      className={styles.card}
      data-lm-editor-card={card.id}
      data-selected={selected ? '' : undefined}
      data-flash={flashing ? '' : undefined}
    >
      <ScaledFrame logicalWidth={logicalWidth} logicalHeight={logicalHeight} maxScale={1}>
        <LoomaCardView
          card={card}
          document={doc}
          resolveAsset={resolveAsset}
          renderNode={renderNode}
          renderSlot={renderSlot}
        />
      </ScaledFrame>
      {!readOnly && card.body.length === 0 ? <EmptyCardDrop cardId={card.id} /> : null}
      {!readOnly && card.body.length === 0 ? (
        <button
          type="button"
          className={styles.add}
          onClick={() => {
            viewState.set({
              slash: {
                target: { kind: 'card', cardId: card.id },
                source: 'button',
                query: '',
                anchor: { x: 24, y: 24 },
              },
            });
          }}
        >
          {messages.addBlock}
        </button>
      ) : null}
      {overflow ? (
        <span className={styles.badge} title={messages.overflowTitle}>
          {messages.overflow}
        </span>
      ) : null}
    </div>
  );
}

function EmptyCardDrop({ cardId }: { cardId: string }) {
  const { store } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const draggedId = useViewState((state) => state.dragState?.nodeId ?? null);
  const { setNodeRef, isOver } = useDroppable({ id: `inside:${cardId}` });
  const allowed =
    draggedId !== null &&
    canDropNode(doc, draggedId, { kind: 'inside', parentId: cardId, index: 0 });
  return (
    <div
      ref={setNodeRef}
      className={styles.emptyDrop}
      data-over={isOver && allowed ? '' : undefined}
    />
  );
}

function AddCard() {
  const { store, messages, viewState } = useEditorContext();
  const cardId = useViewState((state) => state.selection.cardId);

  return (
    <button
      type="button"
      className={styles.add}
      onClick={() => {
        const before = new Set(store.getDocument().cards.map((card) => card.id));
        const result = store.apply(
          [
            {
              op: 'insertCard',
              card: { body: [{ type: 'heading', level: 2, text: '' }] },
              at: cardId ? { after: cardId } : undefined,
            },
          ],
          { origin: 'user', label: 'Add card' },
        );
        if (!result.ok) return;
        const created = result.doc.cards.find((card) => !before.has(card.id));
        if (created) {
          const heading = created.body.find((item) => item.type === 'heading');
          viewState.set({
            selection: heading
              ? { cardId: created.id, nodeIds: [heading.id] }
              : selectCard(created.id),
            editing: heading ? { nodeId: heading.id, slot: 'text', caret: 'start' } : null,
          });
        }
      }}
    >
      {messages.addCard}
    </button>
  );
}
