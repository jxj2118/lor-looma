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
  if (heading === undefined && paragraph === undefined) {
    const card = doc.cards.find((item) => item.id === cardId);
    if (card?.scene) {
      let bestText = '';
      let bestSize = -1;
      for (const element of card.scene.elements) {
        if (element.type !== 'text') continue;
        const text = collapsed(
          element.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '),
        );
        if (!text) continue;
        const maxSize = Math.max(
          0,
          ...element.paragraphs.flatMap((p) => p.runs.map((r) => r.fontSize ?? 16)),
        );
        if (maxSize > bestSize) {
          bestSize = maxSize;
          bestText = text;
        }
      }
      if (bestText) return bestText.slice(0, TITLE_LIMIT);
    }
  }
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
