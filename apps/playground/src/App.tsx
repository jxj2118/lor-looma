import {
  THEME_PRESETS,
  createLoomaStore,
  findNode,
  formatIssue,
  parseDocument,
} from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import { LoomaEditor } from '@lor-looma/editor';
import type { LoomaEditorHandle } from '@lor-looma/editor';
import { LoomaViewer, useLoomaDocument } from '@lor-looma/viewer';
import type { LoomaViewerHandle, ViewerMode } from '@lor-looma/viewer';
import { useRef, useState } from 'react';
import fieldGuide from './samples/field-guide.json';
import overflowSample from './samples/overflow.json';
import photosynthesis from './samples/photosynthesis.json';
import styles from './App.module.css';

const SOURCES = [
  { id: 'photosynthesis', label: 'Photosynthesis', data: photosynthesis },
  { id: 'field-guide', label: 'Field guide', data: fieldGuide },
  { id: 'overflow', label: 'Overflow', data: overflowSample },
] as const;

interface ReadySample {
  id: string;
  label: string;
  doc: LoomaDocument;
}

function prepareSamples(): { samples: ReadySample[]; problems: string[] } {
  const samples: ReadySample[] = [];
  const problems: string[] = [];
  for (const source of SOURCES) {
    const parsed = parseDocument(source.data, { repair: false });
    if (!parsed.ok) {
      for (const issue of parsed.errors) {
        problems.push(`${source.label}: ${formatIssue(issue)}`);
      }
      continue;
    }
    samples.push({ id: source.id, label: source.label, doc: parsed.doc });
  }
  return { samples, problems };
}

const { samples, problems } = prepareSamples();

export function App() {
  if (problems.length > 0 || samples[0] === undefined) {
    return (
      <main className={styles.errors}>
        <h1>Sample documents failed to parse</h1>
        <ul>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </main>
    );
  }
  return <Playground initial={samples[0]} />;
}

function textWithSuffix(node: LoomaNode): { text: string } | { code: string } | null {
  if (
    node.type === 'heading' ||
    node.type === 'paragraph' ||
    node.type === 'callout' ||
    node.type === 'quote'
  ) {
    return { text: `${node.text} (edited by AI)` };
  }
  if (node.type === 'code') return { code: `${node.code} (edited by AI)` };
  return null;
}

function Playground({ initial }: { initial: ReadySample }) {
  const viewerRef = useRef<LoomaViewerHandle>(null);
  const editorRef = useRef<LoomaEditorHandle>(null);
  const [store] = useState(() => createLoomaStore(initial.doc));
  const document = useLoomaDocument({ store });
  const [sampleId, setSampleId] = useState(initial.id);
  const [view, setView] = useState<'viewer' | 'editor'>('viewer');
  const [mode, setMode] = useState<ViewerMode>('scroll');
  const [page, setPage] = useState(0);
  const [overflowIds, setOverflowIds] = useState<string[]>([]);

  function simulateAiEdit() {
    window.setTimeout(() => {
      const doc = store.getDocument();
      const selection = editorRef.current?.getSelection();
      const candidate = selection?.editingId ?? selection?.nodeIds[0];
      const node = candidate ? findNode(doc, candidate)?.node : undefined;
      const patch = node ? textWithSuffix(node) : null;
      if (candidate && patch) {
        store.apply([{ op: 'updateNode', id: candidate, patch }], { origin: 'ai' });
        return;
      }
      const card = doc.cards[0];
      if (!card) return;
      store.apply(
        [
          {
            op: 'insertNode',
            node: { type: 'paragraph', text: 'Added by AI.' },
            at: { parent: card.id },
          },
        ],
        { origin: 'ai' },
      );
    }, 3000);
  }

  function selectSample(id: string) {
    const next = samples.find((sample) => sample.id === id);
    if (!next) return;
    store.load(next.doc);
    setSampleId(id);
    setPage(0);
    setOverflowIds([]);
  }

  async function enterFullscreen() {
    setMode('present');
    await viewerRef.current?.enterFullscreen();
  }

  return (
    <div className={styles.app}>
      <header className={styles.toolbar}>
        <label className={styles.field}>
          View
          <select
            value={view}
            onChange={(event) => setView(event.target.value === 'editor' ? 'editor' : 'viewer')}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
        <label className={styles.field}>
          Sample
          <select value={sampleId} onChange={(event) => selectSample(event.target.value)}>
            {samples.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Theme
          <select
            value={document.theme.preset}
            onChange={(event) => {
              const preset = THEME_PRESETS.find((item) => item === event.target.value);
              if (!preset) return;
              store.apply([{ op: 'setTheme', preset }]);
            }}
          >
            {THEME_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Format
          <select
            value={document.format}
            onChange={(event) => {
              const format = event.target.value === 'document' ? 'document' : 'presentation';
              store.apply([{ op: 'setFormat', format }]);
            }}
          >
            <option value="presentation">presentation</option>
            <option value="document">document</option>
          </select>
        </label>
        {view === 'viewer' ? (
          <label className={styles.field}>
            Mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value === 'present' ? 'present' : 'scroll')}
            >
              <option value="scroll">scroll</option>
              <option value="present">present</option>
            </select>
          </label>
        ) : null}
        <div className={styles.actions}>
          {view === 'viewer' ? (
            <>
              <button type="button" onClick={() => void enterFullscreen()}>
                Fullscreen
              </button>
              <button type="button" onClick={() => store.undo()}>
                Undo
              </button>
            </>
          ) : null}
          <button type="button" onClick={simulateAiEdit}>
            Simulate AI edit (3s)
          </button>
          <button type="button" onClick={() => console.log(store.getDocument())}>
            Log document
          </button>
          {view === 'viewer' && mode === 'present' ? (
            <>
              <button type="button" onClick={() => viewerRef.current?.prev()}>
                Prev
              </button>
              <button type="button" onClick={() => viewerRef.current?.next()}>
                Next
              </button>
              <span>
                {page + 1} / {document.cards.length}
              </span>
            </>
          ) : null}
        </div>
      </header>
      {view === 'viewer' ? (
        <p className={styles.overflow}>
          Overflow: {overflowIds.length > 0 ? overflowIds.join(', ') : 'none'}
        </p>
      ) : null}
      <div className={styles.stage}>
        {view === 'editor' ? (
          <LoomaEditor ref={editorRef} className={styles.viewer} store={store} />
        ) : (
          <LoomaViewer
            ref={viewerRef}
            className={styles.viewer}
            store={store}
            mode={mode}
            page={page}
            onPageChange={setPage}
            onOverflow={setOverflowIds}
          />
        )}
      </div>
    </div>
  );
}
