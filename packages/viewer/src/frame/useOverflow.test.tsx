import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOverflow } from './useOverflow';

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

  flush(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function box(scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  return el;
}

describe('useOverflow', () => {
  afterEach(() => {
    MockResizeObserver.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('debounces overflow and keeps the same set when membership does not change', () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const element = box(400, 100);
    const { result } = renderHook(() =>
      useOverflow(['c_x', 'c_y'], (id) => (id === 'c_x' ? element : null), true),
    );
    expect(result.current.size).toBe(0);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    const overflowing = result.current;
    expect([...overflowing]).toEqual(['c_x']);

    act(() => {
      for (const observer of MockResizeObserver.instances) observer.flush();
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(overflowing);

    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 80 });
    act(() => {
      for (const observer of MockResizeObserver.instances) observer.flush();
      vi.advanceTimersByTime(100);
    });
    expect([...result.current]).toEqual([]);
  });

  it('stays empty when ResizeObserver is missing', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { result } = renderHook(() => useOverflow(['c_x'], () => box(400, 100), true));
    expect([...result.current]).toEqual([]);
  });
});
