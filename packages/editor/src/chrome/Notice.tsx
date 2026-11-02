import { useEffect } from 'react';
import { useEditorContext, useViewState } from '../state/viewState';
import styles from './Notice.module.css';

export function Notice() {
  const notice = useViewState((state) => state.notice);
  const { viewState } = useEditorContext();

  useEffect(() => {
    if (!notice) return;
    const id = notice.id;
    const timer = setTimeout(() => {
      if (viewState.get().notice?.id === id) viewState.set({ notice: null });
    }, 4000);
    return () => clearTimeout(timer);
  }, [notice, viewState]);

  if (!notice) return null;
  return (
    <div className={styles.notice} role="status" aria-label={notice.message}>
      {notice.message}
    </div>
  );
}
