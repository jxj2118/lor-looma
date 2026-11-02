import { parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoomaViewer } from './LoomaViewer';
import type { LoomaViewerHandle } from './LoomaViewer';

function deck(count = 3): LoomaDocument {
  const cards = [
    {
      id: 'c_1',
      notes: 'Speaker note that stays off the slide',
      body: [
        {
          id: 'b_1',
          type: 'paragraph',
          text: 'First idea. Read the [field guide](https://example.com/guide).',
        },
      ],
    },
    { id: 'c_2', body: [{ id: 'b_2', type: 'paragraph', text: 'Second idea' }] },
    { id: 'c_3', body: [{ id: 'b_3', type: 'paragraph', text: 'Third idea' }] },
  ].slice(0, count);
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_present',
    title: 'Present',
    format: 'presentation',
    cards,
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function reading(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_read',
    title: 'Guide',
    format: 'document',
    cards: [
      { id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'Opening section' }] },
      { id: 'c_2', body: [{ id: 'b_2', type: 'paragraph', text: 'Later section' }] },
    ],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function stageOf(container: HTMLElement): HTMLElement {
  const stage = container.querySelector('[data-lm-present]');
  if (!(stage instanceof HTMLElement)) throw new Error('missing present stage');
  stage.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  return stage;
}

function Controlled({ page: initial = 0 }: { page?: number }) {
  const [page, setPage] = useState(initial);
  return <LoomaViewer document={deck()} mode="present" page={page} onPageChange={setPage} />;
}

