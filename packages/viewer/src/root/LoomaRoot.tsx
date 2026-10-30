import { LOOMA_SCHEMA_VERSION } from '@lor-looma/core';
import type { LoomaTheme } from '@lor-looma/core';
import type { CSSProperties, ReactNode } from 'react';
import { themeToCssVariables } from '../theme/themeToCssVariables';
import styles from './LoomaRoot.module.css';

export interface LoomaRootProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  theme?: LoomaTheme;
}

export function LoomaRoot({ children, className, style, theme }: LoomaRootProps) {
  const themeStyle = theme ? themeToCssVariables(theme) : undefined;
  return (
    <div
      data-looma-root=""
      data-looma-schema={LOOMA_SCHEMA_VERSION}
      data-looma-theme={theme?.preset}
      className={className ? `${styles.root} ${className}` : styles.root}
      style={themeStyle ? { ...themeStyle, ...style } : style}
    >
      {children}
    </div>
  );
}
