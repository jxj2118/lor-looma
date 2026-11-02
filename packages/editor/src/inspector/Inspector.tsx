import { findNode } from '@lor-looma/core';
import type { LoomaContainer } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import { useViewState, useEditorContext } from '../state/viewState';
import { BlockInspector } from './BlockInspector';
import { CardDocumentInspector } from './CardDocumentInspector';
import { ContainerInspector, MultiInspector } from './ContainerInspector';
import styles from './Inspector.module.css';

function isContainer(node: { type: string }): node is LoomaContainer {
  return node.type === 'stack' || node.type === 'columns' || node.type === 'grid';
}

export function Inspector() {
  const { store, messages } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const selection = useViewState((state) => state.selection);
  const singleId = selection.nodeIds.length === 1 ? selection.nodeIds[0] : undefined;
  const found = singleId ? findNode(doc, singleId) : null;

  let body = <CardDocumentInspector />;
  if (selection.nodeIds.length > 1) {
    body = <MultiInspector ids={selection.nodeIds} />;
  } else if (found && isContainer(found.node)) {
    body = <ContainerInspector found={{ ...found, node: found.node }} />;
  } else if (found && !isContainer(found.node)) {
    body = <BlockInspector node={found.node} />;
  }

  return (
    <aside className={styles.inspector} data-lm-inspector="" aria-label={messages.inspectorTitle}>
      <h2 className={styles.heading}>{messages.inspectorTitle}</h2>
      {body}
    </aside>
  );
}
