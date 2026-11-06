import {
  THEME_PRESETS,
  createLoomaStore,
  findNode,
  formatIssue,
  importDocx,
  importPptx,
  parseDocument,
} from '@lor-looma/core';
import type { LoomaDocument, LoomaNode } from '@lor-looma/core';
import { LoomaEditor } from '@lor-looma/editor';
import type { LoomaEditorHandle } from '@lor-looma/editor';
import { LoomaViewer, useLoomaDocument } from '@lor-looma/viewer';
import type { LoomaViewerHandle, ViewerMode } from '@lor-looma/viewer';
import { useRef, useState } from 'react';
import { AiPanel } from './AiPanel';
import { fill, isPlaygroundLocale, messagesFor } from './i18n';
import type { PlaygroundLocale, PlaygroundMessages } from './i18n';
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

interface Banner {
  tone: 'info' | 'warning' | 'error';
  text: string;
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
  const messages = messagesFor('en-US');
  if (problems.length > 0 || samples[0] === undefined) {
    return (
      <main className={styles.errors}>
        <h1>{messages.sampleErrors}</h1>
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

function themeLabel(preset: (typeof THEME_PRESETS)[number], messages: PlaygroundMessages): string {
  if (preset === 'clean') return messages.themeClean;
  if (preset === 'dark') return messages.themeDark;
  if (preset === 'warm') return messages.themeWarm;
  return messages.themeSerif;
}

function fileSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'document'}.looma.json`;
}

function downloadDocument(doc: LoomaDocument) {
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileSlug(doc.title);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Playground({ initial }: { initial: ReadySample }) {
  const viewerRef = useRef<LoomaViewerHandle>(null);
  const editorRef = useRef<LoomaEditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [store] = useState(() => createLoomaStore(initial.doc));
  const document = useLoomaDocument({ store });
  const [sampleId, setSampleId] = useState(initial.id);
  const [view, setView] = useState<'viewer' | 'editor'>('viewer');
  const [mode, setMode] = useState<ViewerMode>('scroll');
  const [page, setPage] = useState(0);
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  const [locale, setLocale] = useState<PlaygroundLocale>('en-US');
  const [aiOpen, setAiOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const messages = messagesFor(locale);

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
    setBanner(null);
  }

  function exportDocument() {
    editorRef.current?.flush();
    const doc = store.getDocument();
    downloadDocument(doc);
    setBanner({ tone: 'info', text: messages.exported });
  }

  async function importFile(file: File) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const lowerName = file.name.toLowerCase();
    const isZip =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04;
    const isOleDoc =
      lowerName.endsWith('.doc') ||
      (bytes.length >= 8 &&
        bytes[0] === 0xd0 &&
        bytes[1] === 0xcf &&
        bytes[2] === 0x11 &&
        bytes[3] === 0xe0);

    if (lowerName.endsWith('.docx') || isOleDoc) {
      const result = await importDocx(buffer, {
        title: file.name.replace(/\.(docx|doc)$/i, ''),
      });
      if (!result.ok) {
        setBanner({ tone: 'error', text: result.error });
        return;
      }
      store.load(result.doc);
      setSampleId('');
      setPage(0);
      setOverflowIds([]);
      setBanner({
        tone: result.warnings.length > 0 ? 'warning' : 'info',
        text: [messages.loaded, ...result.warnings].join('\n'),
      });
      return;
    }

    const pptx = lowerName.endsWith('.pptx') || isZip;
    if (pptx) {
      const result = await importPptx(buffer, { title: file.name.replace(/\.pptx$/i, '') });
      if (!result.ok) {
        setBanner({ tone: 'error', text: `${messages.pptxImportFailed} ${result.error}` });
        return;
      }
      store.load(result.doc);
      setSampleId('');
      setPage(0);
      setOverflowIds([]);
      setBanner({
        tone: result.warnings.length > 0 ? 'warning' : 'info',
        text: [messages.importedPptx, ...result.warnings].join('\n'),
      });
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setBanner({ tone: 'error', text: `${messages.invalidJson} ${detail}` });
      return;
    }
    const parsed = parseDocument(input, { repair: true });
    if (!parsed.ok) {
      setBanner({
        tone: 'error',
        text: [messages.validationFailed, ...parsed.errors.map((issue) => formatIssue(issue))].join(
          '\n',
        ),
      });
      return;
    }
    store.load(parsed.doc);
    setSampleId('');
    setPage(0);
    setOverflowIds([]);
    const warnings = parsed.warnings.map((issue) => formatIssue(issue));
    setBanner({
      tone: warnings.length > 0 ? 'warning' : 'info',
      text: [warnings.length > 0 ? messages.loadedRepaired : messages.loaded, ...warnings].join(
        '\n',
      ),
    });
  }

  async function enterFullscreen() {
    setMode('present');
    await viewerRef.current?.enterFullscreen();
  }

  return (
    <div className={styles.app}>
      <header className={styles.toolbar}>
        <label className={styles.field}>
          {messages.view}
          <select
            aria-label={messages.view}
            value={view}
            onChange={(event) => setView(event.target.value === 'editor' ? 'editor' : 'viewer')}
          >
            <option value="viewer">{messages.viewer}</option>
            <option value="editor">{messages.editor}</option>
          </select>
        </label>
        <label className={styles.field}>
          {messages.sample}
          <select
            aria-label={messages.sample}
            value={sampleId}
            onChange={(event) => selectSample(event.target.value)}
          >
            {sampleId === '' ? <option value="">{document.title}</option> : null}
            {samples.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {messages.theme}
          <select
            aria-label={messages.theme}
            value={document.theme.preset}
            onChange={(event) => {
              const preset = THEME_PRESETS.find((item) => item === event.target.value);
              if (!preset) return;
              store.apply([{ op: 'setTheme', preset }]);
            }}
          >
            {THEME_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {themeLabel(preset, messages)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {messages.format}
          <select
            aria-label={messages.format}
            value={document.format}
            onChange={(event) => {
              const format = event.target.value === 'document' ? 'document' : 'presentation';
              store.apply([{ op: 'setFormat', format }]);
            }}
          >
            <option value="presentation">{messages.formatPresentation}</option>
            <option value="document">{messages.formatDocument}</option>
          </select>
        </label>
        <label className={styles.field}>
          {messages.locale}
          <select
            aria-label={messages.locale}
            data-testid="locale-select"
            value={locale}
            onChange={(event) => {
              const next = event.target.value;
              if (isPlaygroundLocale(next)) setLocale(next);
            }}
          >
            <option value="en-US">en-US</option>
            <option value="zh-CN">zh-CN</option>
            <option value="zh-TW">zh-TW</option>
          </select>
        </label>
        {view === 'viewer' ? (
          <label className={styles.field}>
            {messages.mode}
            <select
              aria-label={messages.mode}
              value={mode}
              onChange={(event) => setMode(event.target.value === 'present' ? 'present' : 'scroll')}
            >
              <option value="scroll">{messages.modeScroll}</option>
              <option value="present">{messages.modePresent}</option>
            </select>
          </label>
        ) : null}
        <div className={styles.actions}>
          {view === 'viewer' ? (
            <>
              <button type="button" onClick={() => void enterFullscreen()}>
                {messages.fullscreen}
              </button>
              <button type="button" onClick={() => store.undo()}>
                {messages.undo}
              </button>
            </>
          ) : null}
          <button type="button" onClick={simulateAiEdit}>
            {messages.simulateAi}
          </button>
          <button type="button" onClick={() => console.log(store.getDocument())}>
            {messages.logDocument}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            {messages.importLooma}
          </button>
          <button type="button" onClick={exportDocument}>
            {messages.exportLooma}
          </button>
          <button
            type="button"
            onClick={() => {
              editorRef.current?.flush();
              window.print();
            }}
          >
            {messages.printPdf}
          </button>
          <button type="button" aria-pressed={aiOpen} onClick={() => setAiOpen((open) => !open)}>
            {messages.aiConsole}
          </button>
          <input
            ref={fileRef}
            className={styles.file}
            type="file"
            accept=".looma,.json,.pptx,.docx,application/json,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importFile(file);
            }}
          />
          {view === 'viewer' && mode === 'present' ? (
            <>
              <button type="button" onClick={() => viewerRef.current?.prev()}>
                {messages.prev}
              </button>
              <button type="button" onClick={() => viewerRef.current?.next()}>
                {messages.next}
              </button>
              <span>
                {fill(messages.pageStatus, { current: page + 1, total: document.cards.length })}
              </span>
            </>
          ) : null}
        </div>
      </header>
      {banner ? (
        <p
          className={banner.tone === 'error' ? styles.bannerError : styles.banner}
          role="status"
          data-testid="playground-status"
        >
          {banner.text}
        </p>
      ) : null}
      {view === 'viewer' ? (
        <p className={styles.overflow}>
          {messages.overflow}:{' '}
          {overflowIds.length > 0 ? overflowIds.join(', ') : messages.overflowNone}
        </p>
      ) : null}
      <div className={styles.body}>
        <div className={styles.stage}>
          {view === 'editor' ? (
            <LoomaEditor ref={editorRef} className={styles.viewer} store={store} locale={locale} />
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
        {aiOpen ? (
          <AiPanel store={store} messages={messages} onClose={() => setAiOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}
