import {
  LOGICAL_SIZE,
  LoomaCardView,
  ScaledFrame,
  useCardOverflow,
  useLoomaDocument,
} from '@lor-looma/viewer';
import { useRef } from 'react';
import { selectCard } from '../state/selection';
import { useEditorContext, useViewState } from '../state/viewState';
import styles from './Canvas.module.css';

export function Canvas() {
  const { store, messages, readOnly, resolveAsset } = useEditorContext();
  const document = useLoomaDocument({ store });
  const canvasRef = useRef<HTMLDivElement>(null);
  const cardIds = document.cards.map((card) => card.id);
  const overflowing = useCardOverflow(
    cardIds,
    (id) => {
      const element = canvasRef.current?.querySelector(
        `[data-lm-card-id="${id}"] [data-lm-card-content]`,
      );
      return element instanceof HTMLElement ? element : null;
    },
    document.format === 'presentation',
  );
  const presentation = document.format === 'presentation';
  const logicalWidth = presentation ? LOGICAL_SIZE.presentation.width : LOGICAL_SIZE.document.width;
  const logicalHeight = presentation ? LOGICAL_SIZE.presentation.height : undefined;

  return (
    <div ref={canvasRef} className={styles.canvas}>
      {document.cards.length === 0 ? (
        <div className={styles.empty}>
          <p>{messages.emptyDocument}</p>
          {readOnly ? null : <AddCard />}
        </div>
      ) : (
        <div className={styles.list}>
          {document.cards.map((card) => {
            const overflow = presentation && overflowing.has(card.id);
            return (
              <div key={card.id} className={styles.card} data-lm-editor-card={card.id}>
                <ScaledFrame logicalWidth={logicalWidth} logicalHeight={logicalHeight} maxScale={1}>
                  <LoomaCardView card={card} document={document} resolveAsset={resolveAsset} />
                </ScaledFrame>
                {overflow ? (
                  <span className={styles.badge} title={messages.overflowTitle}>
                    {messages.overflow}
                  </span>
                ) : null}
              </div>
            );
          })}
          {readOnly ? null : <AddCard />}
        </div>
      )}
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
