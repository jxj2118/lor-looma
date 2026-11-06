import { findCard } from '@lor-looma/core';
import type { LoomaCard, LoomaCommand, LoomaDocument } from '@lor-looma/core';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  cardLogicalSize,
  LoomaCardView,
  ScaledFrame,
  useCardOverflow,
  useLoomaDocument,
} from '@lor-looma/viewer';
import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { formatMessage } from '../i18n/useMessages';
import { selectCard, selectionAfterDelete } from '../state/selection';
import { moveSelection } from '../state/shortcuts';
import { useEditorContext, useViewState } from '../state/viewState';
import styles from './CardSidebar.module.css';

export function cardReorderCommand(
  ids: readonly string[],
  activeId: string,
  overId: string,
): LoomaCommand | null {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  return { op: 'moveCard', id: activeId, to: { index: to } };
}

interface CardMenu {
  cardId: string;
  x: number;
  y: number;
}

export function CardSidebar() {
  const { store, messages, resolveAsset, viewState, rootRef, layerElement } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const listRef = useRef<HTMLUListElement>(null);
  const [menu, setMenu] = useState<CardMenu | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const cardIds = doc.cards.map((card) => card.id);
  const presentation = doc.format === 'presentation';
  const overflowing = useCardOverflow(
    cardIds,
    (id) => {
      const element = listRef.current?.querySelector(
        `[data-lm-sidebar-card="${id}"] [data-lm-card-content]`,
      );
      return element instanceof HTMLElement ? element : null;
    },
    presentation,
  );

  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-lm-card-menu]')) return;
      setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [menu]);

  function scrollToCard(id: string) {
    const target = rootRef.current?.querySelector(
      `[data-lm-editor-canvas] [data-lm-card-id="${id}"]`,
    );
    if (target instanceof HTMLElement && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  }

  function choose(cardId: string) {
    viewState.set({ selection: selectCard(cardId) });
    scrollToCard(cardId);
  }

  function insertCard(afterId?: string) {
    const result = store.apply(
      [
        {
          op: 'insertCard',
          card: { body: [{ type: 'heading', level: 2, text: '' }] },
          ...(afterId ? { at: { after: afterId } } : {}),
        },
      ],
      { origin: 'user', label: 'Add card' },
    );
    if (!result.ok) return;
    const created = result.createdIds.find((id) => findCard(result.doc, id));
    if (!created) return;
    const heading = findCard(result.doc, created)?.card.body.find(
      (node) => node.type === 'heading',
    );
    viewState.set({
      selection: heading ? { cardId: created, nodeIds: [heading.id] } : selectCard(created),
      editing: heading ? { nodeId: heading.id, slot: 'text', caret: 'start' } : null,
    });
    scrollToCard(created);
  }

  function duplicate(cardId: string) {
    const result = store.apply([{ op: 'duplicateCard', id: cardId }], {
      origin: 'user',
      label: 'Duplicate card',
    });
    if (!result.ok) return;
    const created = result.createdIds.find((id) => findCard(result.doc, id));
    if (!created) return;
    viewState.set({ selection: selectCard(created) });
    scrollToCard(created);
  }

  function move(cardId: string, direction: 'up' | 'down') {
    const commands = moveSelection(store.getDocument(), selectCard(cardId), direction);
    if (!commands) return;
    store.apply(commands, {
      origin: 'user',
      label: direction === 'up' ? 'Move up' : 'Move down',
    });
    scrollToCard(cardId);
  }

  function remove(cardId: string) {
    const next = selectionAfterDelete(store.getDocument(), selectCard(cardId));
    const result = store.apply([{ op: 'deleteCard', id: cardId }], {
      origin: 'user',
      label: 'Delete card',
    });
    if (result.ok) viewState.set({ selection: next });
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : '';
    const command = cardReorderCommand(
      store.getDocument().cards.map((card) => card.id),
      String(event.active.id),
      overId,
    );
    if (!command) return;
    store.apply([command], { origin: 'user', label: 'Move card' });
  }

  function openMenu(event: ReactMouseEvent, cardId: string) {
    event.preventDefault();
    const box = rootRef.current?.getBoundingClientRect();
    setMenu({
      cardId,
      x: event.clientX - (box?.left ?? 0),
      y: event.clientY - (box?.top ?? 0),
    });
  }

  const menuIndex = menu ? doc.cards.findIndex((card) => card.id === menu.cardId) : -1;

  return (
    <aside className={styles.sidebar} data-lm-sidebar="" aria-label={messages.cards}>
      <h2 className={styles.heading}>{messages.cards}</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ container: layerElement ?? undefined }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <ul ref={listRef} className={styles.list}>
            {doc.cards.map((card, index) => {
              const logical = cardLogicalSize(card, doc.format);
              return (
                <SidebarCard
                  key={card.id}
                  card={card}
                  doc={doc}
                  index={index}
                  count={doc.cards.length}
                  logicalWidth={logical.width}
                  logicalHeight={logical.height}
                  overflow={presentation && !card.scene && overflowing.has(card.id)}
                  resolveAsset={resolveAsset}
                  onChoose={choose}
                  onInsert={() => {
                    insertCard(card.id);
                    setMenu(null);
                  }}
                  onDuplicate={() => {
                    duplicate(card.id);
                    setMenu(null);
                  }}
                  onMove={(direction) => {
                    move(card.id, direction);
                    setMenu(null);
                  }}
                  onDelete={() => {
                    remove(card.id);
                    setMenu(null);
                  }}
                  onContextMenu={(event) => openMenu(event, card.id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <button type="button" className={styles.add} onClick={() => insertCard()}>
        {messages.addCard}
      </button>
      {menu && layerElement
        ? createPortal(
            <div
              className={styles.menu}
              data-lm-card-menu=""
              role="menu"
              style={{ left: menu.x, top: menu.y }}
            >
              <CardMenuItems
                index={menuIndex}
                count={doc.cards.length}
                onInsert={() => {
                  insertCard(menu.cardId);
                  setMenu(null);
                }}
                onDuplicate={() => {
                  duplicate(menu.cardId);
                  setMenu(null);
                }}
                onMove={(direction) => {
                  move(menu.cardId, direction);
                  setMenu(null);
                }}
                onDelete={() => {
                  remove(menu.cardId);
                  setMenu(null);
                }}
              />
            </div>,
            layerElement,
          )
        : null}
    </aside>
  );
}

function CardMenuItems({
  index,
  count,
  onInsert,
  onDuplicate,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  onInsert: () => void;
  onDuplicate: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}) {
  const { messages } = useEditorContext();
  return (
    <>
      <button type="button" role="menuitem" onClick={onInsert}>
        {messages.insertCardBelow}
      </button>
      <button type="button" role="menuitem" onClick={onDuplicate}>
        {messages.duplicateCard}
      </button>
      <button type="button" role="menuitem" disabled={index <= 0} onClick={() => onMove('up')}>
        {messages.moveUp}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={index < 0 || index >= count - 1}
        onClick={() => onMove('down')}
      >
        {messages.moveDown}
      </button>
      <button type="button" role="menuitem" onClick={onDelete}>
        {messages.deleteCard}
      </button>
    </>
  );
}

function SidebarCard({
  card,
  doc,
  index,
  count,
  logicalWidth,
  logicalHeight,
  overflow,
  resolveAsset,
  onChoose,
  onInsert,
  onDuplicate,
  onMove,
  onDelete,
  onContextMenu,
}: {
  card: LoomaCard;
  doc: LoomaDocument;
  index: number;
  count: number;
  logicalWidth: number;
  logicalHeight: number | undefined;
  overflow: boolean;
  resolveAsset: ReturnType<typeof useEditorContext>['resolveAsset'];
  onChoose: (cardId: string) => void;
  onInsert: () => void;
  onDuplicate: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
}) {
  const { messages } = useEditorContext();
  const active = useViewState((state) => state.selection.cardId === card.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const label = formatMessage(messages.cardLabel, { n: index + 1 });

  return (
    <li className={styles.item} onContextMenu={onContextMenu}>
      <div
        ref={setNodeRef}
        style={style}
        className={styles.card}
        data-lm-sidebar-card={card.id}
        data-active={active ? '' : undefined}
        data-dragging={isDragging ? '' : undefined}
        {...attributes}
        {...listeners}
        aria-label={label}
        onClick={() => onChoose(card.id)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          listeners?.onKeyDown?.(event);
          if (event.key === 'Enter') {
            event.preventDefault();
            onChoose(card.id);
          }
        }}
      >
        <span className={styles.index}>{index + 1}</span>
        <div
          className={styles.preview}
          data-lm-preview=""
          aria-hidden="true"
          style={{ pointerEvents: 'none' }}
        >
          <ScaledFrame logicalWidth={logicalWidth} logicalHeight={logicalHeight} maxScale={1}>
            <LoomaCardView card={card} document={doc} resolveAsset={resolveAsset} />
          </ScaledFrame>
        </div>
        {overflow ? (
          <span className={styles.badge} data-lm-overflow="" title={messages.overflowTitle}>
            {messages.overflow}
          </span>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="button" aria-label={messages.insertCardBelow} onClick={onInsert}>
          +
        </button>
        <button type="button" aria-label={messages.duplicateCard} onClick={onDuplicate}>
          ⧉
        </button>
        <button
          type="button"
          aria-label={messages.moveUp}
          disabled={index === 0}
          onClick={() => onMove('up')}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={messages.moveDown}
          disabled={index >= count - 1}
          onClick={() => onMove('down')}
        >
          ↓
        </button>
        <button type="button" aria-label={messages.deleteCard} onClick={onDelete}>
          ×
        </button>
      </div>
    </li>
  );
}
