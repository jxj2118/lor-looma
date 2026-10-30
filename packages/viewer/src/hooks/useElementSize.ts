import { useCallback, useEffect, useState } from 'react';

const EMPTY = { width: 0, height: 0 };

export function useElementSize<T extends HTMLElement>(): [
  ref: (el: T | null) => void,
  size: { width: number; height: number },
] {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState(EMPTY);

  const ref = useCallback((el: T | null) => {
    setElement(el);
  }, []);

  useEffect(() => {
    if (!element) return;
    const Observer = globalThis.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, size];
}
