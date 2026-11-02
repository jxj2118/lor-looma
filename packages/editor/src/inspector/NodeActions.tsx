import { findCard, findNode } from '@lor-looma/core';
import type { FoundNode, LoomaDocument, LoomaNode } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import { selectCard, selectionAfterDelete } from '../state/selection';
import { topLevelSplitTarget } from '../state/splitTarget';
import { duplicateSelection, duplicatedNodeIds, moveSelection } from '../state/shortcuts';
import { useEditorContext } from '../state/viewState';
import styles from './Inspector.module.css';

function siblingList(doc: LoomaDocument, found: FoundNode): LoomaNode[] | null {
  if (found.parentId === found.cardId) return findCard(doc, found.cardId)?.card.body ?? null;
  const parent = findNode(doc, found.parentId);
  if (!parent) return null;
  if (parent.node.type === 'columns') {
    if (found.slot === null) return null;
    return parent.node.children[found.slot] ?? null;
  }
  if (parent.node.type === 'stack' || parent.node.type === 'grid' || parent.node.type === 'steps') {
    return parent.node.children;
  }
  return null;
}

export function NodeActions({ nodeId }: { nodeId: string }) {
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
  }

  function remove() {
    const next = selectionAfterDelete(store.getDocument(), selection);
    const applied = store.apply([{ op: 'deleteNode', id: nodeId }], {
      origin: 'user',
      label: 'Delete',
    });
    if (applied.ok) viewState.set({ selection: next });
  }

  return (
    <div className={styles.actions}>
      <button type="button" disabled={atStart} onClick={() => move('up')}>
        {messages.moveUp}
      </button>
      <button type="button" disabled={atEnd} onClick={() => move('down')}>
        {messages.moveDown}
      </button>
      <button type="button" onClick={duplicate}>
        {messages.duplicate}
      </button>
      {splitTarget ? (
        <button type="button" onClick={splitHere}>
          {messages.splitCardHere}
        </button>
      ) : null}
      <button type="button" onClick={remove}>
        {messages.delete}
      </button>
      {found.parentId !== found.cardId ? (
        <button
          type="button"
          onClick={() =>
            viewState.set({ selection: { cardId: found.cardId, nodeIds: [found.parentId] } })
          }
        >
          {messages.selectParent}
        </button>
      ) : null}
    </div>
  );
}
