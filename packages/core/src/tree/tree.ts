import type { LoomaCard, LoomaContainer, LoomaDocument, LoomaNode } from '../schema';

export interface FoundNode {
  node: LoomaNode;
  cardId: string;
  cardIndex: number;
  /** Id of the card or container whose child list holds the node. */
  parentId: string;
  /** Column index when the parent is a `columns` container, otherwise null. */
  slot: number | null;
  index: number;
  /** 0 for nodes directly in a card body. */
  depth: number;
  /** e.g. `cards[0].body[1].children[0][2]` (same format as ParseIssue.path). */
  path: string;
}

export interface FoundCard {
  card: LoomaCard;
  index: number;
  path: string;
}

export function isContainer(node: LoomaNode): node is LoomaContainer {
  return (
    node.type === 'stack' ||
    node.type === 'columns' ||
    node.type === 'grid' ||
    node.type === 'steps'
  );
}

function isCard(parent: LoomaCard | LoomaContainer): parent is LoomaCard {
  return 'body' in parent;
}

/** The child list that holds nodes for a card or container (columns need a slot). */
export function childArrayOf(
  parent: LoomaCard | LoomaContainer,
  slot: number | null,
): LoomaNode[] | null {
  if (isCard(parent)) return slot === null ? parent.body : null;
  if (parent.type === 'columns') {
    if (slot === null) return null;
    return parent.children[slot] ?? null;
  }
  if (slot !== null) return null;
  return parent.children;
}

interface WalkFrame {
  nodes: readonly LoomaNode[];
  cardId: string;
  cardIndex: number;
  parentId: string;
  slot: number | null;
  depth: number;
  pathPrefix: string;
}

function walkList(frame: WalkFrame, visit: (found: FoundNode) => void | false): boolean {
  for (let index = 0; index < frame.nodes.length; index += 1) {
    const node = frame.nodes[index];
    if (node === undefined) continue;
    const path = `${frame.pathPrefix}[${index}]`;
    const found: FoundNode = {
      node,
      cardId: frame.cardId,
      cardIndex: frame.cardIndex,
      parentId: frame.parentId,
      slot: frame.slot,
      index,
      depth: frame.depth,
      path,
    };
    if (visit(found) === false) return true;
    if (!isContainer(node)) continue;
    if (node.type === 'columns') {
      for (let column = 0; column < node.children.length; column += 1) {
        const children = node.children[column];
        if (!children) continue;
        const stopped = walkList(
          {
            nodes: children,
            cardId: frame.cardId,
            cardIndex: frame.cardIndex,
            parentId: node.id,
            slot: column,
            depth: frame.depth + 1,
            pathPrefix: `${path}.children[${column}]`,
          },
          visit,
        );
        if (stopped) return true;
      }
      continue;
    }
    const stopped = walkList(
      {
        nodes: node.children,
        cardId: frame.cardId,
        cardIndex: frame.cardIndex,
        parentId: node.id,
        slot: null,
        depth: frame.depth + 1,
        pathPrefix: `${path}.children`,
      },
      visit,
    );
    if (stopped) return true;
  }
  return false;
}

/** Depth-first, document order. Returning false from `visit` stops the walk. */
export function walkNodes(doc: LoomaDocument, visit: (found: FoundNode) => void | false): void {
  for (let cardIndex = 0; cardIndex < doc.cards.length; cardIndex += 1) {
    const card = doc.cards[cardIndex];
    if (!card) continue;
    const stopped = walkList(
      {
        nodes: card.body,
        cardId: card.id,
        cardIndex,
        parentId: card.id,
        slot: null,
        depth: 0,
        pathPrefix: `cards[${cardIndex}].body`,
      },
      visit,
    );
    if (stopped) return;
  }
}

export function findNode(doc: LoomaDocument, id: string): FoundNode | null {
  let found: FoundNode | null = null;
  walkNodes(doc, (current) => {
    if (current.node.id !== id) return;
    found = current;
    return false;
  });
  return found;
}

export function findCard(doc: LoomaDocument, id: string): FoundCard | null {
  for (let index = 0; index < doc.cards.length; index += 1) {
    const card = doc.cards[index];
    if (card?.id === id) return { card, index, path: `cards[${index}]` };
  }
  return null;
}

/** All card and node ids, plus asset keys and the document id. Used to avoid id collisions. */
export function collectIds(doc: LoomaDocument): Set<string> {
  const ids = new Set<string>();
  ids.add(doc.id);
  for (const key of Object.keys(doc.assets)) ids.add(key);
  for (const card of doc.cards) ids.add(card.id);
  walkNodes(doc, (found) => {
    ids.add(found.node.id);
  });
  return ids;
}
