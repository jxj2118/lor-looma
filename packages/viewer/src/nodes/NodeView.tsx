import type { LoomaNode } from '@lor-looma/core';
import { memo } from 'react';
import type { ReactNode } from 'react';
import { Callout } from '../blocks/Callout';
import { Code } from '../blocks/Code';
import { Divider } from '../blocks/Divider';
import { Heading } from '../blocks/Heading';
import { Image } from '../blocks/Image';
import { List } from '../blocks/List';
import { Paragraph } from '../blocks/Paragraph';
import { Quote } from '../blocks/Quote';
import { Table } from '../blocks/Table';
import { Unsupported } from '../blocks/Unsupported';
import { Columns } from '../containers/Columns';
import { Grid } from '../containers/Grid';
import { Stack } from '../containers/Stack';
import type { RenderNodeInfo } from './context';
import { useNodeRenderContext } from './context';
import { NodeErrorBoundary } from './NodeErrorBoundary';
import styles from './node.module.css';

export interface NodeViewProps {
  node: LoomaNode;
  info: RenderNodeInfo;
}

function renderRegistered(node: LoomaNode, info: RenderNodeInfo): ReactNode {
  switch (node.type) {
    case 'heading':
      return <Heading block={node} />;
    case 'paragraph':
      return <Paragraph block={node} />;
    case 'list':
      return <List block={node} />;
    case 'image':
      return <Image block={node} />;
    case 'table':
      return <Table block={node} />;
    case 'callout':
      return <Callout block={node} />;
    case 'quote':
      return <Quote block={node} />;
    case 'divider':
      return <Divider block={node} />;
    case 'code':
      return <Code block={node} />;
    case 'stat':
    case 'math':
    case 'steps':
      return null;
    case 'unknown':
      return <Unsupported block={node} />;
    case 'stack':
      return <Stack block={node} info={info} />;
    case 'columns':
      return <Columns block={node} info={info} />;
    case 'grid':
      return <Grid block={node} info={info} />;
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

function NodeBody({ node, info }: NodeViewProps) {
  const { renderNode } = useNodeRenderContext();
  const renderDefault = () => (
    <div data-lm-node-id={node.id} data-lm-node-type={node.type} className={styles.node}>
      {renderRegistered(node, info)}
    </div>
  );
  if (renderNode) return <>{renderNode(node, renderDefault, info)}</>;
  return renderDefault();
}

function sameNode(prev: NodeViewProps, next: NodeViewProps): boolean {
  return (
    prev.node === next.node &&
    prev.info.depth === next.info.depth &&
    prev.info.parentId === next.info.parentId &&
    prev.info.slot === next.info.slot &&
    prev.info.index === next.info.index
  );
}

export const NodeView = memo(function NodeView({ node, info }: NodeViewProps) {
  return (
    <NodeErrorBoundary>
      <NodeBody node={node} info={info} />
    </NodeErrorBoundary>
  );
}, sameNode);
