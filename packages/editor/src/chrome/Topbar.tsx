import { THEME_PRESETS } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import { useEffect, useRef, useState } from 'react';
import { useEditorContext } from '../state/viewState';
import { PlayIcon, RedoIcon, UndoIcon } from './icons';
import styles from './Topbar.module.css';

export function Topbar({ onPlay }: { onPlay: () => void }) {
  const { store, messages, readOnly, finishEditing } = useEditorContext();
  const document = useLoomaDocument({ store });

  return (
    <div className={styles.bar} data-lm-topbar="">
      <Title title={document.title} readOnly={readOnly} />
      {readOnly ? null : (
        <div className={styles.group}>
          <button
            type="button"
            className={`${styles.button} ${styles.iconButton}`}
            aria-label={messages.undo}
            disabled={!store.canUndo()}
            onClick={() => {
              finishEditing();
              store.undo();
            }}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.iconButton}`}
            aria-label={messages.redo}
            disabled={!store.canRedo()}
            onClick={() => {
              finishEditing();
              store.redo();
            }}
          >
            <RedoIcon />
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={document.format === 'presentation'}
            onClick={() => {
              store.apply([{ op: 'setFormat', format: 'presentation' }], {
                origin: 'user',
                label: 'Format',
              });
            }}
          >
            {messages.formatPresentation}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-pressed={document.format === 'document'}
            onClick={() => {
              store.apply([{ op: 'setFormat', format: 'document' }], {
                origin: 'user',
                label: 'Format',
              });
            }}
          >
            {messages.formatDocument}
          </button>
          <select
            className={styles.select}
            aria-label={messages.theme}
            value={document.theme.preset}
            onChange={(event) => {
              const preset = THEME_PRESETS.find((item) => item === event.target.value);
              if (!preset) return;
              store.apply([{ op: 'setTheme', preset }], { origin: 'user', label: 'Theme' });
            }}
          >
            <option value="clean">{messages.themeClean}</option>
            <option value="dark">{messages.themeDark}</option>
            <option value="warm">{messages.themeWarm}</option>
            <option value="serif">{messages.themeSerif}</option>
          </select>
        </div>
      )}
      <button type="button" className={styles.button} onClick={onPlay}>
        <PlayIcon />
        {messages.play}
      </button>
    </div>
  );
}

function Title({ title, readOnly }: { title: string; readOnly: boolean }) {
  const { store, messages, registerPendingFlush } = useEditorContext();
  const [value, setValue] = useState(title);
  const valueRef = useRef(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRef = useRef<(next: string) => void>(() => {});

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    commitRef.current = (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      if (next === store.getDocument().title) return;
      store.apply([{ op: 'setTitle', title: next }], {
        origin: 'user',
        mergeKey: 'title',
        label: 'Edit title',
      });
    };
  }, [store]);

  useEffect(() => {
    if (!focused.current) setValue(title);
  }, [title]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (readOnly) return;
    return registerPendingFlush(() => {
      commitRef.current(valueRef.current);
    });
  }, [readOnly, registerPendingFlush]);

  if (readOnly) return <div className={styles.titleText}>{title}</div>;

  return (
    <input
      className={styles.title}
      aria-label={messages.titleLabel}
      placeholder={messages.titlePlaceholder}
      value={value}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commitRef.current(value);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        valueRef.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commitRef.current(next), 600);
      }}
    />
  );
}
