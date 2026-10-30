import { findNode, MAX_CONTAINER_DEPTH } from '@lor-looma/core';
import { filterCatalog, getCatalog } from '../insert/catalog';
import { insertionDepth } from '../insert/insertNode';
import { useEditor } from '@tiptap/react';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { useEffect, useMemo, useRef } from 'react';
import type { EditorMode } from './markdown';
import { docToMarkdown, markdownToDoc } from './markdown';
import { createExtensions } from './extensions';
import { commitSlot, readSlot } from './slots';
import {
  exitList,
  indentListItem,
  moveCell,
  outdentListItem,
  removeEmptyBlock,
  removeListItem,
  splitBlock,
  splitListItem,
} from './structure';
import type { StructureResult } from './structure';
import { FormatToolbar } from './FormatToolbar';
import { parseSlotKey } from '@lor-looma/viewer';
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

function currentMarkdown(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  mode: EditorMode,
): string {
  return docToMarkdown(editor.getJSON(), mode);
}

function halves(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  mode: EditorMode,
): { before: string; after: string } {
  const parent = editor.state.selection.$from.parent;
  const offset = editor.state.selection.$from.parentOffset;
  const beforeNode = parent.cut(0, offset);
  const afterNode = parent.cut(offset);
  return {
    before: docToMarkdown({ type: 'doc', content: [beforeNode.toJSON()] }, mode),
    after: docToMarkdown({ type: 'doc', content: [afterNode.toJSON()] }, mode),
  };
}

