import { createId, findCard } from '@lor-looma/core';
import type { LoomaCard } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import { useEffect, useRef, useState } from 'react';
import { useEditorContext, useViewState } from '../state/viewState';
import { AssetInput } from './AssetInput';
import { DocumentFields, toHex } from './DocumentSettings';
import { FocalPointFields } from './FocalPointFields';
import styles from './Inspector.module.css';

type AccentPosition = 'left' | 'right' | 'top' | 'background';

function isAccentPosition(value: string): value is AccentPosition {
  return value === 'left' || value === 'right' || value === 'top' || value === 'background';
}

export function CardDocumentInspector() {
  const { store, messages, documentSettings } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const selectedCardId = useViewState((state) => state.selection.cardId);
  const cardId = selectedCardId ?? doc.cards[0]?.id ?? null;
  const card = cardId ? findCard(doc, cardId)?.card : undefined;

  return (
    <div className={styles.body}>
      {card ? <CardFields key={card.id} card={card} /> : null}
      {documentSettings ? <DocumentFields doc={doc} store={store} messages={messages} /> : null}
    </div>
  );
}

function CardFields({ card }: { card: LoomaCard }) {
  const { store, messages } = useEditorContext();
  const [pendingAccent, setPendingAccent] = useState<AccentPosition | null>(null);
  const [pendingImage, setPendingImage] = useState(false);
  const accentPosition = card.accent?.position ?? pendingAccent ?? 'none';
  const backgroundKind = pendingImage ? 'image' : (card.background?.kind ?? 'default');

  function update(patch: {
    accent?: {
      position: AccentPosition;
      assetId: string;
      focalPoint?: { x: number; y: number };
    } | null;
    background?: LoomaCard['background'] | null;
    notes?: string | null;
  }) {
    store.apply([{ op: 'updateCard', id: card.id, patch }], { origin: 'user', label: 'Edit card' });
  }

  return (
    <>
      <p className={styles.kind}>{messages.cardAccent}</p>
      <label className={styles.field}>
        {messages.cardAccent}
        <select
          aria-label={messages.cardAccent}
          value={accentPosition}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'none') {
              setPendingAccent(null);
              if (card.accent) update({ accent: null });
              return;
            }
            if (!isAccentPosition(next)) return;
            if (card.accent) {
              update({
                accent: {
                  position: next,
                  assetId: card.accent.assetId,
                  ...(card.accent.focalPoint ? { focalPoint: card.accent.focalPoint } : {}),
                },
              });
            } else setPendingAccent(next);
          }}
        >
          <option value="none">{messages.accentNone}</option>
          <option value="left">{messages.accentLeft}</option>
          <option value="right">{messages.accentRight}</option>
          <option value="top">{messages.accentTop}</option>
          <option value="background">{messages.accentBackground}</option>
        </select>
      </label>
      {accentPosition !== 'none' ? (
        <AssetInput
          onPick={(asset) => {
            const position = card.accent?.position ?? pendingAccent;
            if (!position) return;
            const id = createId('asset');
            store.apply(
              [
                {
                  op: 'putAsset',
                  id,
                  asset: {
                    kind: 'image',
                    src: asset.src,
                    alt: asset.alt ?? '',
                    ...(asset.width !== undefined ? { width: asset.width } : {}),
                    ...(asset.height !== undefined ? { height: asset.height } : {}),
                  },
                },
                {
                  op: 'updateCard',
                  id: card.id,
                  patch: {
                    accent: {
                      position,
                      assetId: id,
                      ...(card.accent?.focalPoint ? { focalPoint: card.accent.focalPoint } : {}),
                    },
                  },
                },
              ],
              { origin: 'user', label: 'Card image' },
            );
            setPendingAccent(null);
          }}
        />
      ) : null}
      {card.accent ? (
        <>
          <FocalPointFields
            focal={card.accent.focalPoint}
            onChange={(focalPoint) => {
              if (!card.accent) return;
              update({
                accent: focalPoint
                  ? {
                      position: card.accent.position,
                      assetId: card.accent.assetId,
                      focalPoint,
                    }
                  : { position: card.accent.position, assetId: card.accent.assetId },
              });
            }}
          />
          <button type="button" onClick={() => update({ accent: null })}>
            {messages.removeAccent}
          </button>
        </>
      ) : null}

      <p className={styles.kind}>{messages.cardBackground}</p>
      <label className={styles.field}>
        {messages.cardBackground}
        <select
          aria-label={messages.cardBackground}
          value={backgroundKind}
          onChange={(event) => {
            const next = event.target.value;
            setPendingImage(false);
            if (next === 'default') {
              if (card.background) update({ background: null });
              return;
            }
            if (next === 'color') {
              const value = card.background?.kind === 'color' ? card.background.value : '#ffffff';
              update({ background: { kind: 'color', value } });
              return;
            }
            if (next === 'gradient') {
              const current = card.background?.kind === 'gradient' ? card.background : null;
              update({
                background: {
                  kind: 'gradient',
                  from: current?.from ?? '#ffffff',
                  to: current?.to ?? '#2563eb',
                  angle: current?.angle ?? 135,
                },
              });
              return;
            }
            if (next === 'image') setPendingImage(true);
          }}
        >
          <option value="default">{messages.backgroundDefault}</option>
          <option value="color">{messages.backgroundColor}</option>
          <option value="gradient">{messages.backgroundGradient}</option>
          <option value="image">{messages.backgroundImage}</option>
        </select>
      </label>
      {!pendingImage && card.background?.kind === 'color' ? (
        <label className={styles.field}>
          {messages.backgroundColor}
          <input
            aria-label={messages.backgroundColor}
            type="color"
            value={toHex(card.background.value, '#ffffff')}
            onChange={(event) =>
              update({ background: { kind: 'color', value: event.target.value } })
            }
          />
        </label>
      ) : null}
      {!pendingImage && card.background?.kind === 'gradient' ? (
        <>
          <label className={styles.field}>
            {messages.gradientFrom}
            <input
              aria-label={messages.gradientFrom}
              type="color"
              value={toHex(card.background.from, '#ffffff')}
              onChange={(event) => {
                if (card.background?.kind !== 'gradient') return;
                update({
                  background: { ...card.background, from: event.target.value },
                });
              }}
            />
          </label>
          <label className={styles.field}>
            {messages.gradientTo}
            <input
              aria-label={messages.gradientTo}
              type="color"
              value={toHex(card.background.to, '#2563eb')}
              onChange={(event) => {
                if (card.background?.kind !== 'gradient') return;
                update({ background: { ...card.background, to: event.target.value } });
              }}
            />
          </label>
          <label className={styles.field}>
            {messages.gradientAngle}
            <input
              aria-label={messages.gradientAngle}
              type="number"
              min={0}
              max={360}
              value={String(card.background.angle)}
              onChange={(event) => {
                if (card.background?.kind !== 'gradient') return;
                const angle = Number(event.target.value);
                if (!Number.isFinite(angle) || angle < 0 || angle > 360) return;
                update({ background: { ...card.background, angle } });
              }}
            />
          </label>
        </>
      ) : null}
      {backgroundKind === 'image' ? (
        <AssetInput
          onPick={(asset) => {
            const id = createId('asset');
            store.apply(
              [
                {
                  op: 'putAsset',
                  id,
                  asset: {
                    kind: 'image',
                    src: asset.src,
                    alt: asset.alt ?? '',
                    ...(asset.width !== undefined ? { width: asset.width } : {}),
                    ...(asset.height !== undefined ? { height: asset.height } : {}),
                  },
                },
                {
                  op: 'updateCard',
                  id: card.id,
                  patch: { background: { kind: 'image', assetId: id } },
                },
              ],
              { origin: 'user', label: 'Card background' },
            );
            setPendingImage(false);
          }}
        />
      ) : null}
      <NotesField
        key={`${card.id}:${card.notes ?? ''}`}
        cardId={card.id}
        notes={card.notes ?? ''}
      />
    </>
  );
}

