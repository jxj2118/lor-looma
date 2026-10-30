import type { ViewStateStore } from '../state/viewState';

export function armFlash(
  viewState: ViewStateStore,
  ids: readonly string[],
  timers: Map<string, ReturnType<typeof setTimeout>>,
  delay = 1500,
): void {
  if (ids.length === 0) return;
  const next = new Set(viewState.get().flashIds);
  for (const id of ids) {
    next.add(id);
    const existing = timers.get(id);
    if (existing !== undefined) clearTimeout(existing);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        const current = new Set(viewState.get().flashIds);
        if (!current.delete(id)) return;
        viewState.set({ flashIds: current });
      }, delay),
    );
  }
  viewState.set({ flashIds: next });
}

export function clearFlash(
  viewState: ViewStateStore,
  timers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  if (viewState.get().flashIds.size > 0) viewState.set({ flashIds: new Set() });
}
