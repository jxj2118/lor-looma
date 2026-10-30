import { findNode } from '@lor-looma/core';
import { useEditor } from '@tiptap/react';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { useEffect, useMemo, useRef } from 'react';
import type { EditorMode } from './markdown';
import { docToMarkdown, markdownToDoc } from './markdown';
import { createExtensions } from './extensions';
import { commitSlot, readSlot } from './slots';
import type { SlotKey } from '@lor-looma/viewer';
import { useEditorContext } from '../state/viewState';
import styles from './InlineEditor.module.css';

function flattenPasted(slice: Slice): Slice {
  const blocks: ProseNode[] = [];
  slice.content.forEach((node) => {
    blocks.push(node);
  });
  const first = blocks[0];
  if (!first || blocks.length < 2) return slice;
  const hardBreak = first.type.schema.nodes.hardBreak;
  if (!hardBreak) return slice;
  const pieces: ProseNode[] = [];
  blocks.forEach((block, index) => {
    if (index > 0) pieces.push(hardBreak.create());
    if (block.isTextblock) block.content.forEach((child) => pieces.push(child));
    else pieces.push(block);
  });
  return new Slice(Fragment.from(pieces), 0, 0);
}

export function InlineEditor({
  nodeId,
  slot,
  mode,
  initialText,
  caret,
  placeholder,
}: {
  nodeId: string;
  slot: SlotKey;
  mode: EditorMode;
  initialText: string;
  caret: 'start' | 'end';
  placeholder?: string;
}) {
  const { store, viewState, bindFinishEditing, editEpoch, suppressCommit } = useEditorContext();
  const extensions = useMemo(() => createExtensions({ mode, placeholder }), [mode, placeholder]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitRef = useRef<() => void>(() => {});
  const hostRef = useRef<HTMLSpanElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: markdownToDoc(initialText, mode),
    editorProps: {
      attributes: { class: styles.surface ?? '', 'data-lm-inline-editor': '' },
      ...(mode === 'single' ? { transformPasted: flattenPasted } : {}),
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape') return false;
        event.preventDefault();
        event.stopPropagation();
        exitRef.current();
        return true;
      },
    },
  });

  useEffect(() => {
    exitRef.current = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      if (editor && !suppressCommit.current) {
        commitSlot(store, nodeId, slot, docToMarkdown(editor.getJSON(), mode));
      }
      if (viewState.get().editing?.nodeId === nodeId) viewState.set({ editing: null });
    };
  }, [editor, mode, nodeId, slot, store, suppressCommit, viewState]);

  useEffect(() => {
    const host = hostRef.current;
    if (!editor || !host) return;
    if (editor.view.dom.parentNode !== host) host.replaceChildren(editor.view.dom);
    editor.commands.focus(caret === 'start' ? 'start' : 'end');
  }, [editor, caret]);

  useEffect(() => {
    if (!editor) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        if (suppressCommit.current) return;
        commitSlot(store, nodeId, slot, docToMarkdown(editor.getJSON(), mode));
      }, 800);
    };
    editor.on('update', schedule);
    return () => {
      editor.off('update', schedule);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, mode, nodeId, slot, store, suppressCommit]);

  const epochRef = useRef(editEpoch);
  useEffect(() => {
    if (!editor || epochRef.current === editEpoch) return;
    epochRef.current = editEpoch;
    if (timer.current) clearTimeout(timer.current);
    const live = findNode(store.getDocument(), nodeId)?.node;
    const text = live ? (readSlot(live, slot) ?? '') : '';
    editor.commands.setContent(markdownToDoc(text, mode), { emitUpdate: false });
    editor.commands.focus('end');
  }, [editEpoch, editor, mode, nodeId, slot, store]);

  useEffect(() => {
    bindFinishEditing(() => exitRef.current());
    return () => {
      if (suppressCommit.current) {
        suppressCommit.current = false;
        return;
      }
      exitRef.current();
      bindFinishEditing(null);
    };
  }, [bindFinishEditing, suppressCommit]);

  return <span ref={hostRef} data-lm-inline-editor="" className={styles.editor} />;
}