function NotesField({ cardId, notes }: { cardId: string; notes: string }) {
  const { store, messages, registerPendingFlush } = useEditorContext();
  const [draft, setDraft] = useState(notes);
  const draftRef = useRef(draft);
  const notesRef = useRef(notes);

  useEffect(() => {
    draftRef.current = draft;
    notesRef.current = notes;
  }, [draft, notes]);

  useEffect(() => {
    if (draft === notes) return;
    const timer = setTimeout(() => {
      store.apply(
        [{ op: 'updateCard', id: cardId, patch: { notes: draft === '' ? null : draft } }],
        {
          origin: 'user',
          label: 'Notes',
          mergeKey: `notes:${cardId}`,
        },
      );
    }, 600);
    return () => clearTimeout(timer);
  }, [cardId, draft, notes, store]);

  useEffect(() => {
    return registerPendingFlush(() => {
      const next = draftRef.current;
      if (next === notesRef.current) return;
      store.apply([{ op: 'updateCard', id: cardId, patch: { notes: next === '' ? null : next } }], {
        origin: 'user',
        label: 'Notes',
        mergeKey: `notes:${cardId}`,
      });
    });
  }, [cardId, registerPendingFlush, store]);

  return (
    <label className={styles.field}>
      {messages.speakerNotes}
      <textarea
        aria-label={messages.speakerNotes}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft === notes) return;
          store.apply(
            [{ op: 'updateCard', id: cardId, patch: { notes: draft === '' ? null : draft } }],
            { origin: 'user', label: 'Notes', mergeKey: `notes:${cardId}` },
          );
        }}
      />
    </label>
  );
}
