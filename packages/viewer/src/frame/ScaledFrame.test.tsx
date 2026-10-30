import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScaledFrame } from './ScaledFrame';

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

  flush(width: number, height = 20): void {
    const entries = this.elements.map(
      (target) =>
        ({
          target,
          contentRect: { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height },
        }) as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

function frameOf(container: HTMLElement): { outer: HTMLElement; inner: HTMLElement } {
  const inner = container.querySelector('section')?.parentElement;
  const outer = inner?.parentElement;
  if (!(inner instanceof HTMLElement) || !(outer instanceof HTMLElement)) {
    throw new Error('scaled frame is missing');
  }
  return { outer, inner };
}

describe('ScaledFrame', () => {
  afterEach(() => {
    MockResizeObserver.instances = [];
    vi.unstubAllGlobals();
  });

  it('hides the slide until the container is measured, then scales 640px to 0.5', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const view = render(
      <ScaledFrame logicalWidth={1280} logicalHeight={720}>
        <section>Slide</section>
      </ScaledFrame>,
    );
    const hidden = frameOf(view.container);
    expect(hidden.inner.style.visibility).toBe('hidden');

    act(() => {
      for (const observer of MockResizeObserver.instances) observer.flush(640);
    });
    const shown = frameOf(view.container);
    expect(shown.inner.style.visibility).toBe('visible');
    expect(shown.inner.style.transform).toMatch(/scale\(0\.5\)/);
    expect(shown.inner.style.width).toBe('1280px');
    expect(shown.outer.style.height).toBe('360px');
  });

  it('does not scale past maxScale', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const view = render(
      <ScaledFrame logicalWidth={816} maxScale={1}>
        <section>Page</section>
      </ScaledFrame>,
    );
    act(() => {
      for (const observer of MockResizeObserver.instances) observer.flush(2000, 400);
    });
    expect(frameOf(view.container).inner.style.transform).toMatch(/scale\(1\)/);
  });
});