function cellRows(
  node: { type: string; rows?: string[][] },
  row: number,
  col: number,
  text: string,
): string[][] {
  return (node.rows ?? []).map((cells, rowIndex) =>
    cells.map((cell, colIndex) => (rowIndex === row && colIndex === col ? text : cell)),
  );
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
  const {
    store,
    viewState,
    bindFinishEditing,
    editEpoch,
    suppressCommitRef,
    messages,
    rootRef,
    slashActions,
  } = useEditorContext();
  const extensions = useMemo(() => createExtensions({ mode, placeholder }), [mode, placeholder]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitRef = useRef<() => void>(() => {});
  const keyRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const hostRef = useRef<HTMLSpanElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: markdownToDoc(initialText, mode),
    editorProps: {
      attributes: { class: styles.surface ?? '', 'data-lm-inline-editor': '' },
      ...(mode === 'single' ? { transformPasted: flattenPasted } : {}),
      handleKeyDown: (_view, event) => keyRef.current(event),
    },
  });

  useEffect(() => {
    exitRef.current = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      if (editor && !suppressCommitRef.current) {
        commitSlot(store, nodeId, slot, docToMarkdown(editor.getJSON(), mode));
      }
      if (viewState.get().editing?.nodeId === nodeId) viewState.set({ editing: null });
    };
  }, [editor, mode, nodeId, slot, store, suppressCommitRef, viewState]);

  useEffect(() => {
    const host = hostRef.current;
    if (!editor || !host) return;
    if (editor.view.dom.parentNode !== host) host.replaceChildren(editor.view.dom);
    editor.commands.focus(caret === 'start' ? 'start' : 'end');
  }, [editor, caret]);

  useEffect(() => {
    if (!editor) return;
    const syncSlash = () => {
      if (mode !== 'single') return;
      const live = findNode(store.getDocument(), nodeId)?.node;
      if (!live || live.type !== 'paragraph') return;
      const text = docToMarkdown(editor.getJSON(), mode);
      const current = viewState.get().slash;
      const owns =
        current?.source === 'text' &&
        current.target.kind === 'replace' &&
        current.target.nodeId === nodeId;
      if (!text.startsWith('/')) {
        if (owns) viewState.set({ slash: null });
        return;
      }
      const query = text.slice(1);
      const target = { kind: 'replace' as const, nodeId };
      const matches = filterCatalog(getCatalog(messages), query, {
        allowContainers: insertionDepth(store.getDocument(), target) < MAX_CONTAINER_DEPTH,
      });
      if (/\s$/.test(query) && matches.length === 0) {
        if (owns) viewState.set({ slash: null });
        return;
      }
      const anchor = { x: 0, y: 0 };
      try {
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        const box = rootRef.current?.getBoundingClientRect();
        anchor.x = coords.left - (box?.left ?? 0);
        anchor.y = coords.bottom - (box?.top ?? 0);
      } catch {
        // Selection coordinates are unavailable before layout.
      }
      viewState.set({ slash: { target, source: 'text', query, anchor } });
    };
    const schedule = () => {
      syncSlash();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        if (suppressCommitRef.current) return;
        commitSlot(store, nodeId, slot, docToMarkdown(editor.getJSON(), mode));
      }, 800);
    };
    editor.on('update', schedule);
    return () => {
      editor.off('update', schedule);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, messages, mode, nodeId, rootRef, slot, store, suppressCommitRef, viewState]);

  const epochRef = useRef(editEpoch);
  useEffect(() => {
    if (!editor || epochRef.current === editEpoch) return;
    epochRef.current = editEpoch;
    if (timer.current) clearTimeout(timer.current);
    const live = findNode(store.getDocument(), nodeId)?.node;
    const text = live ? (readSlot(live, slot) ?? '') : '';
    editor.commands.setContent(markdownToDoc(text, mode), { emitUpdate: false });
    suppressCommitRef.current = false;
    editor.commands.focus('end');
  }, [editEpoch, editor, mode, nodeId, slot, store, suppressCommitRef]);

  useEffect(() => {
    bindFinishEditing(() => exitRef.current());
    return () => {
      if (suppressCommitRef.current) {
        suppressCommitRef.current = false;
        return;
      }
      exitRef.current();
      bindFinishEditing(null);
    };
  }, [bindFinishEditing, suppressCommitRef]);

  useEffect(() => {
    const applyStructure = (result: StructureResult | null) => {
      if (!result) return;
      suppressCommitRef.current = true;
      const applied = store.apply(result.commands, { origin: 'user', label: 'Edit structure' });
      if (!applied.ok) {
        suppressCommitRef.current = false;
        return;
      }
      const cardId = findNode(store.getDocument(), result.next?.nodeId ?? nodeId)?.cardId ?? null;
      if (result.next && cardId) {
        viewState.set({
          editing: result.next,
          selection: { cardId, nodeIds: [result.next.nodeId] },
        });
        return;
      }
      viewState.set({
        editing: null,
        selection: cardId ? { cardId, nodeIds: [] } : { cardId: null, nodeIds: [] },
      });
    };
    keyRef.current = (event) => {
      if (!editor) return false;
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        mode === 'single' &&
        currentMarkdown(editor, mode) === ''
      ) {
        event.preventDefault();
        editor.commands.insertContent('/');
        viewState.set({
          slash: {
            target: { kind: 'replace', nodeId },
            source: 'text',
            query: '',
            anchor: { x: 0, y: 0 },
          },
        });
        return true;
      }
      const slash = viewState.get().slash;
      const slashHere =
        slash?.source === 'text' &&
        slash.target.kind === 'replace' &&
        slash.target.nodeId === nodeId;
      if (slashHere) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          slashActions.current.move(event.key === 'ArrowDown' ? 1 : -1);
          return true;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          slashActions.current.confirm();
          return true;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          viewState.set({ slash: null });
          return true;
        }
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          editor.commands.insertContent(event.key);
          return true;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        exitRef.current();
        return true;
      }
      if (event.key === 'Enter' && event.shiftKey) return false;
      const doc = store.getDocument();
      const live = findNode(doc, nodeId)?.node;
      if (!live) return false;
      const parsed = parseSlotKey(slot);
      const atStart =
        editor.state.selection.empty && editor.state.selection.$from.parentOffset === 0;
      if (event.key === 'Tab') {
        event.preventDefault();
        if (live.type === 'list' && parsed?.kind === 'item') {
          const text = currentMarkdown(editor, mode);
          applyStructure(
            event.shiftKey
              ? outdentListItem(doc, nodeId, parsed.path, text)
              : indentListItem(doc, nodeId, parsed.path, text),
          );
        } else if (live.type === 'table' && parsed?.kind === 'cell') {
          const moved = moveCell(doc, nodeId, parsed.row, parsed.col, event.shiftKey ? -1 : 1);
          if (moved) {
            const text = currentMarkdown(editor, mode);
            moved.commands = [
              {
                op: 'updateNode',
                id: nodeId,
                patch: { rows: cellRows(live, parsed.row, parsed.col, text) },
              },
              ...moved.commands,
            ];
            applyStructure(moved);
          }
        }
        return true;
      }
      if (event.key === 'Enter' && mode === 'single') {
        if (live.type === 'table') {
          exitRef.current();
          return true;
        }
        const { before, after } = halves(editor, mode);
        if (live.type === 'list' && parsed?.kind === 'item') {
          event.preventDefault();
          const result =
            before === '' && after === ''
              ? parsed.path.length > 1
                ? outdentListItem(doc, nodeId, parsed.path, '')
                : exitList(doc, nodeId, parsed.path)
              : splitListItem(doc, nodeId, parsed.path, before, after);
          applyStructure(result);
          return true;
        }
        if (live.type === 'heading' || live.type === 'paragraph') {
          event.preventDefault();
          applyStructure(splitBlock(doc, nodeId, before, after));
          return true;
        }
      }
      if (event.key === 'Backspace' && atStart && mode === 'single') {
        if (live.type === 'paragraph' && currentMarkdown(editor, mode) === '') {
          event.preventDefault();
          applyStructure(removeEmptyBlock(doc, nodeId));
          return true;
        }
        if (live.type === 'list' && parsed?.kind === 'item') {
          if (parsed.path.length > 1) {
            event.preventDefault();
            applyStructure(
              outdentListItem(doc, nodeId, parsed.path, currentMarkdown(editor, mode)),
            );
            return true;
          }
          if (currentMarkdown(editor, mode) === '') {
            event.preventDefault();
            applyStructure(removeListItem(doc, nodeId, parsed.path));
            return true;
          }
        }
      }
      return false;
    };
  }, [editor, mode, nodeId, slashActions, slot, store, suppressCommitRef, viewState]);

  return (
    <span ref={hostRef} data-lm-inline-editor="" className={styles.editor}>
      {editor ? <FormatToolbar editor={editor} /> : null}
    </span>
  );
}
