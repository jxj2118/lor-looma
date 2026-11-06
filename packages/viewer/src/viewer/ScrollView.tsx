import type { LoomaDocument } from '@lor-looma/core';
import { LoomaCardView } from '../card/LoomaCardView';
import type { LoomaCardViewProps } from '../card/LoomaCardView';
import { ScaledFrame } from '../frame/ScaledFrame';
import { cardLogicalSize } from '../scene/SceneView';
import styles from './LoomaViewer.module.css';

export function ScrollView({
  document,
  resolveAsset,
  renderNode,
  maxScale,
  overflowing,
}: {
  document: LoomaDocument;
  resolveAsset?: LoomaCardViewProps['resolveAsset'];
  renderNode?: LoomaCardViewProps['renderNode'];
  maxScale: number;
  overflowing: ReadonlySet<string>;
}) {
  if (document.cards.length === 0) {
    return <div className={styles.empty}>This document has no cards yet.</div>;
  }

  return (
    <div className={styles.scroll}>
      {document.cards.map((card) => {
        const overflow =
          document.format === 'presentation' && !card.scene && overflowing.has(card.id);
        const logical = cardLogicalSize(card, document.format);
        return (
          <div key={card.id} className={styles.slide} data-lm-overflow={overflow ? '' : undefined}>
            <ScaledFrame
              logicalWidth={logical.width}
              logicalHeight={logical.height}
              maxScale={maxScale}
            >
              <LoomaCardView
                card={card}
                document={document}
                resolveAsset={resolveAsset}
                renderNode={renderNode}
              />
            </ScaledFrame>
            {overflow ? (
              <span className={styles.badge} title="Content does not fit on this slide">
                Overflow
              </span>
            ) : null}
            {overflow ? <div className={styles.fade} /> : null}
          </div>
        );
      })}
    </div>
  );
}
