import { createLoomaStore, parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderNode } from '../card/LoomaCardView';
import { LoomaViewer } from './LoomaViewer';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly elements: Element[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.elements.push(element);
  }

  unobserve(): void {}

  disconnect(): void {}

  static flush(width: number): void {
    for (const observer of MockResizeObserver.instances) {
      const entries = observer.elements.map(
        (target) =>
          ({
            target,
            contentRect: {
              width,
              height: 20,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              right: width,
              bottom: 20,
            },
          }) as ResizeObserverEntry,
      );
      observer.callback(entries, observer as unknown as ResizeObserver);
    }
  }
}

function document(format: 'presentation' | 'document', cards: unknown[]): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_view',
    title: 'Viewer',
    format,
    cards,
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function slide(text: string, id = 'c_x') {
  return {
    id,
    body: [{ id: `b_${id}`, type: 'paragraph', text }],
  };
}

describe('LoomaViewer scroll mode', () => {
  afterEach(() => {
    MockResizeObserver.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('scales a presentation to half at 640px and caps a document at 1', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const presentation = render(
      <LoomaViewer document={document('presentation', [slide('Light')])} />,
    );
    act(() => {
      MockResizeObserver.flush(640);
    });
    const presentationInner = presentation.container.querySelector('section')?.parentElement;
    expect(presentationInner?.style.transform).toMatch(/scale\(0\.5\)/);
    expect(presentationInner?.parentElement?.style.height).toBe('360px');
    presentation.unmount();

    const reading = render(
      <LoomaViewer document={document('document', [slide('A field note', 'c_doc')])} />,
    );
    act(() => {
      MockResizeObserver.flush(2000);
    });
    const documentInner = reading.container.querySelector('section')?.parentElement;
    expect(documentInner?.style.transform).toMatch(/scale\(1\)/);
    expect(documentInner?.style.width).toBe('816px');
  });

  it('reports overflow after the debounce and clears it when the card fits again', () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const onOverflow = vi.fn();
    const view = render(
      <LoomaViewer
        document={document('presentation', [slide('Too much')])}
        onOverflow={onOverflow}
      />,
    );
    const content = view.container.querySelector('[data-lm-card-content]');
    if (!(content instanceof HTMLElement)) throw new Error('missing card content');
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400 });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(onOverflow).toHaveBeenCalledWith(['c_x']);
    expect(view.container.querySelector('[data-lm-overflow]')).not.toBeNull();
    expect(screen.getByText('Overflow')).toHaveAttribute(
      'title',
      'Content does not fit on this slide',
    );

    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 200 });
    act(() => {
      MockResizeObserver.flush(640);
      vi.advanceTimersByTime(100);
    });
    expect(onOverflow).toHaveBeenCalledTimes(2);
    expect(onOverflow).toHaveBeenLastCalledWith([]);
    expect(view.container.querySelector('[data-lm-overflow]')).toBeNull();
    expect(screen.queryByText('Overflow')).toBeNull();
  });

  it('re-renders only the card a store update touches', () => {
    const doc = document('presentation', [slide('Alpha', 'c_a'), slide('Beta', 'c_b')]);
    const store = createLoomaStore(doc);
    const counts: Record<string, number> = {};
    const renderNode: RenderNode = (node, renderDefault, info) => {
      if (info.depth === 0) counts[info.parentId] = (counts[info.parentId] ?? 0) + 1;
      return renderDefault();
    };
    render(<LoomaViewer store={store} renderNode={renderNode} />);
    expect(counts).toEqual({ c_a: 1, c_b: 1 });

    act(() => {
      store.apply([{ op: 'updateNode', id: 'b_c_a', patch: { text: 'Alpha revised' } }]);
    });
    expect(screen.getByText('Alpha revised')).toBeInTheDocument();
    expect(counts).toEqual({ c_a: 2, c_b: 1 });
  });

  it('shows an empty state', () => {
    render(<LoomaViewer document={document('presentation', [])} />);
    expect(screen.getByText('This document has no cards yet.')).toBeInTheDocument();
  });

  it('renders on the server', () => {
    const doc = document('presentation', [slide('Server')]);
    expect(() => renderToString(<LoomaViewer document={doc} />)).not.toThrow();
  });
});
