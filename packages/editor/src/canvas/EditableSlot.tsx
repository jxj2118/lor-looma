import { findNode } from '@lor-looma/core';
import type { LoomaNode } from '@lor-looma/core';
import type { SlotKey } from '@lor-looma/viewer';
import type { ReactNode } from 'react';
import type { Messages } from '../i18n/en-US';
import { useEditorContext, useViewState } from '../state/viewState';
import { CodeEditor } from '../text/CodeEditor';
import { InlineEditor } from '../text/InlineEditor';
import { readSlot, slotMode } from '../text/slots';
import styles from '../text/InlineEditor.module.css';

function placeholderFor(node: LoomaNode, messages: Messages): string {
  if (node.type === 'paragraph') return messages.placeholderParagraph;
  if (node.type === 'heading') return messages.placeholderHeading;
  return messages.placeholderEmpty;
}

export function EditableSlot({
  nodeId,
  slot,
  renderDefault,
}: {
  nodeId: string;
  slot: SlotKey;
  renderDefault: () => ReactNode;
}) {
  const { store, messages, readOnly, viewState } = useEditorContext();
  const active = useViewState(
    (state) => state.editing?.nodeId === nodeId && state.editing.slot === slot,
  );
  const node = findNode(store.getDocument(), nodeId)?.node;
  if (active && node) {
    const editing = viewState.get().editing;
    const mode = slotMode(node, slot);
    const text = readSlot(node, slot) ?? '';
    if (editing && mode === 'code') {
      return <CodeEditor nodeId={nodeId} slot={slot} initialText={text} caret={editing.caret} />;
    }
    if (editing && mode !== 'code') {
      return (
        <InlineEditor
          nodeId={nodeId}
          slot={slot}
          mode={mode}
          initialText={text}
          caret={editing.caret}
          initialRange={editing.initialRange}
          placeholder={placeholderFor(node, messages)}
        />
      );
    }
  }
  if (!readOnly && node && readSlot(node, slot) === '') {
    return (
      <span data-lm-slot={slot} className={styles.empty}>
        {renderDefault()}
        <span className={styles.placeholder}>{placeholderFor(node, messages)}</span>
      </span>
    );
  }
  return renderDefault();
}
