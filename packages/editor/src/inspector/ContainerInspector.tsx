import { findNode, MAX_CONTAINER_DEPTH } from '@lor-looma/core';
import type { FoundNode, LoomaContainer, LoomaDocument } from '@lor-looma/core';
import { subtreeContainerDepth } from '../canvas/dnd/dropTarget';
import { useLoomaDocument } from '@lor-looma/viewer';
import { formatMessage } from '../i18n/useMessages';
import { selectCard, selectionAfterDelete } from '../state/selection';
import { useEditorContext } from '../state/viewState';
import { NodeActions } from './NodeActions';
import styles from './Inspector.module.css';

export function canWrapNodes(
  doc: LoomaDocument,
  ids: readonly string[],
  type: 'columns' | 'grid' | 'stack' | 'steps',
): boolean {
  if (ids.length === 0) return false;
  if (type === 'columns' && (ids.length < 2 || ids.length > 4)) return false;
  const founds = [];
  for (const id of ids) {
    const found = findNode(doc, id);
    if (!found) return false;
    founds.push(found);
  }
  founds.sort((left, right) => left.index - right.index);
  const first = founds[0];
  if (!first) return false;
  for (const found of founds) {
    if (found.parentId !== first.parentId || found.slot !== first.slot) return false;
  }
  for (let index = 1; index < founds.length; index += 1) {
    const previous = founds[index - 1];
    const current = founds[index];
    if (!previous || !current || current.index !== previous.index + 1) return false;
  }
  const nested = Math.max(...founds.map((found) => subtreeContainerDepth(found.node)));
  return first.depth + 1 + nested <= MAX_CONTAINER_DEPTH;
}

export function ContainerInspector({ found }: { found: FoundNode & { node: LoomaContainer } }) {
  const { store, messages, viewState } = useEditorContext();
  const node = found.node;
  useLoomaDocument({ store });

  function patch(next: Record<string, unknown>) {
    store.apply([{ op: 'updateNode', id: node.id, patch: next }], {
      origin: 'user',
      label: 'Edit container',
    });
  }

  function unwrap() {
    const applied = store.apply([{ op: 'unwrapNode', id: node.id }], {
      origin: 'user',
      label: 'Unwrap',
    });
    if (!applied.ok) return;
    if (found.parentId === found.cardId) {
      viewState.set({ selection: selectCard(found.cardId) });
      return;
    }
    viewState.set({ selection: { cardId: found.cardId, nodeIds: [found.parentId] } });
  }

  return (
    <div className={styles.body}>
      <p className={styles.kind}>
        {node.type === 'stack'
          ? messages.stack
          : node.type === 'columns'
            ? messages.columns
            : node.type === 'grid'
              ? messages.grid
              : messages.steps}
      </p>
      <label className={styles.field}>
        {messages.gap}
        <select
          aria-label={messages.gap}
          value={node.gap ?? 'md'}
          onChange={(event) => {
            const gap = event.target.value;
            if (gap !== 'none' && gap !== 'sm' && gap !== 'md' && gap !== 'lg') return;
            patch({ gap });
          }}
        >
          <option value="none">{messages.gapNone}</option>
          <option value="sm">{messages.gapSmall}</option>
          <option value="md">{messages.gapMedium}</option>
          <option value="lg">{messages.gapLarge}</option>
        </select>
      </label>
      {node.type === 'steps' ? (
        <label className={styles.field}>
          {messages.stepsDirection}
          <select
            aria-label={messages.stepsDirection}
            value={node.direction ?? 'vertical'}
            onChange={(event) => {
              const direction = event.target.value;
              if (direction !== 'vertical' && direction !== 'horizontal') return;
              patch({ direction });
            }}
          >
            <option value="vertical">{messages.directionVertical}</option>
            <option value="horizontal">{messages.directionHorizontal}</option>
          </select>
        </label>
      ) : null}
      {node.type === 'columns' ? <ColumnFields node={node} patch={patch} /> : null}
      {node.type === 'grid' ? (
        <label className={styles.field}>
          {messages.columns}
          <select
            aria-label={messages.columns}
            value={String(node.columns)}
            onChange={(event) => {
              const columns = Number(event.target.value);
              if (columns !== 2 && columns !== 3 && columns !== 4) return;
              patch({ columns });
            }}
          >
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
      ) : null}
      <div className={styles.actions}>
        <button type="button" onClick={unwrap}>
          {messages.unwrapContainer}
        </button>
      </div>
      <NodeActions nodeId={node.id} />
    </div>
  );
}

