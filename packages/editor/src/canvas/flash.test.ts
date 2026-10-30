import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewState } from '../state/viewState';
import { armFlash, clearFlash } from './flash';

describe('armFlash', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('highlights each id on its own timer and restarts that timer when repeated', () => {
    vi.useFakeTimers();
    const viewState = createViewState();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    armFlash(viewState, ['b_1', 'c_1'], timers);
    expect([...viewState.get().flashIds]).toEqual(['b_1', 'c_1']);

    vi.advanceTimersByTime(1000);
    armFlash(viewState, ['b_1'], timers);
    vi.advanceTimersByTime(1000);
    expect(viewState.get().flashIds.has('c_1')).toBe(false);
    expect(viewState.get().flashIds.has('b_1')).toBe(true);

    vi.advanceTimersByTime(500);
    expect(viewState.get().flashIds.size).toBe(0);
  });

  it('clears pending highlights', () => {
    vi.useFakeTimers();
    const viewState = createViewState();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    armFlash(viewState, ['b_1'], timers);
    clearFlash(viewState, timers);
    expect(viewState.get().flashIds.size).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(viewState.get().flashIds.size).toBe(0);
  });
});
