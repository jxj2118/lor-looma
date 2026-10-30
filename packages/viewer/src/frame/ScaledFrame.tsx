import type { ReactNode } from 'react';
import { useElementSize } from '../hooks/useElementSize';
import styles from './ScaledFrame.module.css';

export function ScaledFrame({
  logicalWidth,
  logicalHeight,
  maxScale,
  children,
}: {
  logicalWidth: number;
  logicalHeight?: number;
  maxScale?: number;
  children: ReactNode;
}) {
  const [outerRef, outer] = useElementSize<HTMLDivElement>();
  const [innerRef, inner] = useElementSize<HTMLDivElement>();
  const ready = outer.width > 0;
  const cap = maxScale ?? Number.POSITIVE_INFINITY;
  const scale = ready ? Math.min(outer.width / logicalWidth, cap) : 1;
  const contentHeight = logicalHeight ?? inner.height;
  const offset = ready ? Math.max(0, (outer.width - logicalWidth * scale) / 2) : 0;

  return (
    <div
      ref={outerRef}
      className={styles.frame}
      style={{ height: ready ? contentHeight * scale : 0 }}
    >
      <div
        ref={innerRef}
        className={styles.inner}
        style={{
          width: logicalWidth,
          visibility: ready ? 'visible' : 'hidden',
          transform: ready ? `translateX(${offset}px) scale(${scale})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
