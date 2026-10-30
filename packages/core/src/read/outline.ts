import { inlineToPlainText } from '../inline';
import type { LoomaDocument } from '../schema';
import { walkNodes } from '../tree/tree';
import { nodePreview } from './preview';

const TITLE_LIMIT = 40;

export interface NodeOutline {
  id: string;
  type: string;
  depth: number;
  preview: string;
}

export interface CardOutline {
  id: string;
  index: number;
  title: string;
  nodes: NodeOutline[];
}

export interface DocumentOutline {
  id: string;
  title: string;
  format: 'presentation' | 'document';
  cardCount: number;
  cards: CardOutline[];
}

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cardTitle(doc: LoomaDocument, cardId: string): string {
  let heading: string | undefined;
  let paragraph: string | undefined;
  walkNodes(doc, (found) => {
    if (found.cardId !== cardId) return;
    if (heading === undefined && found.node.type === 'heading') {
      heading = collapsed(inlineToPlainText(found.node.text));
    }
    if (paragraph === undefined && found.node.type === 'paragraph') {
      paragraph = collapsed(inlineToPlainText(found.node.text));
    }
  });
  return (heading ?? paragraph ?? '').slice(0, TITLE_LIMIT);
}

export function getOutline(doc: LoomaDocument): DocumentOutline {
  const cards = doc.cards.map((card, index) => {
    const nodes: NodeOutline[] = [];
    walkNodes(doc, (found) => {
      if (found.cardId !== card.id) return;
      nodes.push({
        id: found.node.id,
        type: found.node.type,
        depth: found.depth,
        preview: nodePreview(found.node, doc),
      });
    });
    return { id: card.id, index, title: cardTitle(doc, card.id), nodes };
  });
  return {
    id: doc.id,
    title: doc.title,
    format: doc.format,
    cardCount: doc.cards.length,
    cards,
  };
}
