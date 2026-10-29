import { LOOMA_SCHEMA_VERSION } from '@lor-looma/core';
import type { CSSProperties, ReactNode } from 'react';
import styles from './LoomaRoot.module.css';

export interface LoomaRootProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function LoomaRoot({ children, className, style }: LoomaRootProps) {
  return (
    <div
      data-looma-root=""
      data-looma-schema={LOOMA_SCHEMA_VERSION}
      className={className ? `${styles.root} ${className}` : styles.root}
      style={style}
    >
      {children}
    </div>
  );
}
