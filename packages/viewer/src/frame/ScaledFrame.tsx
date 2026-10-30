import type { ReactNode } from 'react';
import { useElementSize } from '../hooks/useElementSize';
import styles from './ScaledFrame.module.css';

export function ScaledFrame({
  logicalWidth,
  logicalHeight,
  maxScale,
  fit = 'width',
  children,
}: {
  logicalWidth: number;
  logicalHeight?: number;
  maxScale?: number;
  fit?: 'width' | 'contain';
  children: ReactNode;
}) {
  const [outerRef, outer] = useElementSize<HTMLDivElement>();
  const [innerRef, inner] = useElementSize<HTMLDivElement>();
  const ready = outer.width > 0 && (fit !== 'contain' || outer.height > 0);
  const cap = maxScale ?? Number.POSITIVE_INFINITY;
  const contain = fit === 'contain' && logicalHeight !== undefined;
  const scale = !ready
    ? 1
    : contain
      ? Math.min(outer.width / logicalWidth, outer.height / logicalHeight, cap)
      : Math.min(outer.width / logicalWidth, cap);
  const contentHeight = logicalHeight ?? inner.height;
  const offsetX = ready ? Math.max(0, (outer.width - logicalWidth * scale) / 2) : 0;
  const offsetY = contain && ready ? Math.max(0, (outer.height - logicalHeight * scale) / 2) : 0;
  const transform = !ready
    ? undefined
    : contain
      ? `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
      : `translateX(${offsetX}px) scale(${scale})`;

  return (
    <div
      ref={outerRef}
      className={contain ? `${styles.frame} ${styles.contain}` : styles.frame}
      style={contain ? undefined : { height: ready ? contentHeight * scale : 0 }}
    >
      <div
        ref={innerRef}
        className={styles.inner}
        style={{
          width: logicalWidth,
          height: contain ? logicalHeight : undefined,
          visibility: ready ? 'visible' : 'hidden',
          transform,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
