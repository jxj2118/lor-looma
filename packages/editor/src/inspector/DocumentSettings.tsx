import { THEME_PRESETS } from '@lor-looma/core';
import type { LoomaDocument, LoomaStore } from '@lor-looma/core';
import { useLoomaDocument } from '@lor-looma/viewer';
import type { CSSProperties } from 'react';
import type { Messages } from '../i18n/en-US';
import type { LoomaLocale } from '../i18n/locale';
import { messagesFor } from '../i18n/useMessages';
import styles from './Inspector.module.css';

export interface LoomaDocumentSettingsProps {
  store: LoomaStore;
  locale?: LoomaLocale;
  showFormat?: boolean;
  showThemePreset?: boolean;
  showThemeOverrides?: boolean;
  /** Called before applying any document/theme change so the host can flush active editor drafts. */
  onBeforeChange?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function LoomaDocumentSettings({
  store,
  locale = 'en-US',
  showFormat = true,
  showThemePreset = true,
  showThemeOverrides = true,
  onBeforeChange,
  className,
  style,
}: LoomaDocumentSettingsProps) {
  const doc = useLoomaDocument({ store });
  const messages = messagesFor(locale);

  return (
    <div
      className={
        className
          ? `${styles.settings} ${styles.body} ${className}`
          : `${styles.settings} ${styles.body}`
      }
      style={style}
      data-lm-document-settings=""
    >
      <DocumentFields
        doc={doc}
        store={store}
        messages={messages}
        showFormat={showFormat}
        showThemePreset={showThemePreset}
        showThemeOverrides={showThemeOverrides}
        onBeforeChange={onBeforeChange}
      />
    </div>
  );
}

export function DocumentFields({
  doc,
  store,
  messages,
  showFormat = true,
  showThemePreset = true,
  showThemeOverrides = true,
  onBeforeChange,
}: {
  doc: LoomaDocument;
  store: LoomaStore;
  messages: Messages;
  showFormat?: boolean;
  showThemePreset?: boolean;
  showThemeOverrides?: boolean;
  onBeforeChange?: () => void;
}) {
  const overrides = doc.theme.overrides ?? {};

  function setOverrides(patch: Record<string, unknown>) {
    onBeforeChange?.();
    store.apply([{ op: 'setTheme', overrides: patch }], {
      origin: 'user',
      label: 'Theme overrides',
    });
  }

  return (
    <>
      {showFormat || showThemePreset ? (
        <p className={styles.kind}>{messages.documentSettings}</p>
      ) : null}
      {showFormat ? (
        <label className={styles.field}>
          {messages.format}
          <select
            aria-label={messages.format}
            value={doc.format}
            onChange={(event) => {
              const format = event.target.value === 'document' ? 'document' : 'presentation';
              onBeforeChange?.();
              store.apply([{ op: 'setFormat', format }], { origin: 'user', label: 'Format' });
            }}
          >
            <option value="presentation">{messages.formatPresentation}</option>
            <option value="document">{messages.formatDocument}</option>
          </select>
        </label>
      ) : null}
      {showThemePreset ? (
        <label className={styles.field}>
          {messages.themePreset}
          <select
            aria-label={messages.themePreset}
            value={doc.theme.preset}
            onChange={(event) => {
              const preset = THEME_PRESETS.find((item) => item === event.target.value);
              if (!preset) return;
              onBeforeChange?.();
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
      ) : null}
      {showThemeOverrides ? (
        <>
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
      ) : null}
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

export function toHex(value: string | undefined, fallback: string): string {
  return value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
