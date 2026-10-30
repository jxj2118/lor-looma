import * as Dialog from '@radix-ui/react-dialog';
import { LoomaViewer } from '@lor-looma/viewer';
import { useState } from 'react';
import { useEditorContext } from '../state/viewState';
import styles from './PlayOverlay.module.css';

export function PlayOverlay({
  open,
  initialPage,
  onOpenChange,
}: {
  open: boolean;
  initialPage: number;
  onOpenChange: (open: boolean) => void;
}) {
  const { store, messages, layerElement, finishEditing } = useEditorContext();
  const [page, setPage] = useState(initialPage);
  const container = layerElement;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) finishEditing();
        onOpenChange(next);
      }}
    >
      {open && container ? (
        <Dialog.Portal container={container}>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.content} aria-describedby={undefined}>
            <div className={styles.toolbar}>
              <Dialog.Title className={styles.title}>{messages.play}</Dialog.Title>
              <Dialog.Close className={styles.close}>{messages.close}</Dialog.Close>
            </div>
            <div className={styles.stage}>
              <LoomaViewer store={store} mode="present" page={page} onPageChange={setPage} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
