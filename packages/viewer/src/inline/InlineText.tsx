import { isSafeHref, parseInline } from '@lor-looma/core';
import type { InlineNode } from '@lor-looma/core';
import { Fragment, memo, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { highlightColorValue, inlineColorValue } from './colors';
import styles from './InlineText.module.css';

export interface InlineTextProps {
  text: string;
  as?: 'span' | 'div' | 'p';
  className?: string;
}

function renderInline(node: InlineNode, key: string): ReactNode {
  switch (node.type) {
    case 'text':
      return <Fragment key={key}>{node.value}</Fragment>;
    case 'break':
      return <br key={key} />;
    case 'code':
      return (
        <code key={key} className={styles.code}>
          {node.value}
        </code>
      );
    case 'bold':
      return <strong key={key}>{renderChildren(node.children, key)}</strong>;
    case 'italic':
      return <em key={key}>{renderChildren(node.children, key)}</em>;
    case 'strike':
      return <s key={key}>{renderChildren(node.children, key)}</s>;
    case 'link':
      if (isSafeHref(node.href)) {
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderChildren(node.children, key)}
          </a>
        );
      }
      return (
        <span key={key} data-lm-unsafe-link="">
          {renderChildren(node.children, key)}
        </span>
      );
    case 'color':
      return (
        <span
          key={key}
          className={styles.color}
          style={{ '--lm-inline-color': inlineColorValue(node.color) } as CSSProperties}
        >
          {renderChildren(node.children, key)}
        </span>
      );
    case 'highlight':
      return (
        <mark
          key={key}
          className={styles.highlight}
          style={{ '--lm-inline-highlight': highlightColorValue(node.color) } as CSSProperties}
        >
          {renderChildren(node.children, key)}
        </mark>
      );
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

function renderChildren(nodes: readonly InlineNode[], key: string): ReactNode {
  return nodes.map((node, index) => renderInline(node, `${key}.${index}`));
}

export const InlineText = memo(function InlineText({
  text,
  as = 'span',
  className,
}: InlineTextProps) {
  const nodes = useMemo(() => parseInline(text), [text]);
  const Tag = as;
  const classes = className ? `${styles.root} ${className}` : styles.root;
  return <Tag className={classes}>{renderChildren(nodes, 'n')}</Tag>;
});
