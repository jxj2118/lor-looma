import type { ImageBlock } from '@lor-looma/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { InlineText } from '../inline/InlineText';
import { useNodeRenderContext } from '../nodes/context';
import styles from './blocks.module.css';

export function Image({ block }: { block: ImageBlock }) {
  const { assets, resolveAsset, renderNode } = useNodeRenderContext();
  const asset = assets[block.assetId];
  const src = asset ? (resolveAsset?.(asset, block.assetId) ?? asset.src) : undefined;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const failed = src !== undefined && failedSrc === src;
  const showImage = Boolean(asset && src && !failed);
  const zoomable = renderNode === undefined && showImage;
  const focal = block.focalPoint;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const preview =
    open && src && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label={asset?.alt || 'Image preview'}
            data-lm-lightbox=""
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            <button
              type="button"
              className={styles.lightboxClose}
              aria-label="Close"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
            >
              ×
            </button>
            <img
              src={src}
              alt={asset?.alt ?? ''}
              className={styles.lightboxImage}
              onClick={(event) => event.stopPropagation()}
            />
            {block.caption ? (
              <figcaption
                className={styles.lightboxCaption}
                onClick={(event) => event.stopPropagation()}
              >
                <InlineText text={block.caption} />
              </figcaption>
            ) : null}
          </div>,
          document.body,
        )
      : null;

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
          data-focal={focal ? `${focal.x},${focal.y}` : undefined}
          data-lm-zoom={zoomable ? '' : undefined}
          style={focal ? { objectPosition: `${focal.x}% ${focal.y}%` } : undefined}
          onClick={
            zoomable
              ? (event) => {
                  event.stopPropagation();
                  setOpen(true);
                }
              : undefined
          }
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
      {preview}
    </figure>
  );
}
