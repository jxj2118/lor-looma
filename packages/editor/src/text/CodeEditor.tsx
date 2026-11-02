import { findNode } from '@lor-looma/core';
import type { SlotKey } from '@lor-looma/viewer';
import { parseSlotKey } from '@lor-looma/viewer';
import { useEffect, useRef, useState } from 'react';
import { useEditorContext } from '../state/viewState';
import { commitSlot } from './slots';
import { adjacentTextSlot } from './structure';
import styles from './InlineEditor.module.css';

export function CodeEditor({
  nodeId,
  slot,
  initialText,
  caret,
}: {
  nodeId: string;
  slot: SlotKey;
  initialText: string;
  caret: 'start' | 'end';
}) {
  const { store, viewState, bindFinishEditing, suppressCommitRef, rootRef } = useEditorContext();
  const [value, setValue] = useState(initialText);
  const valueRef = useRef(initialText);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (suppressCommitRef.current) return;
    commitSlot(store, nodeId, slot, valueRef.current);
  };

  const exit = () => {
    flush();
    if (viewState.get().editing?.nodeId === nodeId) viewState.set({ editing: null });
  };

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    const offset = caret === 'start' ? 0 : area.value.length;
    area.setSelectionRange(offset, offset);
  }, [caret]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    bindFinishEditing(() => exit());
    // Unmounting only flushes: StrictMode remounts effects, and clearing `editing` here would close the editor.
    return () => {
      bindFinishEditing(null);
      if (suppressCommitRef.current) {
        suppressCommitRef.current = false;
        return;
      }
      flush();
    };
    // `exit` reads the latest text through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindFinishEditing, suppressCommitRef]);

  return (
    <textarea
      ref={areaRef}
      className={styles.code}
      data-lm-inline-editor=""
      value={value}
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        valueRef.current = next;
        setValue(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commitSlot(store, nodeId, slot, next), 800);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          exit();
          rootRef.current?.focus({ preventScroll: true });
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          const area = event.currentTarget;
          const atStart =
            event.key === 'ArrowUp' && area.selectionStart === 0 && area.selectionEnd === 0;
          const atEnd =
            event.key === 'ArrowDown' &&
            area.selectionStart === value.length &&
            area.selectionEnd === value.length;
          if (atStart || atEnd) {
            const next = adjacentTextSlot(
              store.getDocument(),
              nodeId,
              slot,
              event.key === 'ArrowUp' ? 'prev' : 'next',
            );
            if (next) {
              event.preventDefault();
              const cardId = findNode(store.getDocument(), next.nodeId)?.cardId ?? null;
              if (cardId) {
                const nextSlot = parseSlotKey(next.slot);
                viewState.set({
                  editing: next,
                  selection: { cardId, nodeIds: [next.nodeId] },
                  ...(nextSlot?.kind === 'cell'
                    ? {
                        activeCell: { nodeId: next.nodeId, row: nextSlot.row, col: nextSlot.col },
                      }
                    : {}),
                });
              }
              return;
            }
          }
        }
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const area = event.currentTarget;
        const start = area.selectionStart ?? 0;
        const end = area.selectionEnd ?? 0;
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        valueRef.current = next;
        setValue(next);
        requestAnimationFrame(() => {
          area.setSelectionRange(start + 2, start + 2);
        });
      }}
    />
  );
}
