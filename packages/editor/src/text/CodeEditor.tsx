import type { SlotKey } from '@lor-looma/viewer';
import { useEffect, useRef, useState } from 'react';
import { useEditorContext } from '../state/viewState';
import { commitSlot } from './slots';
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
  const { store, viewState, bindFinishEditing, suppressCommitRef } = useEditorContext();
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
    return () => {
      if (suppressCommitRef.current) {
        suppressCommitRef.current = false;
        return;
      }
      exit();
      bindFinishEditing(null);
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
          return;
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
