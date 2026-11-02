import { createId, findCard, THEME_PRESETS } from '@lor-looma/core';
import type { LoomaCard, LoomaDocument } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import { useEffect, useState } from 'react';
import { useEditorContext, useViewState } from '../state/viewState';
import { AssetInput } from './AssetInput';
import styles from './Inspector.module.css';

type AccentPosition = 'left' | 'right' | 'top' | 'background';

function isAccentPosition(value: string): value is AccentPosition {
  return value === 'left' || value === 'right' || value === 'top' || value === 'background';
}

export function CardDocumentInspector() {
  const { store } = useEditorContext();
  const doc = useLoomaDocument({ store });
  const selectedCardId = useViewState((state) => state.selection.cardId);
  const cardId = selectedCardId ?? doc.cards[0]?.id ?? null;
  const card = cardId ? findCard(doc, cardId)?.card : undefined;

  return (
    <div className={styles.body}>
      {card ? <CardFields key={card.id} card={card} /> : null}
      <DocumentFields doc={doc} />
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
    accent?: { position: AccentPosition; assetId: string } | null;
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
            if (card.accent) update({ accent: { position: next, assetId: card.accent.assetId } });
            else setPendingAccent(next);
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
                  patch: { accent: { position, assetId: id } },
                },
              ],
              { origin: 'user', label: 'Card image' },
            );
            setPendingAccent(null);
          }}
        />
      ) : null}
      {card.accent ? (
        <button type="button" onClick={() => update({ accent: null })}>
          {messages.removeAccent}
        </button>
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
  const { store, messages } = useEditorContext();
  const [draft, setDraft] = useState(notes);

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

function DocumentFields({ doc }: { doc: LoomaDocument }) {
  const { store, messages } = useEditorContext();
  const overrides = doc.theme.overrides ?? {};

  function setOverrides(patch: Record<string, unknown>) {
    store.apply([{ op: 'setTheme', overrides: patch }], {
      origin: 'user',
      label: 'Theme overrides',
    });
  }

  return (
    <>
      <p className={styles.kind}>{messages.documentSettings}</p>
      <label className={styles.field}>
        {messages.format}
        <select
          aria-label={messages.format}
          value={doc.format}
          onChange={(event) => {
            const format = event.target.value === 'document' ? 'document' : 'presentation';
            store.apply([{ op: 'setFormat', format }], { origin: 'user', label: 'Format' });
          }}
        >
          <option value="presentation">{messages.formatPresentation}</option>
          <option value="document">{messages.formatDocument}</option>
        </select>
      </label>
      <label className={styles.field}>
        {messages.themePreset}
        <select
          aria-label={messages.themePreset}
          value={doc.theme.preset}
          onChange={(event) => {
            const preset = THEME_PRESETS.find((item) => item === event.target.value);
            if (!preset) return;
            store.apply([{ op: 'setTheme', preset }], { origin: 'user', label: 'Theme' });
          }}
        >
          {THEME_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset === 'clean'
                ? messages.themeClean
                : preset === 'dark'
                  ? messages.themeDark
                  : preset === 'warm'
                    ? messages.themeWarm
                    : messages.themeSerif}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.kind}>{messages.themeOverrides}</p>
      <ColorOverride
        label={messages.colorPrimary}
        value={overrides.colorPrimary}
        fallback="#2563eb"
        onChange={(value) => setOverrides({ colorPrimary: value })}
      />
      <ColorOverride
        label={messages.colorAccent}
        value={overrides.colorAccent}
        fallback="#7c3aed"
        onChange={(value) => setOverrides({ colorAccent: value })}
      />
      <ColorOverride
        label={messages.colorBg}
        value={overrides.colorBg}
        fallback="#f6f7f9"
        onChange={(value) => setOverrides({ colorBg: value })}
      />
      <ColorOverride
        label={messages.colorFg}
        value={overrides.colorFg}
        fallback="#1f2328"
        onChange={(value) => setOverrides({ colorFg: value })}
      />
      <ColorOverride
        label={messages.themeCardBackground}
        value={overrides.cardBackground}
        fallback="#ffffff"
        onChange={(value) => setOverrides({ cardBackground: value })}
      />
      <label className={styles.field}>
        {messages.radius}
        <input
          aria-label={messages.radius}
          type="number"
          min={0}
          max={32}
          step={1}
          value={String(overrides.radius ?? 12)}
          onChange={(event) => {
            const radius = Number(event.target.value);
            if (!Number.isInteger(radius) || radius < 0 || radius > 32) return;
            setOverrides({ radius });
          }}
        />
      </label>
      <label className={styles.field}>
        {messages.fontScale}
        <input
          aria-label={messages.fontScale}
          type="number"
          min={0.8}
          max={1.4}
          step={0.05}
          value={String(overrides.fontScale ?? 1)}
          onChange={(event) => {
            const fontScale = Number(event.target.value);
            if (!Number.isFinite(fontScale) || fontScale < 0.8 || fontScale > 1.4) return;
            setOverrides({ fontScale });
          }}
        />
      </label>
      <label className={styles.field}>
        {messages.spacing}
        <input
          aria-label={messages.spacing}
          type="number"
          min={0.75}
          max={1.5}
          step={0.05}
          value={String(overrides.spacing ?? 1)}
          onChange={(event) => {
            const spacing = Number(event.target.value);
            if (!Number.isFinite(spacing) || spacing < 0.75 || spacing > 1.5) return;
            setOverrides({ spacing });
          }}
        />
      </label>
      <button
        type="button"
        disabled={Object.keys(overrides).length === 0}
        onClick={() => {
          const cleared: Record<string, null> = {};
          for (const key of Object.keys(overrides)) cleared[key] = null;
          setOverrides(cleared);
        }}
      >
        {messages.resetOverrides}
      </button>
    </>
  );
}

function ColorOverride({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        aria-label={label}
        type="color"
        value={toHex(value, fallback)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function toHex(value: string | undefined, fallback: string): string {
  return value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