describe('present mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
  });

  it('pages with the keyboard, including the ends of the deck', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const view = render(
      <LoomaViewer document={deck()} mode="present" defaultPage={0} onPageChange={onPageChange} />,
    );
    const root = view.container.querySelector('[data-looma-root]');
    expect(root).toHaveAttribute('tabindex', '0');
    expect(document.activeElement).toBe(root);
    expect(screen.getByText(/First idea/)).toBeInTheDocument();
    expect(screen.queryByText('Second idea')).toBeNull();
    expect(screen.queryByText('Speaker note that stays off the slide')).toBeNull();
    expect(screen.getByText('1 / 3')).toHaveAttribute('aria-live', 'polite');

    await user.keyboard('{ArrowLeft}');
    expect(onPageChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowRight}');
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await user.keyboard('{ArrowDown}');
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    await user.keyboard(' ');
    await user.keyboard('{PageDown}');
    expect(onPageChange).toHaveBeenCalledTimes(2);

    await user.keyboard('{ArrowUp}');
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await user.keyboard('{PageUp}');
    expect(onPageChange).toHaveBeenLastCalledWith(0);
    await user.keyboard('{Home}');
    expect(onPageChange).toHaveBeenCalledTimes(4);
    await user.keyboard('{End}');
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it('supports controlled and uncontrolled pages and clamps the range', async () => {
    const user = userEvent.setup();
    const controlled = render(<Controlled />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Second idea')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    controlled.unmount();

    render(<LoomaViewer document={deck()} mode="present" defaultPage={1} />);
    expect(screen.getByText('Second idea')).toBeInTheDocument();

    const onPageChange = vi.fn();
    const clamped = render(
      <LoomaViewer document={deck()} mode="present" page={8} onPageChange={onPageChange} />,
    );
    expect(screen.getByText('Third idea')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(onPageChange).toHaveBeenCalledWith(2);
    clamped.rerender(
      <LoomaViewer document={deck(1)} mode="present" page={2} onPageChange={onPageChange} />,
    );
    expect(screen.getByText(/First idea/)).toBeInTheDocument();
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it('turns the page from the right and left halves, but not from a link', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element): void {
          this.callback(
            [
              {
                target,
                contentRect: {
                  width: 1280,
                  height: 720,
                  x: 0,
                  y: 0,
                  top: 0,
                  left: 0,
                  right: 1280,
                  bottom: 720,
                },
              } as ResizeObserverEntry,
            ],
            this as unknown as ResizeObserver,
          );
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const view = render(
      <LoomaViewer document={deck()} mode="present" onPageChange={onPageChange} />,
    );
    const stage = stageOf(view.container);

    await user.pointer({ keys: '[MouseLeft]', target: stage, coords: { x: 700, y: 40 } });
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    expect(stage.style.cursor).toBe('e-resize');

    await user.pointer({ keys: '[MouseLeft]', target: stage, coords: { x: 40, y: 40 } });
    expect(onPageChange).toHaveBeenLastCalledWith(0);
    expect(stage.style.cursor).toBe('w-resize');

    onPageChange.mockClear();
    await user.click(screen.getByRole('link', { name: 'field guide' }));
    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.getByText(/First idea/)).toBeInTheDocument();
  });

  it('opens speaker notes with N or the button and keeps clicks inside the panel', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const view = render(
      <LoomaViewer document={deck()} mode="present" onPageChange={onPageChange} />,
    );
    const toggle = view.container.querySelector('[data-lm-present-notes-toggle]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error('missing notes toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.querySelector('[data-lm-present-notes-dot]')).not.toBeNull();
    expect(screen.queryByText('Speaker note that stays off the slide')).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Speaker note that stays off the slide')).toBeInTheDocument();
    expect(onPageChange).not.toHaveBeenCalled();

    const panel = view.container.querySelector('[data-lm-present-notes]');
    if (!(panel instanceof HTMLElement)) throw new Error('missing notes panel');
    await user.click(panel);
    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.getByText(/First idea/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Second idea')).toBeInTheDocument();
    expect(screen.getByText('No speaker notes for this card.')).toBeInTheDocument();
    expect(view.container.querySelector('[data-lm-present-notes-dot]')).toBeNull();

    await user.keyboard('n');
    expect(view.container.querySelector('[data-lm-present-notes]')).toBeNull();
    await user.keyboard('N');
    expect(screen.getByText('No speaker notes for this card.')).toBeInTheDocument();
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it('hides the page number when asked', () => {
    render(<LoomaViewer document={deck()} mode="present" showPageNumber={false} />);
    expect(screen.queryByText('1 / 3')).toBeNull();
  });

  it('exposes next, prev, and goTo, and scrolls in scroll mode', () => {
    const ref = createRef<LoomaViewerHandle>();
    const onPageChange = vi.fn();
    const present = render(
      <LoomaViewer ref={ref} document={deck()} mode="present" onPageChange={onPageChange} />,
    );
    ref.current?.next();
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    ref.current?.prev();
    expect(onPageChange).toHaveBeenLastCalledWith(0);
    ref.current?.goTo(2);
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    ref.current?.goTo(2);
    expect(onPageChange).toHaveBeenCalledTimes(3);
    present.unmount();

    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const scrollRef = createRef<LoomaViewerHandle>();
    render(<LoomaViewer ref={scrollRef} document={deck()} />);
    scrollRef.current?.goTo(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('requests fullscreen on the viewer root and reports fullscreenchange', async () => {
    const onFullscreenChange = vi.fn();
    const ref = createRef<LoomaViewerHandle>();
    const view = render(
      <LoomaViewer
        ref={ref as RefObject<LoomaViewerHandle>}
        document={deck()}
        mode="present"
        onFullscreenChange={onFullscreenChange}
      />,
    );
    const root = view.container.querySelector('[data-looma-root]');
    if (!(root instanceof HTMLElement)) throw new Error('missing root');

    await expect(ref.current?.enterFullscreen()).resolves.toBeUndefined();
    const requestFullscreen = vi.fn(() => Promise.resolve());
    root.requestFullscreen = requestFullscreen;
    await ref.current?.enterFullscreen();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    const exitFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    });
    await ref.current?.exitFullscreen();
    expect(exitFullscreen).not.toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: root });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(onFullscreenChange).toHaveBeenCalledWith(true);
    await ref.current?.exitFullscreen();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('shows one document card at a time and can scroll the page', () => {
    render(<LoomaViewer document={reading()} mode="present" />);
    expect(screen.getByText('Opening section')).toBeInTheDocument();
    expect(screen.queryByText('Later section')).toBeNull();
    expect(document.querySelector('[data-lm-present]')).toHaveAttribute(
      'data-lm-present-fit',
      'width',
    );
  });
});
