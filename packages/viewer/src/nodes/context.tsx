import type { LoomaAsset, LoomaDocument, LoomaNode } from '@lor-looma/core';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface RenderNodeInfo {
  depth: number;
  parentId: string;
  slot: number | null;
  index: number;
}

export type RenderNode = (
  node: LoomaNode,
  renderDefault: () => ReactNode,
  info: RenderNodeInfo,
) => ReactNode;

export interface NodeRenderContextValue {
  format: 'presentation' | 'document';
  assets: LoomaDocument['assets'];
  resolveAsset?: (asset: LoomaAsset, id: string) => string;
  renderNode?: RenderNode;
}

const NodeRenderContext = createContext<NodeRenderContextValue | null>(null);

export function NodeRenderProvider({
  value,
  children,
}: {
  value: NodeRenderContextValue;
  children: ReactNode;
}) {
  return <NodeRenderContext.Provider value={value}>{children}</NodeRenderContext.Provider>;
}

export function useNodeRenderContext(): NodeRenderContextValue {
  const value = useContext(NodeRenderContext);
  if (!value) throw new Error('Looma blocks must render inside a node context');
  return value;
}
