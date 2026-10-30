import { HIGHLIGHT_COLORS, INLINE_COLORS, isSafeHref } from '@lor-looma/core';
import type { HighlightColor, InlineColor } from '@lor-looma/core';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { highlightColorValue, inlineColorValue } from '@lor-looma/viewer';
import { useEditorContext } from '../state/viewState';
import styles from './FormatToolbar.module.css';

function MarkButton({
  editor,
  name,
  label,
  command,
}: {
  editor: Editor;
  name: string;
  label: string;
  command: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={editor.isActive(name)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={command}
    >
      {label}
    </button>
  );
}

export function FormatToolbar({ editor }: { editor: Editor | null }) {
  const { messages, layerElement } = useEditorContext();
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const [error, setError] = useState('');
  if (!editor || !layerElement) return null;

  const applyLink = () => {
    const value = href.trim();
    if (value === '') {
      editor.chain().focus().unsetLink().run();
      setLinking(false);
      setError('');
      return;
    }
    if (!isSafeHref(value)) {
      setError(messages.unsafeLink);
      return;
    }
    editor.chain().focus().setLink({ href: value }).run();
    setLinking(false);
    setError('');
  };

  return (
    <BubbleMenu
      editor={editor}
      appendTo={layerElement}
      updateDelay={0}
      className={styles.toolbar}
      data-lm-format-toolbar=""
    >
      <MarkButton
        editor={editor}
        name="bold"
        label={messages.bold}
        command={() => editor.chain().focus().toggleBold().run()}
      />
      <MarkButton
        editor={editor}
        name="italic"
        label={messages.italic}
        command={() => editor.chain().focus().toggleItalic().run()}
      />
      <MarkButton
        editor={editor}
        name="strike"
        label={messages.strike}
        command={() => editor.chain().focus().toggleStrike().run()}
      />
      <MarkButton
        editor={editor}
        name="code"
        label={messages.code}
        command={() => editor.chain().focus().toggleCode().run()}
      />
      {linking ? (
        <form
          className={styles.linkForm}
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <input
            className={styles.linkInput}
            aria-label={messages.link}
            value={href}
            placeholder={messages.linkPlaceholder}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setLinking(false);
                setError('');
              }
            }}
          />
          {error ? <span className={styles.error}>{error}</span> : null}
        </form>
      ) : (
        <button
          type="button"
          className={styles.button}
          aria-pressed={editor.isActive('link')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setHref(editor.getAttributes('link').href ?? '');
            setError('');
            setLinking(true);
          }}
        >
          {messages.link}
        </button>
      )}
      <ColorMenu
        editor={editor}
        label={messages.color}
        colors={INLINE_COLORS}
        valueOf={inlineColorValue}
        mark="lmColor"
        active={(color) => editor.isActive('lmColor', { color })}
        apply={(color) => editor.chain().focus().setMark('lmColor', { color }).run()}
        clear={() => editor.chain().focus().unsetMark('lmColor').run()}
        container={layerElement}
        defaultLabel={messages.defaultColor}
      />
      <ColorMenu
        editor={editor}
        label={messages.highlight}
        colors={HIGHLIGHT_COLORS}
        valueOf={highlightColorValue}
        mark="lmHighlight"
        active={(color) => editor.isActive('lmHighlight', { color })}
        apply={(color) => editor.chain().focus().setMark('lmHighlight', { color }).run()}
        clear={() => editor.chain().focus().unsetMark('lmHighlight').run()}
        container={layerElement}
        defaultLabel={messages.defaultColor}
      />
    </BubbleMenu>
  );
}

function ColorMenu<T extends InlineColor | HighlightColor>({
  editor,
  label,
  colors,
  valueOf,
  mark,
  active,
  apply,
  clear,
  container,
  defaultLabel,
}: {
  editor: Editor;
  label: string;
  colors: readonly T[];
  valueOf: (color: T) => string;
  mark: 'lmColor' | 'lmHighlight';
  active: (color: T) => boolean;
  apply: (color: T) => void;
  clear: () => void;
  container: HTMLElement;
  defaultLabel: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.button}
          aria-pressed={editor.isActive(mark)}
          onMouseDown={(event) => event.preventDefault()}
        >
          {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content className={styles.popover} data-lm-color-popover="" sideOffset={6}>
          <button type="button" className={styles.swatch} onClick={clear}>
            {defaultLabel}
          </button>
          <div className={styles.grid}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.chip}
                aria-label={color}
                aria-pressed={active(color)}
                style={{ background: valueOf(color) }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(color)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
