import type { LoomaDocument } from '@lor-looma/core';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { LOGICAL_SIZE } from '../constants';
import { LoomaCardView } from '../card/LoomaCardView';
import type { LoomaCardViewProps } from '../card/LoomaCardView';
import { ScaledFrame } from '../frame/ScaledFrame';
import { InlineText } from '../inline/InlineText';
import styles from './PresentView.module.css';
import emptyStyles from './LoomaViewer.module.css';

function hitsRightHalf(event: MouseEvent<HTMLDivElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX - rect.left >= rect.width / 2;
}

export function PresentView({
  document,
  page,
  maxScale,
  showPageNumber,
  resolveAsset,
  renderNode,
  onPage,
}: {
  document: LoomaDocument;
  page: number;
  maxScale: number;
  showPageNumber: boolean;
  resolveAsset?: LoomaCardViewProps['resolveAsset'];
  renderNode?: LoomaCardViewProps['renderNode'];
  onPage: (page: number) => void;
}) {
  const [cursor, setCursor] = useState<'w-resize' | 'e-resize'>('w-resize');
  const [notesOpen, setNotesOpen] = useState(false);
  const card = document.cards[page];
  const count = document.cards.length;
  const fitWidth = document.format === 'document';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'n' && event.key !== 'N') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      event.preventDefault();
      setNotesOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trackCursor = (event: MouseEvent<HTMLDivElement>) => {
    setCursor(hitsRightHalf(event) ? 'e-resize' : 'w-resize');
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('a')) return;
    trackCursor(event);
    onPage(page + (hitsRightHalf(event) ? 1 : -1));
  };

  return (
    <div className={styles.present}>
      {card ? (
        <div
          data-lm-present=""
          data-lm-present-fit={fitWidth ? 'width' : 'contain'}
          className={fitWidth ? styles.stageScroll : styles.stage}
          style={{ cursor }}
          onMouseMove={trackCursor}
          onClick={onClick}
        >
          <ScaledFrame
            logicalWidth={fitWidth ? LOGICAL_SIZE.document.width : LOGICAL_SIZE.presentation.width}
            logicalHeight={fitWidth ? undefined : LOGICAL_SIZE.presentation.height}
            maxScale={maxScale}
            fit={fitWidth ? 'width' : 'contain'}
          >
            <LoomaCardView
              card={card}
              document={document}
              resolveAsset={resolveAsset}
              renderNode={renderNode}
            />
          </ScaledFrame>
        </div>
      ) : (
        <div className={emptyStyles.empty}>This document has no cards yet.</div>
      )}
      {count > 0 ? (
        <div className={styles.chrome}>
          <button
            type="button"
            className={styles.notesToggle}
            data-lm-present-notes-toggle=""
            aria-expanded={notesOpen}
            aria-label="Notes"
            onClick={(event) => {
              event.stopPropagation();
              setNotesOpen((open) => !open);
            }}
          >
            Notes
            {card?.notes ? <span className={styles.notesDot} data-lm-present-notes-dot="" /> : null}
          </button>
          {showPageNumber ? (
            <div className={styles.pager} aria-live="polite">
              {page + 1} / {count}
            </div>
          ) : null}
        </div>
      ) : null}
      {notesOpen ? (
        <aside
          className={styles.notes}
          data-lm-present-notes=""
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={styles.notesHead}>
            <span>
              {page + 1} / {count}
            </span>
            <div className={styles.notesNav}>
              <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}>
                Previous
              </button>
              <button type="button" disabled={page >= count - 1} onClick={() => onPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
          {card?.notes ? (
            <div className={styles.notesBody}>
              <InlineText text={card.notes} />
            </div>
          ) : (
            <p className={styles.notesEmpty}>No speaker notes for this card.</p>
          )}
        </aside>
      ) : null}
    </div>
  );
}
