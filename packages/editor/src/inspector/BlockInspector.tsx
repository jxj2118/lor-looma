import { createId } from '@lor-looma/core';
import type { LoomaBlock } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import type { Messages } from '../i18n/en-US';
import { useEditorContext } from '../state/viewState';
import { AssetInput } from './AssetInput';
import type { PickedAsset } from './AssetInput';
import { NodeActions } from './NodeActions';
import styles from './Inspector.module.css';

function blockLabel(node: LoomaBlock, messages: Messages): string {
  switch (node.type) {
    case 'heading':
      if (node.level === 1) return messages.heading1;
      if (node.level === 2) return messages.heading2;
      return messages.heading3;
    case 'paragraph':
      return messages.paragraph;
    case 'list':
      return node.style === 'number'
        ? messages.numberList
        : node.style === 'check'
          ? messages.checkList
          : messages.bulletList;
    case 'callout':
      return messages.callout;
    case 'quote':
      return messages.quote;
    case 'code':
      return messages.codeBlock;
    case 'image':
      return messages.image;
    case 'table':
      return messages.table;
    case 'divider':
      return messages.divider;
    case 'unknown':
      return messages.unsupported;
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

export function BlockInspector({ node }: { node: LoomaBlock }) {
  const { store, messages } = useEditorContext();
  useLoomaDocument({ store });

  function patch(next: Record<string, unknown>) {
    store.apply([{ op: 'updateNode', id: node.id, patch: next }], {
      origin: 'user',
      label: 'Edit block',
    });
  }

  function replaceImage(asset: PickedAsset) {
    const id = createId('asset');
    const image: {
      kind: 'image';
      src: string;
      alt: string;
      width?: number;
      height?: number;
    } = { kind: 'image', src: asset.src, alt: asset.alt ?? '' };
    if (asset.width !== undefined) image.width = asset.width;
    if (asset.height !== undefined) image.height = asset.height;
    store.apply(
      [
        { op: 'putAsset', id, asset: image },
        { op: 'updateNode', id: node.id, patch: { assetId: id } },
      ],
      { origin: 'user', label: 'Replace image' },
    );
  }

  return (
    <div className={styles.body}>
      <p className={styles.kind}>{blockLabel(node, messages)}</p>
      <BlockFields node={node} patch={patch} replaceImage={replaceImage} />
      <NodeActions nodeId={node.id} />
    </div>
  );
}

function BlockFields({
  node,
  patch,
  replaceImage,
}: {
  node: LoomaBlock;
  patch: (next: Record<string, unknown>) => void;
  replaceImage: (asset: PickedAsset) => void;
}) {
  const { messages } = useEditorContext();
  switch (node.type) {
    case 'heading':
      return (
        <label className={styles.field}>
          {messages.headingLevel}
          <select
            aria-label={messages.headingLevel}
            value={String(node.level)}
            onChange={(event) => {
              const level = Number(event.target.value);
              if (level !== 1 && level !== 2 && level !== 3) return;
              patch({ level });
            }}
          >
            <option value="1">{messages.heading1}</option>
            <option value="2">{messages.heading2}</option>
            <option value="3">{messages.heading3}</option>
          </select>
        </label>
      );
    case 'paragraph':
      return (
        <label className={styles.field}>
          {messages.alignment}
          <select
            aria-label={messages.alignment}
            value={node.align ?? 'left'}
            onChange={(event) => {
              const align = event.target.value;
              if (align !== 'left' && align !== 'center' && align !== 'right') return;
              patch({ align });
            }}
          >
            <option value="left">{messages.alignLeft}</option>
            <option value="center">{messages.alignCenter}</option>
            <option value="right">{messages.alignRight}</option>
          </select>
        </label>
      );
    case 'list':
      return (
        <label className={styles.field}>
          {messages.listStyle}
          <select
            aria-label={messages.listStyle}
            value={node.style}
            onChange={(event) => {
              const style = event.target.value;
              if (style !== 'bullet' && style !== 'number' && style !== 'check') return;
              patch({ style });
            }}
          >
            <option value="bullet">{messages.bulletList}</option>
            <option value="number">{messages.numberList}</option>
            <option value="check">{messages.checkList}</option>
          </select>
        </label>
      );
    case 'callout':
      return (
        <label className={styles.field}>
          {messages.tone}
          <select
            aria-label={messages.tone}
            value={node.tone}
            onChange={(event) => {
              const tone = event.target.value;
              if (
                tone !== 'info' &&
                tone !== 'success' &&
                tone !== 'warning' &&
                tone !== 'danger' &&
                tone !== 'note'
              ) {
                return;
              }
              patch({ tone });
            }}
          >
            <option value="info">{messages.toneInfo}</option>
            <option value="success">{messages.toneSuccess}</option>
            <option value="warning">{messages.toneWarning}</option>
            <option value="danger">{messages.toneDanger}</option>
            <option value="note">{messages.toneNote}</option>
          </select>
        </label>
      );
    case 'quote':
      return (
        <label className={styles.field}>
          {messages.cite}
          <input
            aria-label={messages.cite}
            value={node.cite ?? ''}
            onChange={(event) =>
              patch({ cite: event.target.value === '' ? null : event.target.value })
            }
          />
        </label>
      );
    case 'code':
      return (
        <label className={styles.field}>
          {messages.language}
          <input
            aria-label={messages.language}
            value={node.language ?? ''}
            maxLength={32}
            onChange={(event) =>
              patch({ language: event.target.value === '' ? null : event.target.value })
            }
          />
        </label>
      );
    case 'image':
      return (
        <>
          <label className={styles.field}>
            {messages.imageFit}
            <select
              aria-label={messages.imageFit}
              value={node.fit ?? 'cover'}
              onChange={(event) => {
                const fit = event.target.value;
                if (fit !== 'cover' && fit !== 'contain') return;
                patch({ fit });
              }}
            >
              <option value="cover">{messages.fitCover}</option>
              <option value="contain">{messages.fitContain}</option>
            </select>
          </label>
          <label className={styles.field}>
            {messages.imageWidth}
            <select
              aria-label={messages.imageWidth}
              value={node.width ?? 'auto'}
              onChange={(event) => {
                const width = event.target.value;
                if (width !== 'auto' && width !== 'full') return;
                patch({ width });
              }}
            >
              <option value="auto">{messages.widthAuto}</option>
              <option value="full">{messages.widthFull}</option>
            </select>
          </label>
          <label className={styles.field}>
            {messages.caption}
            <input
              aria-label={messages.caption}
              value={node.caption ?? ''}
              onChange={(event) =>
                patch({ caption: event.target.value === '' ? null : event.target.value })
              }
            />
          </label>
          <AssetInput onPick={replaceImage} />
        </>
      );
    case 'table':
      return <TableFields node={node} patch={patch} />;
    case 'divider':
    case 'unknown':
      return null;
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function TableFields({
  node,
  patch,
}: {
  node: Extract<LoomaBlock, { type: 'table' }>;
  patch: (next: Record<string, unknown>) => void;
}) {
  const { messages } = useEditorContext();
  const columns = node.rows[0]?.length ?? 1;
  return (
    <>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={node.header}
          onChange={(event) => patch({ header: event.target.checked })}
        />
        {messages.tableHeader}
      </label>
      <div className={styles.row}>
        <button
          type="button"
          onClick={() => patch({ rows: [...node.rows, Array.from({ length: columns }, () => '')] })}
        >
          {messages.addRow}
        </button>
        <button
          type="button"
          disabled={node.rows.length <= 1}
          onClick={() => patch({ rows: node.rows.slice(0, -1) })}
        >
          {messages.removeRow}
        </button>
        <button type="button" onClick={() => patch({ rows: node.rows.map((row) => [...row, '']) })}>
          {messages.addColumn}
        </button>
        <button
          type="button"
          disabled={columns <= 1}
          onClick={() => patch({ rows: node.rows.map((row) => row.slice(0, -1)) })}
        >
          {messages.removeColumn}
        </button>
      </div>
    </>
  );
}
