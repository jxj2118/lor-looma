import type { ImageBlock } from '@lor-looma/core';
import { useState } from 'react';
import { InlineText } from '../inline/InlineText';
import { useNodeRenderContext } from '../nodes/context';
import styles from './blocks.module.css';

export function Image({ block }: { block: ImageBlock }) {
  const { assets, resolveAsset } = useNodeRenderContext();
  const asset = assets[block.assetId];
  const src = asset ? (resolveAsset?.(asset, block.assetId) ?? asset.src) : undefined;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== undefined && failedSrc === src;

  const showImage = Boolean(asset && src && !failed);

  return (
    <figure className={`${styles.block} ${styles.figure}`}>
      {showImage ? (
        <img
          src={src}
          alt={asset?.alt ?? ''}
          loading="lazy"
          decoding="async"
          data-fit={block.fit}
          data-width={block.width ?? 'auto'}
          onError={() => {
            if (src) setFailedSrc(src);
          }}
        />
      ) : (
        <div className={styles.missing} data-lm-image-missing="">
          <span className={styles.missingIcon} aria-hidden="true" />
          {asset?.alt ? <span>{asset.alt}</span> : null}
        </div>
      )}
      {block.caption ? (
        <figcaption className={styles.caption}>
          <InlineText text={block.caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}
