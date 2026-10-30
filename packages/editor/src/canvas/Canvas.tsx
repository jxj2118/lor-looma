import type { LoomaCard, LoomaDocument } from '@lor-looma/core';
import {
  LOGICAL_SIZE,
  LoomaCardView,
  ScaledFrame,
  useCardOverflow,
  useLoomaDocument,
} from '@lor-looma/viewer';
import type { RenderNode } from '@lor-looma/viewer';
import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { selectCard, selectNode } from '../state/selection';
import { useEditorContext, useViewState } from '../state/viewState';
import { EditableNode } from './EditableNode';
import styles from './Canvas.module.css';

export function Canvas() {
  const { store, messages, readOnly, viewState } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const canvasRef = useRef<HTMLDivElement>(null);
  const renderNode = useCallback<RenderNode>(
    (node, renderDefault, info) => (
      <EditableNode node={node} info={info} renderDefault={renderDefault} />
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

  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        if (viewState.get().hoverId !== null) viewState.set({ hoverId: null });
      }}
      onClick={onClick}
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
            />
          ))}
          {readOnly ? null : <AddCard />}
        </div>
      )}
    </div>
  );
}

function EditorCard({
  card,
  doc,
  overflow,
  logicalWidth,
  logicalHeight,
  renderNode,
}: {
  card: LoomaCard;
  doc: LoomaDocument;
  overflow: boolean;
  logicalWidth: number;
  logicalHeight: number | undefined;
  renderNode: RenderNode;
}) {
  const { messages, resolveAsset } = useEditorContext();
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
        />
      </ScaledFrame>
      {overflow ? (
        <span className={styles.badge} title={messages.overflowTitle}>
          {messages.overflow}
        </span>
      ) : null}
    </div>
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
        if (created) viewState.set({ selection: selectCard(created.id) });
      }}
    >
      {messages.addCard}
    </button>
  );
}
