import { createId, findNode, MAX_CONTAINER_DEPTH } from '@lor-looma/core';
import * as Popover from '@radix-ui/react-popover';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorContext, useViewState } from '../state/viewState';
import { filterCatalog, getCatalog } from './catalog';
import type { CatalogItem } from './catalog';
import { buildInsert, insertionDepth } from './insertNode';
import styles from './SlashMenu.module.css';

export function SlashMenu() {
  const slash = useViewState((state) => state.slash);
  const {
    store,
    messages,
    layerElement,
    viewState,
    suppressCommitRef,
    slashActions,
    uploadAsset,
    bumpEditEpoch,
  } = useEditorContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState({ query: slash?.query ?? '', index: 0 });
  const index = cursor.query === (slash?.query ?? '') ? cursor.index : 0;
  const setIndex = (update: number | ((current: number) => number)) => {
    setCursor((current) => {
      const query = slash?.query ?? '';
      const base = current.query === query ? current.index : 0;
      return { query, index: typeof update === 'function' ? update(base) : update };
    });
  };
  const depth = slash ? insertionDepth(store.getDocument(), slash.target) : 0;
  const visible = useMemo(
    () =>
      filterCatalog(getCatalog(messages), slash?.query ?? '', {
        allowContainers: depth < MAX_CONTAINER_DEPTH,
      }),
    [depth, messages, slash?.query],
  );

  useEffect(() => {
    slashActions.current.move = (delta) => {
      setIndex((current) => {
        if (visible.length === 0) return 0;
        return (current + delta + visible.length) % visible.length;
      });
    };
    slashActions.current.confirm = () => {
      const item = visible[index];
      if (item) choose(item);
    };
    const actions = slashActions.current;
    return () => {
      actions.move = () => {};
      actions.confirm = () => {};
    };
  });

  function choose(item: CatalogItem) {
    if (!slash) return;
    if (item.needsAsset) {
      if (uploadAsset) fileRef.current?.click();
      else setUrlMode(true);
      return;
    }
    commit(item.build());
  }

  function commit(
    template: unknown,
    assetCommand?: { id: string; src: string; alt?: string; width?: number; height?: number },
  ) {
    if (!slash) return;
    const doc = store.getDocument();
    const result = buildInsert(doc, slash.target, template);
    const commands = assetCommand
      ? [
          {
            op: 'putAsset' as const,
            id: assetCommand.id,
            asset: {
              kind: 'image',
              src: assetCommand.src,
              alt: assetCommand.alt,
              width: assetCommand.width,
              height: assetCommand.height,
            },
          },
          ...result.commands,
        ]
      : result.commands;
    suppressCommitRef.current = true;
    const applied = store.apply(commands, { origin: 'user', label: 'Insert block' });
    bumpEditEpoch();
    if (!applied.ok) {
      viewState.set({
        slash: null,
        notice: { id: Date.now(), message: applied.errors[0]?.message ?? 'Insert failed' },
      });
      return;
    }
    const inserted = result.next
      ? findNode(applied.doc, result.next.nodeId)
      : findNode(applied.doc, slash.target.kind === 'replace' ? slash.target.nodeId : '');
    const cardId =
      slash.target.kind === 'card'
        ? slash.target.cardId
        : (findNode(
            applied.doc,
            slash.target.kind === 'replace' ? slash.target.nodeId : slash.target.nodeId,
          )?.cardId ?? null);
    const selectedId = result.next?.nodeId ?? inserted?.node.id ?? null;
    viewState.set({
      slash: null,
      editing: result.next,
      selection:
        selectedId && cardId ? { cardId, nodeIds: [selectedId] } : viewState.get().selection,
    });
  }

  if (!slash || !layerElement) return null;

  const groups = ['text', 'media', 'layout'] as const;

  return (
    <Popover.Root open>
      <Popover.Anchor
        className={styles.anchor}
        style={{ left: slash.anchor.x, top: slash.anchor.y }}
      />
      <Popover.Portal container={layerElement}>
        <Popover.Content
          className={styles.menu}
          data-lm-slash=""
          side="bottom"
          align="start"
          onOpenAutoFocus={(event) => {
            if (slash.source === 'text') event.preventDefault();
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            viewState.set({ slash: null });
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              const upload = uploadAsset;
              if (!file || !upload) return;
              void upload(file)
                .then((uploaded) => {
                  const id = createId('asset');
                  const image = getCatalog(messages).find((entry) => entry.id === 'image');
                  if (!image) return;
                  commit(image.build(id), {
                    id,
                    src: uploaded.src,
                    alt: uploaded.alt ?? file.name,
                    width: uploaded.width,
                    height: uploaded.height,
                  });
                })
                .catch(() => {
                  viewState.set({
                    notice: { id: Date.now(), message: messages.imageUploadFailed },
                  });
                });
            }}
          />
          {slash.source === 'button' ? (
            <input
              className={styles.search}
              autoFocus
              aria-label={messages.searchBlocks}
              placeholder={messages.searchBlocks}
              value={slash.query}
              onChange={(event) =>
                viewState.set({ slash: { ...slash, query: event.target.value } })
              }
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  slashActions.current.move(1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  slashActions.current.move(-1);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  slashActions.current.confirm();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  viewState.set({ slash: null });
                }
              }}
            />
          ) : null}
          {urlMode ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !url.startsWith('https://') &&
                  !url.startsWith('http://') &&
                  !url.startsWith('data:image/')
                ) {
                  setError(messages.imageUrlInvalid);
                  return;
                }
                const id = createId('asset');
                const image = getCatalog(messages).find((entry) => entry.id === 'image');
                if (!image) return;
                commit(image.build(id), { id, src: url, alt: url });
              }}
            >
              <input
                className={styles.search}
                autoFocus
                aria-label={messages.imageUrlPlaceholder}
                value={url}
                placeholder={messages.imageUrlPlaceholder}
                onChange={(event) => setUrl(event.target.value)}
              />
              {error ? <p className={styles.error}>{error}</p> : null}
            </form>
          ) : visible.length === 0 ? (
            <p className={styles.empty}>{messages.noMatchingBlocks}</p>
          ) : (
            groups.map((group) => {
              const entries = visible.filter((entry) => entry.group === group);
              if (entries.length === 0) return null;
              const label =
                group === 'text'
                  ? messages.groupText
                  : group === 'media'
                    ? messages.groupMedia
                    : messages.groupLayout;
              return (
                <div key={group}>
                  <p className={styles.group}>{label}</p>
                  {entries.map((entry) => {
                    const selected = visible[index]?.id === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={selected ? styles.itemActive : styles.item}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(entry)}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
