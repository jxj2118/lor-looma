import { parseDocument } from '@lor-looma/core';
import type { LoomaCard, LoomaDocument } from '@lor-looma/core';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaCardView } from './LoomaCardView';
import type { RenderNode, RenderNodeInfo } from './LoomaCardView';

const leaf = {
  kind: 'image' as const,
  src: 'https://example.com/leaf.png',
  alt: 'A green leaf',
};

function document(cards: unknown[], extras?: Partial<LoomaDocument>): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_card',
    title: 'Photosynthesis',
    format: 'presentation',
    assets: { img_leaf: leaf },
    cards,
    ...extras,
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

const textCard = [
  {
    id: 'c_text',
    body: [
      { id: 'b_hello', type: 'paragraph', text: 'Hello leaf' },
      { id: 'b_next', type: 'paragraph', text: 'Second' },
    ],
  },
];

describe('LoomaCardView', () => {
  it('marks the card and each node', () => {
    const doc = document(textCard);
    const { container } = render(<LoomaCardView card={doc.cards[0]!} document={doc} />);
    const card = container.querySelector('section');
    expect(card).toHaveAttribute('data-lm-card-id', 'c_text');
    expect(card).toHaveAttribute('data-lm-format', 'presentation');
    expect(card?.querySelector('[data-lm-card-content]')).not.toBeNull();
    const node = container.querySelector('[data-lm-node-id="b_hello"]');
    expect(node).toHaveAttribute('data-lm-node-type', 'paragraph');
    expect(node?.textContent).toContain('Hello leaf');
  });

  it('wraps or replaces nodes and reports depth, parent, slot, and index', () => {
    const doc = document([
      {
        id: 'c_tree',
        body: [
          { id: 'b_intro', type: 'paragraph', text: 'Intro' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'paragraph', text: 'Right' }],
            ],
          },
        ],
      },
    ]);
    const seen: { id: string; info: RenderNodeInfo }[] = [];
    const renderNode: RenderNode = (node, renderDefault, info) => {
      seen.push({ id: node.id, info });
      if (node.id === 'b_intro') return <div data-wrapped="">{renderDefault()}</div>;
      if (node.id === 'b_right') return <div data-replaced="">Replaced</div>;
      return renderDefault();
    };
    const { container } = render(
      <LoomaCardView card={doc.cards[0]!} document={doc} renderNode={renderNode} />,
    );
    expect(container.querySelector('[data-wrapped] [data-lm-node-id="b_intro"]')).not.toBeNull();
    expect(container.querySelector('[data-lm-node-id="b_right"]')).toBeNull();
    expect(container.querySelector('[data-replaced]')?.textContent).toBe('Replaced');
    expect(seen.find((entry) => entry.id === 'b_intro')?.info).toEqual({
      depth: 0,
      parentId: 'c_tree',
      slot: null,
      index: 0,
    });
    expect(seen.find((entry) => entry.id === 'n_cols')?.info).toEqual({
      depth: 0,
      parentId: 'c_tree',
      slot: null,
      index: 1,
    });
    expect(seen.find((entry) => entry.id === 'b_right')?.info).toEqual({
      depth: 1,
      parentId: 'n_cols',
      slot: 1,
      index: 0,
    });
    expect(seen.find((entry) => entry.id === 'b_left')?.info).toEqual({
      depth: 1,
      parentId: 'n_cols',
      slot: 0,
      index: 0,
    });
  });

  it('isolates a block that throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = document(textCard);
    const renderNode: RenderNode = (node, renderDefault) => {
      if (node.id === 'b_hello') throw new Error('boom');
      return renderDefault();
    };
    render(<LoomaCardView card={doc.cards[0]!} document={doc} renderNode={renderNode} />);
    expect(screen.getByText('This block could not be displayed')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('places accent art on the left, right, top, and as a background', () => {
    const card = (position: 'left' | 'right' | 'top' | 'background'): LoomaCard =>
      document([
        {
          id: 'c_accent',
          accent: { position, assetId: 'img_leaf' },
          body: [{ id: 'b_body', type: 'paragraph', text: 'Body copy' }],
        },
      ]).cards[0]!;

    const left = render(<LoomaCardView card={card('left')} document={document([])} />);
    expect(left.container.querySelector('section')).toHaveAttribute('data-lm-accent', 'left');
    expect(left.container.querySelector('section')?.style.gridTemplateColumns).toBe(
      '40% minmax(0, 1fr)',
    );
    const leftMedia = left.container.querySelector('[data-lm-accent-media="left"]');
    expect(leftMedia?.querySelector('img')).toHaveAttribute('src', 'https://example.com/leaf.png');
    expect(left.container.querySelector('[data-lm-card-content]')).not.toBeNull();
    left.unmount();

    const right = render(<LoomaCardView card={card('right')} document={document([])} />);
    expect(right.container.querySelector('section')?.style.gridTemplateColumns).toBe(
      'minmax(0, 1fr) 40%',
    );
    expect(right.container.querySelector('[data-lm-accent-media="right"] img')).not.toBeNull();
    right.unmount();

    const top = render(<LoomaCardView card={card('top')} document={document([])} />);
    expect(
      (top.container.querySelector('[data-lm-accent-media="top"]') as HTMLElement).style.height,
    ).toBe('36%');
    top.unmount();

    const docFormat = document([], { format: 'document' });
    const topDoc = render(<LoomaCardView card={card('top')} document={docFormat} />);
    expect(
      (topDoc.container.querySelector('[data-lm-accent-media="top"]') as HTMLElement).style.height,
    ).toBe('240px');
    topDoc.unmount();

    const background = render(<LoomaCardView card={card('background')} document={document([])} />);
    const section = background.container.querySelector('section');
    expect(section?.style.backgroundImage).toContain('https://example.com/leaf.png');
    expect(background.container.querySelector('[data-lm-bg-overlay]')).not.toBeNull();
    expect(background.container.querySelector('[data-lm-accent-media]')).toBeNull();
    background.unmount();

    const missingCard = document([
      {
        id: 'c_miss',
        accent: { position: 'left', assetId: 'img_leaf' },
        body: [{ id: 'b_body', type: 'paragraph', text: 'Full width' }],
      },
    ]).cards[0]!;
    const missing = document([], { assets: {} });
    const gone = render(<LoomaCardView card={missingCard} document={missing} />);
    expect(gone.container.querySelector('[data-lm-accent-media]')).toBeNull();
    expect(gone.container.querySelector('[data-lm-card-content]')?.textContent).toContain(
      'Full width',
    );
  });

  it('anchors accent images and background accents to a focal point', () => {
    const doc = document([
      {
        id: 'c_focal',
        accent: { position: 'left', assetId: 'img_leaf', focalPoint: { x: 15, y: 70 } },
        body: [{ id: 'b_body', type: 'paragraph', text: 'Body' }],
      },
    ]);
    const side = render(<LoomaCardView card={doc.cards[0]!} document={doc} />);
    expect(side.container.querySelector('[data-lm-accent-media="left"] img')).toHaveStyle({
      objectPosition: '15% 70%',
    });
    side.unmount();

    const backgroundDoc = document([
      {
        id: 'c_focal',
        accent: { position: 'background', assetId: 'img_leaf', focalPoint: { x: 80, y: 10 } },
        body: [{ id: 'b_body', type: 'paragraph', text: 'Body' }],
      },
    ]);
    const background = render(
      <LoomaCardView card={backgroundDoc.cards[0]!} document={backgroundDoc} />,
    );
    expect(background.container.querySelector('section')?.style.backgroundPosition).toBe('80% 10%');
  });

  it('paints color, gradient, and image backgrounds', () => {
    const colorDoc = document([
      {
        id: 'c_bg',
        background: { kind: 'color', value: '#e7f5ea' },
        body: [{ id: 'b_1', type: 'paragraph', text: 'Color' }],
      },
    ]);
    const color = render(<LoomaCardView card={colorDoc.cards[0]!} document={colorDoc} />);
    expect(color.container.querySelector('section')?.style.backgroundColor).toBe(
      'rgb(231, 245, 234)',
    );
    color.unmount();

    const gradientDoc = document([
      {
        id: 'c_bg',
        background: { kind: 'gradient', from: '#e7f5ea', to: '#fff6d8', angle: 135 },
        body: [{ id: 'b_1', type: 'paragraph', text: 'Gradient' }],
      },
    ]);
    const gradient = render(<LoomaCardView card={gradientDoc.cards[0]!} document={gradientDoc} />);
    expect(gradient.container.querySelector('section')?.style.backgroundImage).toBe(
      'linear-gradient(135deg, rgb(231, 245, 234), rgb(255, 246, 216))',
    );
    gradient.unmount();

    const imageDoc = document([
      {
        id: 'c_bg',
        background: { kind: 'image', assetId: 'img_leaf' },
        body: [{ id: 'b_1', type: 'paragraph', text: 'Image' }],
      },
    ]);
    const image = render(<LoomaCardView card={imageDoc.cards[0]!} document={imageDoc} />);
    expect(image.container.querySelector('section')?.style.backgroundImage).toContain(
      'https://example.com/leaf.png',
    );
    expect(image.container.querySelector('[data-lm-bg-overlay]')).not.toBeNull();
  });

  it('skips a re-render when the card, format, and assets stay the same', () => {
    const doc = document(textCard);
    const card = doc.cards[0]!;
    let renders = 0;
    const renderNode: RenderNode = (_node, renderDefault) => {
      renders += 1;
      return renderDefault();
    };
    function Host({
      document: current,
      node,
    }: {
      document: LoomaDocument;
      node?: RenderNode;
    }): ReactNode {
      return <LoomaCardView card={card} document={current} renderNode={node ?? renderNode} />;
    }
    const view = render(<Host document={doc} />);
    expect(renders).toBe(2);
    view.rerender(<Host document={{ ...doc, title: 'Renamed' }} />);
    expect(renders).toBe(2);
    view.rerender(<Host document={{ ...doc, assets: { ...doc.assets } }} />);
    expect(renders).toBe(4);
  });
});