function ColumnFields({
  node,
  patch,
}: {
  node: Extract<LoomaContainer, { type: 'columns' }>;
  patch: (next: Record<string, unknown>) => void;
}) {
  const { store, messages } = useEditorContext();
  const canAdd = node.children.length < 4;
  const canDelete = node.children.length > 2;
  return (
    <>
      <label className={styles.field}>
        {messages.columnAlign}
        <select
          aria-label={messages.columnAlign}
          value={node.align ?? 'start'}
          onChange={(event) => {
            const align = event.target.value;
            if (align !== 'start' && align !== 'center' && align !== 'end' && align !== 'stretch') {
              return;
            }
            patch({ align });
          }}
        >
          <option value="start">{messages.alignStart}</option>
          <option value="center">{messages.alignCenter}</option>
          <option value="end">{messages.alignEnd}</option>
          <option value="stretch">{messages.alignStretch}</option>
        </select>
      </label>
      <div className={styles.field}>
        <span>{messages.columnWidths}</span>
        {node.widths.map((width, index) => (
          <input
            key={index}
            aria-label={formatMessage(messages.columnLabel, { n: index + 1 })}
            type="number"
            min={0.1}
            step={0.1}
            value={String(width)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next) || next <= 0) return;
              const widths = node.widths.map((item, itemIndex) =>
                itemIndex === index ? next : item,
              );
              patch({ widths });
            }}
          />
        ))}
      </div>
      <div className={styles.row}>
        <button
          type="button"
          disabled={!canAdd}
          onClick={() =>
            store.apply([{ op: 'insertColumn', id: node.id }], {
              origin: 'user',
              label: 'Add column',
            })
          }
        >
          {messages.addColumn}
        </button>
        {node.children.map((_, index) => (
          <button
            key={index}
            type="button"
            disabled={!canDelete}
            aria-label={formatMessage(messages.deleteColumnLabel, { n: index + 1 })}
            onClick={() =>
              store.apply(
                [
                  {
                    op: 'deleteColumn',
                    id: node.id,
                    index,
                    moveNodesTo: index === 0 ? 1 : index - 1,
                  },
                ],
                { origin: 'user', label: 'Delete column' },
              )
            }
          >
            {formatMessage(messages.deleteColumnLabel, { n: index + 1 })}
          </button>
        ))}
      </div>
    </>
  );
}

export function MultiInspector({ ids }: { ids: string[] }) {
  const { store, messages, viewState } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const anchor = findNode(doc, ids[0] ?? '');

  function wrap(type: 'columns' | 'grid' | 'stack' | 'steps') {
    const applied = store.apply([{ op: 'wrapNodes', ids, container: { type } }], {
      origin: 'user',
      label: 'Wrap',
    });
    if (!applied.ok) return;
    const created = applied.createdIds[0];
    const found = created ? findNode(applied.doc, created) : null;
    if (found) viewState.set({ selection: { cardId: found.cardId, nodeIds: [found.node.id] } });
  }

  function remove() {
    if (!anchor) return;
    const selection = { cardId: anchor.cardId, nodeIds: ids };
    const next = selectionAfterDelete(doc, selection);
    const applied = store.apply(
      ids.map((id) => ({ op: 'deleteNode' as const, id })),
      { origin: 'user', label: 'Delete' },
    );
    if (applied.ok) viewState.set({ selection: next });
  }

  return (
    <div className={styles.body}>
      <p className={styles.kind}>{formatMessage(messages.multipleSelection, { n: ids.length })}</p>
      <div className={styles.actions}>
        <button
          type="button"
          disabled={!canWrapNodes(doc, ids, 'columns')}
          onClick={() => wrap('columns')}
        >
          {messages.wrapColumns}
        </button>
        <button
          type="button"
          disabled={!canWrapNodes(doc, ids, 'grid')}
          onClick={() => wrap('grid')}
        >
          {messages.wrapGrid}
        </button>
        <button
          type="button"
          disabled={!canWrapNodes(doc, ids, 'stack')}
          onClick={() => wrap('stack')}
        >
          {messages.wrapStack}
        </button>
        <button
          type="button"
          disabled={!canWrapNodes(doc, ids, 'steps')}
          onClick={() => wrap('steps')}
        >
          {messages.wrapSteps}
        </button>
        <button type="button" onClick={remove}>
          {messages.deleteSelected}
        </button>
      </div>
    </div>
  );
}
