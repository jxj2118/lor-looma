import type { LoomaAsset, LoomaCard, LoomaDocument } from '@lor-looma/core';
import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { LOGICAL_SIZE, TYPE_SCALE } from '../constants';
import { NodeView } from '../nodes/NodeView';
import { NodeRenderProvider } from '../nodes/context';
import { surfaceVariables } from '../theme/surface';
import type { RenderNode } from '../nodes/context';
import styles from './LoomaCardView.module.css';

export type { RenderNode, RenderNodeInfo } from '../nodes/context';

export interface LoomaCardViewProps {
  card: LoomaCard;
  document: LoomaDocument;
  resolveAsset?: (asset: LoomaAsset, id: string) => string;
  renderNode?: RenderNode;
  className?: string;
}

function sizeVariables(format: LoomaDocument['format']): Record<`--lm-${string}`, string> {
  const scale = TYPE_SCALE[format];
  return {
    '--lm-size-h1': `${scale.h1}px`,
    '--lm-size-h2': `${scale.h2}px`,
    '--lm-size-h3': `${scale.h3}px`,
    '--lm-size-body': `${scale.body}px`,
    '--lm-size-small': `${scale.small}px`,
    '--lm-line-body': String(scale.lineHeightBody),
    '--lm-line-heading': String(scale.lineHeightHeading),
    '--lm-block-gap': `${scale.blockGap}px`,
    '--lm-pad-x': `${scale.paddingX}px`,
    '--lm-pad-y': `${scale.paddingY}px`,
  };
}

function assetSrc(
  assets: LoomaDocument['assets'],
  id: string,
  resolveAsset: LoomaCardViewProps['resolveAsset'],
): string | undefined {
  const asset = assets[id];
  if (!asset) return undefined;
  return resolveAsset?.(asset, id) ?? asset.src;
}

function sameCardProps(prev: LoomaCardViewProps, next: LoomaCardViewProps): boolean {
  return (
    prev.card === next.card &&
    prev.document.format === next.document.format &&
    prev.document.assets === next.document.assets &&
    prev.document.theme === next.document.theme &&
    prev.resolveAsset === next.resolveAsset &&
    prev.renderNode === next.renderNode &&
    prev.className === next.className
  );
}

export const LoomaCardView = memo(function LoomaCardView({
  card,
  document,
  resolveAsset,
  renderNode,
  className,
}: LoomaCardViewProps) {
  const format = document.format;
  const assets = document.assets;
  const context = useMemo(
    () => ({ format, assets, resolveAsset, renderNode }),
    [format, assets, resolveAsset, renderNode],
  );

  const accentSrc = card.accent ? assetSrc(assets, card.accent.assetId, resolveAsset) : undefined;
  const accentPosition = card.accent && accentSrc ? card.accent.position : undefined;
  const paint = backgroundPaint(card, assets, resolveAsset, accentPosition, accentSrc);
  const surface = surfaceVariables(document.theme, card.background);

  const style = {
    ...sizeVariables(format),
    ...surface.vars,
    ...paint.style,
    ...(format === 'presentation' ? { height: LOGICAL_SIZE.presentation.height } : null),
    ...(accentPosition === 'left'
      ? { display: 'grid', gridTemplateColumns: '40% minmax(0, 1fr)' }
      : null),
    ...(accentPosition === 'right'
      ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40%' }
      : null),
  } as CSSProperties;

  const media =
    accentPosition === 'left' || accentPosition === 'right' || accentPosition === 'top' ? (
      <div
        data-lm-accent-media={accentPosition}
        className={styles.accent}
        style={
          accentPosition === 'top' ? { height: format === 'document' ? '240px' : '36%' } : undefined
        }
      >
        <img src={accentSrc} alt={assets[card.accent?.assetId ?? '']?.alt ?? ''} />
      </div>
    ) : null;

  const content = (
    <div data-lm-card-content="" className={styles.content}>
      {card.body.map((node, index) => (
        <NodeView
          key={node.id}
          node={node}
          info={{ depth: 0, parentId: card.id, slot: null, index }}
        />
      ))}
    </div>
  );

  return (
    <NodeRenderProvider value={context}>
      <section
        data-lm-card-id={card.id}
        data-lm-format={format}
        data-lm-accent={accentPosition}
        data-lm-surface={surface.tone}
        className={className ? `${styles.card} ${className}` : styles.card}
        style={style}
      >
        {paint.overlay ? <div data-lm-bg-overlay="" className={styles.overlay} /> : null}
        {accentPosition === 'left' || accentPosition === 'top' ? media : null}
        {content}
        {accentPosition === 'right' ? media : null}
      </section>
    </NodeRenderProvider>
  );
}, sameCardProps);

function backgroundPaint(
  card: LoomaCard,
  assets: LoomaDocument['assets'],
  resolveAsset: LoomaCardViewProps['resolveAsset'],
  accentPosition: 'left' | 'right' | 'top' | 'background' | undefined,
  accentSrc: string | undefined,
): { style: CSSProperties; overlay: boolean } {
  if (accentPosition === 'background' && accentSrc) {
    return {
      overlay: true,
      style: {
        backgroundImage: `url("${accentSrc}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }
  const background = card.background;
  if (!background) return { style: {}, overlay: false };
  if (background.kind === 'color')
    return { style: { backgroundColor: background.value }, overlay: false };
  if (background.kind === 'gradient') {
    return {
      overlay: false,
      style: {
        backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
      },
    };
  }
  const src = assetSrc(assets, background.assetId, resolveAsset);
  if (!src) return { style: {}, overlay: false };
  return {
    overlay: true,
    style: {
      backgroundImage: `url("${src}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    },
  };
}
