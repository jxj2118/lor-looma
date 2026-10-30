import { useEffect, useRef, useState } from 'react';

const EMPTY = new Set<string>();

function sameMembers(current: ReadonlySet<string>, next: ReadonlySet<string>): boolean {
  if (current.size !== next.size) return false;
  for (const id of next) {
    if (!current.has(id)) return false;
  }
  return true;
}

/** Presentation cards whose content is taller than the slide, debounced by 100ms. */
export function useCardOverflow(
  cardIds: readonly string[],
  getContentElement: (id: string) => HTMLElement | null,
  enabled: boolean,
): Set<string> {
  const [overflowing, setOverflowing] = useState<Set<string>>(EMPTY);
  const getRef = useRef(getContentElement);
  const idsRef = useRef(cardIds);
  const idsKey = cardIds.join('\0');

  useEffect(() => {
    getRef.current = getContentElement;
    idsRef.current = cardIds;
  }, [getContentElement, cardIds]);

  useEffect(() => {
    if (!enabled) return;
    const Observer = globalThis.ResizeObserver;
    if (!Observer) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const next = new Set<string>();
      for (const id of idsRef.current) {
        const element = getRef.current(id);
        if (!element) continue;
        if (element.scrollHeight > element.clientHeight + 1) next.add(id);
      }
      setOverflowing((current) => (sameMembers(current, next) ? current : next));
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(measure, 100);
    };

    // The content box has a fixed height, so growth only shows up as its children resizing.
    const observer = new Observer(() => {
      schedule();
    });
    const observeContent = (element: HTMLElement) => {
      observer.observe(element);
      for (const child of Array.from(element.children)) observer.observe(child);
    };
    const mutations = globalThis.MutationObserver
      ? new globalThis.MutationObserver((records) => {
          for (const record of records) {
            if (record.type !== 'childList') continue;
            for (const node of Array.from(record.addedNodes)) {
              if (node instanceof Element) observer.observe(node);
            }
          }
          schedule();
        })
      : undefined;
    for (const id of idsRef.current) {
      const element = getRef.current(id);
      if (!element) continue;
      observeContent(element);
      mutations?.observe(element, { childList: true, subtree: true, characterData: true });
    }
    schedule();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
      mutations?.disconnect();
    };
  }, [enabled, idsKey]);

  return overflowing;
}
