import type { LoomaAsset, LoomaDocument } from '@lor-looma/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NodeRenderProvider } from '../nodes/context';
import { Callout } from './Callout';
import { Code } from './Code';
import { Divider } from './Divider';
import { Heading } from './Heading';
import { Image } from './Image';
import { List } from './List';
import { MathBlock } from './Math';
import { Paragraph } from './Paragraph';
import { Quote } from './Quote';
import { Stat } from './Stat';
import { Table } from './Table';
import { Unsupported } from './Unsupported';

const leaf: LoomaAsset = {
  kind: 'image',
  src: 'https://example.com/leaf.png',
  alt: 'A green leaf',
};

function withAssets(
  node: ReactNode,
  extras?: {
    resolveAsset?: (asset: LoomaAsset, id: string) => string;
    assets?: LoomaDocument['assets'];
  },
) {
  return render(
    <NodeRenderProvider
      value={{
        format: 'presentation',
        assets: extras?.assets ?? { img_leaf: leaf },
        resolveAsset: extras?.resolveAsset,
      }}
    >
      {node}
    </NodeRenderProvider>,
  );
}

describe('blocks', () => {
  it('renders heading levels with inline formatting', () => {
    const { container } = render(
      <Heading block={{ id: 'b_h', type: 'heading', level: 2, text: 'The **short** version' }} />,
    );
    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading?.className).toContain('block');
    expect(heading?.querySelector('strong')?.textContent).toBe('short');
  });

  it('renders an h1 and an h3', () => {
    const { container, rerender } = render(
      <Heading block={{ id: 'b_1', type: 'heading', level: 1, text: 'Title' }} />,
    );
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    rerender(<Heading block={{ id: 'b_3', type: 'heading', level: 3, text: 'Where' }} />);
    expect(container.querySelector('h3')?.textContent).toBe('Where');
  });

  it('aligns a paragraph and renders inline text', () => {
    const { container } = render(
      <Paragraph
        block={{
          id: 'b_p',
          type: 'paragraph',
          align: 'center',
          text: 'Why {color:green}green{/color}?',
        }}
      />,
    );
    const p = container.querySelector('p');
    expect(p).toHaveAttribute('data-align', 'center');
    expect(p?.querySelector('.color')?.textContent).toBe('green');
  });

  it('renders bullet, number, and check lists, including nested items', () => {
    const { container, rerender } = render(
      <List
        block={{
          id: 'b_list',
          type: 'list',
          style: 'bullet',
          items: ['Green light is reflected', { text: 'Other colors', children: ['Blue', 'Red'] }],
        }}
      />,
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector('ul')?.textContent).toContain('Blue');

    rerender(
      <List
        block={{
          id: 'b_list',
          type: 'list',
          style: 'number',
          items: ['Capture light', { text: 'Split water', children: ['Release oxygen'] }],
        }}
      />,
    );
    expect(container.querySelector('ol ol')?.textContent).toContain('Release oxygen');

    rerender(
      <List
        block={{
          id: 'b_list',
          type: 'list',
          style: 'check',
          items: [
            { text: 'Thylakoids', checked: true },
            { text: 'Stroma', checked: false },
          ],
        }}
      />,
    );
    const check = container.querySelector('ul');
    expect(check).toHaveAttribute('data-style', 'check');
    const items = check?.querySelectorAll(':scope > li') ?? [];
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
    expect(items[0]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('☑');
    expect(items[1]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('☐');
  });

  it('resolves an image and falls back when the asset is missing or the load fails', () => {
    const resolved = withAssets(
      <Image
        block={{
          id: 'b_img',
          type: 'image',
          assetId: 'img_leaf',
          fit: 'cover',
          width: 'full',
          caption: 'See a [diagram](https://example.com/leaf).',
        }}
      />,
      { resolveAsset: (_asset, id) => `resolved://${id}` },
    );
    const img = resolved.container.querySelector('img');
    expect(img).toHaveAttribute('src', 'resolved://img_leaf');
    expect(img).toHaveAttribute('alt', 'A green leaf');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('data-fit', 'cover');
    expect(img).toHaveAttribute('data-width', 'full');
    expect(resolved.container.querySelector('figcaption a')).toHaveAttribute(
      'href',
      'https://example.com/leaf',
    );

    resolved.rerender(
      <NodeRenderProvider value={{ format: 'presentation', assets: { img_leaf: leaf } }}>
        <Image block={{ id: 'b_img', type: 'image', assetId: 'img_leaf', caption: 'Leaf' }} />
      </NodeRenderProvider>,
    );
    const loaded = resolved.container.querySelector('img');
    expect(loaded).toHaveAttribute('src', 'https://example.com/leaf.png');
    if (loaded) fireEvent.error(loaded);
    expect(resolved.container.querySelector('[data-lm-image-missing]')).not.toBeNull();
    expect(resolved.container.querySelector('img')).toBeNull();
    expect(screen.getByText('A green leaf')).toBeInTheDocument();

    resolved.rerender(
      <NodeRenderProvider value={{ format: 'document', assets: {} }}>
        <Image block={{ id: 'b_gone', type: 'image', assetId: 'img_missing' }} />
      </NodeRenderProvider>,
    );
    expect(resolved.container.querySelector('[data-lm-image-missing]')).not.toBeNull();
    expect(resolved.container.querySelector('img')).toBeNull();
  });

  it('crops to a focal point and opens a lightbox that does not bubble the click', () => {
    const onParent = vi.fn();
    const view = render(
      <div onClick={onParent}>
        <NodeRenderProvider value={{ format: 'presentation', assets: { img_leaf: leaf } }}>
          <Image
            block={{
              id: 'b_img',
              type: 'image',
              assetId: 'img_leaf',
              focalPoint: { x: 20, y: 80 },
              caption: 'A leaf',
            }}
          />
        </NodeRenderProvider>
      </div>,
    );
    const img = view.container.querySelector('img');
    expect(img).toHaveAttribute('data-focal', '20,80');
    expect(img).toHaveStyle({ objectPosition: '20% 80%' });
    expect(img).toHaveAttribute('data-lm-zoom', '');
    if (!(img instanceof HTMLElement)) throw new Error('missing image');

    fireEvent.click(img);
    expect(onParent).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'A green leaf' });
    expect(dialog).toHaveAttribute('data-lm-lightbox', '');
    expect(dialog.querySelector('figcaption')?.textContent).toBe('A leaf');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(img);
    fireEvent.click(screen.getByRole('dialog', { name: 'A green leaf' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(img);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    view.unmount();

    const editorClicks = vi.fn();
    const editor = render(
      <div onClick={editorClicks}>
        <NodeRenderProvider
          value={{
            format: 'presentation',
            assets: { img_leaf: leaf },
            renderNode: () => null,
          }}
        >
          <Image block={{ id: 'b_img', type: 'image', assetId: 'img_leaf' }} />
        </NodeRenderProvider>
      </div>,
    );
    const editorImg = editor.container.querySelector('img');
    expect(editorImg).not.toHaveAttribute('data-lm-zoom');
    if (editorImg) fireEvent.click(editorImg);
    expect(editorClicks).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a table with and without a header row', () => {
    const { container, rerender } = render(
      <Table
        block={{
          id: 'b_table',
          type: 'table',
          header: true,
          rows: [
            ['Stage', 'Output'],
            ['Light reactions', '**ATP**'],
          ],
        }}
      />,
    );
    expect(container.querySelector('thead th')).toHaveAttribute('scope', 'col');
    expect(container.querySelector('tbody td strong')?.textContent).toBe('ATP');
    expect(container.querySelector('div')).toContainElement(container.querySelector('table'));

    rerender(
      <Table
        block={{
          id: 'b_table',
          type: 'table',
          header: false,
          rows: [['Only body', 'Cells']],
        }}
      />,
    );
    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
  });

  it('splits callout and quote text into paragraphs', () => {
    const { container, rerender } = render(
      <Callout
        block={{
          id: 'b_call',
          type: 'callout',
          tone: 'info',
          text: 'Chlorophyll lives in **chloroplasts**.\n\nMostly in the mesophyll.',
        }}
      />,
    );
    const note = container.querySelector('[role="note"]');
    expect(note).toHaveAttribute('data-tone', 'info');
    expect(note?.querySelectorAll('p')).toHaveLength(2);
    expect(note?.querySelector('strong')?.textContent).toBe('chloroplasts');

    rerender(
      <Quote
        block={{
          id: 'b_quote',
          type: 'quote',
          text: 'A leaf is a quiet factory.\n\nIt runs on light.',
          cite: 'Classroom notes',
        }}
      />,
    );
    const quote = container.querySelector('blockquote');
    expect(quote?.querySelectorAll('p')).toHaveLength(2);
    expect(quote?.querySelector('footer')?.textContent).toContain('—');
    expect(quote?.querySelector('cite')?.textContent).toBe('Classroom notes');
  });

  it('renders a divider and a plain code block with a copy button', () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const code = '6 CO2 + 6 H2O + light -> C6H12O6 + 6 O2';
    const { container, rerender } = render(<Divider block={{ id: 'b_rule', type: 'divider' }} />);
    expect(container.querySelector('hr')).not.toBeNull();
    rerender(
      <Code
        block={{
          id: 'b_code',
          type: 'code',
          language: 'text',
          code,
        }}
      />,
    );
    const pre = container.querySelector('pre');
    expect(pre).toHaveAttribute('data-language', 'text');
    expect(pre?.querySelector('code')?.textContent).toBe(code);
    expect(pre?.querySelectorAll('code [data-lm-token="plain"]')).toHaveLength(1);
    expect(screen.getByText('text')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Copy code' });
    expect(button).toHaveTextContent('Copy');
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith(code);
    expect(button).toHaveTextContent('Copied');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(button).toHaveTextContent('Copy');
    vi.useRealTimers();

    rerender(
      <Code
        block={{
          id: 'b_ts',
          type: 'code',
          language: 'ts',
          code: 'const n = 1',
        }}
      />,
    );
    expect(container.querySelector('[data-lm-token="keyword"]')?.textContent).toBe('const');
    expect(container.querySelector('[data-lm-token="number"]')?.textContent).toBe('1');
  });

  it('renders a stat metric and keeps an empty detail slot editable', () => {
    const plain = render(
      <Stat block={{ id: 'b_stat', type: 'stat', value: '**98%**', label: 'Completion' }} />,
    );
    expect(plain.container.querySelector('[data-tone="primary"]')).not.toBeNull();
    expect(plain.container.querySelector('[data-lm-slot="stat:value"] strong')?.textContent).toBe(
      '98%',
    );
    expect(plain.container.querySelector('[data-lm-slot="stat:label"]')?.textContent).toBe(
      'Completion',
    );
    expect(plain.container.querySelector('[data-lm-slot="stat:detail"]')).toBeNull();

    const detailed = render(
      <Stat
        block={{
          id: 'b_stat',
          type: 'stat',
          value: '12',
          label: 'Labs',
          detail: '+2 this week',
          tone: 'success',
        }}
      />,
    );
    expect(detailed.container.querySelector('[data-tone="success"]')).not.toBeNull();
    expect(detailed.container.querySelector('[data-lm-slot="stat:detail"]')?.textContent).toBe(
      '+2 this week',
    );

    const slotted = render(
      <NodeRenderProvider
        value={{
          format: 'presentation',
          assets: {},
          renderSlot: (_id, slot, renderDefault) => renderDefault(),
        }}
      >
        <Stat block={{ id: 'b_stat', type: 'stat', value: '1', label: 'One' }} />
      </NodeRenderProvider>,
    );
    expect(slotted.container.querySelector('[data-lm-slot="stat:detail"]')).not.toBeNull();
  });

  it('renders a math formula through the code slot and an optional caption', () => {
    const { container } = render(
      <MathBlock
        block={{ id: 'b_math', type: 'math', tex: 'E = mc^2', caption: 'Energy **eq**' }}
      />,
    );
    const display = container.querySelector('[data-lm-math=""]');
    expect(display).toHaveAttribute('data-lm-slot', 'code');
    expect(display?.querySelector('[data-lm-math="sup"]')?.textContent).toContain('2');
    expect(container.querySelector('figcaption strong')?.textContent).toBe('eq');

    const seen: string[] = [];
    const editing = render(
      <NodeRenderProvider
        value={{
          format: 'document',
          assets: {},
          renderSlot: (nodeId, slot) => {
            seen.push(`${nodeId}:${slot}`);
            return <textarea data-editor="" defaultValue="E = mc^2" />;
          },
        }}
      >
        <MathBlock block={{ id: 'b_math', type: 'math', tex: 'E = mc^2' }} />
      </NodeRenderProvider>,
    );
    expect(seen).toEqual(['b_math:code']);
    expect(editing.container.querySelector('[data-editor]')).not.toBeNull();
    expect(editing.container.querySelector('[data-lm-math=""]')).toBeNull();
  });

  it('shows the original type of an unknown block', () => {
    const { container, rerender } = render(
      <Unsupported block={{ id: 'b_u', type: 'unknown', raw: { type: 'widget' } }} />,
    );
    expect(screen.getByText('Unsupported block')).toBeInTheDocument();
    expect(screen.getByText('widget')).toBeInTheDocument();
    rerender(<Unsupported block={{ id: 'b_u', type: 'unknown', raw: { foo: 1 } }} />);
    expect(container.textContent).toContain('unknown');
  });
});
