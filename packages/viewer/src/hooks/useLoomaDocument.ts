import type { LoomaDocument, LoomaStore } from '@lor-looma/core';
import { useCallback, useSyncExternalStore } from 'react';

const MISSING_SOURCE = 'LoomaViewer needs either a document or a store';

export function useLoomaDocument(source: {
  document?: LoomaDocument;
  store?: LoomaStore;
}): LoomaDocument {
  const store = source.store;
  const provided = source.document;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {};
      return store.subscribe(() => {
        onStoreChange();
      });
    },
    [store],
  );

  const getSnapshot = useCallback(() => {
    if (store) return store.getDocument();
    return provided;
  }, [store, provided]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!snapshot) throw new Error(MISSING_SOURCE);
  return snapshot;
}
