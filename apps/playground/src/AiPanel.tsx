import { formatIssue, parseDocument } from '@lor-looma/core';
import type { LoomaDocument, LoomaStore } from '@lor-looma/core';
import { LOOMA_AI_GUIDE, createToolHandler, getToolDefinitions } from '@lor-looma/core/ai';
import type { ToolProvider, ToolResult } from '@lor-looma/core/ai';
import { useLoomaDocument } from '@lor-looma/viewer';
import { useMemo, useState } from 'react';
import type { PlaygroundMessages } from './i18n';
import styles from './AiPanel.module.css';

type Tab = 'execute' | 'inspect' | 'load';
type Provider = ToolProvider;

export function AiPanel({
  store,
  messages,
  onClose,
}: {
  store: LoomaStore;
  messages: PlaygroundMessages;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('execute');

  return (
    <aside className={styles.panel} data-testid="ai-panel" aria-label={messages.aiConsole}>
      <header className={styles.header}>
        <h2 className={styles.title}>{messages.aiConsole}</h2>
        <button type="button" onClick={onClose}>
          {messages.close}
        </button>
      </header>
      <div className={styles.tabs} role="tablist" aria-label={messages.aiConsole}>
        <TabButton
          selected={tab === 'execute'}
          label={messages.tabExecute}
          onSelect={() => setTab('execute')}
        />
        <TabButton
          selected={tab === 'inspect'}
          label={messages.tabInspect}
          onSelect={() => setTab('inspect')}
        />
        <TabButton
          selected={tab === 'load'}
          label={messages.tabLoad}
          onSelect={() => setTab('load')}
        />
      </div>
      {tab === 'execute' ? <ExecuteTab store={store} messages={messages} /> : null}
      {tab === 'inspect' ? <InspectTab store={store} messages={messages} /> : null}
      {tab === 'load' ? <LoadTab store={store} messages={messages} /> : null}
    </aside>
  );
}

function TabButton({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="tab" aria-selected={selected} onClick={onSelect}>
      {label}
    </button>
  );
}

function ExecuteTab({ store, messages }: { store: LoomaStore; messages: PlaygroundMessages }) {
  const document = useLoomaDocument({ store });
  const presets = useMemo(() => buildPresets(document), [document]);
  const [draft, setDraft] = useState(presets[0]?.value ?? '');
  const [output, setOutput] = useState('');
  const [tone, setTone] = useState<'ok' | 'error' | 'idle'>('idle');

  function apply() {
    const parsed = readCommands(draft, messages);
    if ('error' in parsed) {
      setTone('error');
      setOutput(parsed.error);
      return;
    }
    const result = createToolHandler(store, { origin: 'ai' })('looma_apply', {
      commands: parsed.commands,
    });
    setTone(result.ok ? 'ok' : 'error');
    setOutput(formatResult(result));
  }

  return (
    <div className={styles.body} role="tabpanel">
      <div className={styles.presets}>
        {presets.map((preset) => (
          <button key={preset.id} type="button" onClick={() => setDraft(preset.value)}>
            {preset.label(messages)}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        {messages.commandJson}
        <textarea
          aria-label={messages.commandJson}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p className={styles.hint}>{messages.commandHint}</p>
      <button type="button" onClick={apply}>
        {messages.applyAsAi}
      </button>
      <Result title={messages.result} tone={tone} value={output} testId="ai-result" />
    </div>
  );
}

function InspectTab({ store, messages }: { store: LoomaStore; messages: PlaygroundMessages }) {
  const [provider, setProvider] = useState<Provider>('openai');
  const [output, setOutput] = useState('');
  const handler = createToolHandler(store, { origin: 'ai' });

  function cardIds(): string[] {
    return store.getDocument().cards.map((card) => card.id);
  }

  return (
    <div className={styles.body} role="tabpanel">
      <div className={styles.presets}>
        <button
          type="button"
          onClick={() => setOutput(formatResult(handler('looma_get_outline', {})))}
        >
          {messages.outline}
        </button>
        <button
          type="button"
          onClick={() =>
            setOutput(formatResult(handler('looma_get_cards', { ids: cardIds(), as: 'json' })))
          }
        >
          {messages.cardsJson}
        </button>
        <button
          type="button"
          onClick={() =>
            setOutput(formatResult(handler('looma_get_cards', { ids: cardIds(), as: 'markdown' })))
          }
        >
          {messages.cardsMarkdown}
        </button>
        <button
          type="button"
          onClick={() => setOutput(JSON.stringify(toolDefinitions(provider), null, 2))}
        >
          {messages.toolDefinitions}
        </button>
        <button type="button" onClick={() => setOutput(LOOMA_AI_GUIDE)}>
          {messages.showGuide}
        </button>
      </div>
      <label className={styles.field}>
        {messages.provider}
        <select
          aria-label={messages.provider}
          value={provider}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'openai' || next === 'anthropic' || next === 'json-schema') {
              setProvider(next);
            }
          }}
        >
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="json-schema">json-schema</option>
        </select>
      </label>
      <Result title={messages.guide} tone="idle" value={output} testId="ai-inspect-result" />
    </div>
  );
}

function LoadTab({ store, messages }: { store: LoomaStore; messages: PlaygroundMessages }) {
  const [draft, setDraft] = useState('');
  const [output, setOutput] = useState('');
  const [tone, setTone] = useState<'ok' | 'error' | 'idle'>('idle');

  function load() {
    let input: unknown;
    try {
      input = JSON.parse(draft) as unknown;
    } catch (error) {
      setTone('error');
      setOutput(`${messages.invalidJson} ${errorText(error)}`);
      return;
    }
    const parsed = parseDocument(input, { repair: true });
    if (!parsed.ok) {
      setTone('error');
      setOutput(
        [messages.validationFailed, ...parsed.errors.map((issue) => formatIssue(issue))].join('\n'),
      );
      return;
    }
    store.load(parsed.doc);
    setTone('ok');
    const warnings = parsed.warnings.map((issue) => formatIssue(issue));
    setOutput(
      [warnings.length > 0 ? messages.loadedRepaired : messages.loaded, ...warnings].join('\n'),
    );
  }

  return (
    <div className={styles.body} role="tabpanel">
      <p className={styles.hint}>{messages.loadHint}</p>
      <label className={styles.field}>
        {messages.loadJson}
        <textarea
          aria-label={messages.loadJson}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button type="button" onClick={load}>
        {messages.loadDocument}
      </button>
      <Result title={messages.result} tone={tone} value={output} testId="ai-load-result" />
    </div>
  );
}

function Result({
  title,
  tone,
  value,
  testId,
}: {
  title: string;
  tone: 'ok' | 'error' | 'idle';
  value: string;
  testId: string;
}) {
  if (!value) return null;
  return (
    <section>
      <h3 className={styles.resultTitle}>{title}</h3>
      <pre className={tone === 'error' ? styles.error : styles.output} data-testid={testId}>
        {value}
      </pre>
    </section>
  );
}

function buildPresets(document: LoomaDocument): {
  id: string;
  label: (messages: PlaygroundMessages) => string;
  value: string;
}[] {
  const card = document.cards[0];
  const parent = card?.id ?? 'c_missing';
  const first = card?.body[0];
  const second = card?.body[1];
  const columns =
    first && second
      ? {
          op: 'wrapNodes',
          ids: [first.id, second.id],
          container: { type: 'columns', widths: [1, 1] },
        }
      : {
          op: 'insertNode',
          node: {
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ type: 'paragraph', text: 'Left' }],
              [{ type: 'paragraph', text: 'Right' }],
            ],
          },
          at: { parent },
        };
  return [
    {
      id: 'callout',
      label: (messages) => messages.presetCallout,
      value: JSON.stringify(
        {
          op: 'insertNode',
          node: {
            type: 'callout',
            tone: 'note',
            text: 'Remember the one idea on this card.',
          },
          at: { parent },
        },
        null,
        2,
      ),
    },
    {
      id: 'columns',
      label: (messages) => messages.presetColumns,
      value: JSON.stringify(columns, null, 2),
    },
    {
      id: 'table',
      label: (messages) => messages.presetTable,
      value: JSON.stringify(
        {
          op: 'insertCard',
          card: {
            body: [
              { type: 'heading', level: 2, text: 'Comparison' },
              {
                type: 'table',
                header: true,
                rows: [
                  ['Item', 'Value'],
                  ['Light', 'Energy'],
                  ['Water', 'Reactant'],
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'rich',
      label: (messages) => messages.presetRich,
      value: JSON.stringify(
        {
          commands: [
            {
              op: 'insertNode',
              node: {
                type: 'math',
                tex: '\\frac{6CO_2}{6H_2O}',
                caption: 'Photosynthesis',
              },
              at: { parent, index: 0 },
            },
            {
              op: 'insertNode',
              node: {
                type: 'stat',
                value: '98%',
                label: 'Completion rate',
                detail: '+12% this week',
                tone: 'info',
              },
              at: { parent, index: 0 },
            },
            {
              op: 'insertNode',
              node: {
                type: 'steps',
                direction: 'vertical',
                children: [
                  { type: 'paragraph', text: 'Capture light' },
                  { type: 'paragraph', text: 'Build sugar' },
                ],
              },
              at: { parent, index: 0 },
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      id: 'theme',
      label: (messages) => messages.presetTheme,
      value: JSON.stringify(
        {
          commands: [{ op: 'setTheme', preset: 'warm', overrides: { colorPrimary: '#d9692f' } }],
        },
        null,
        2,
      ),
    },
  ];
}

function readCommands(
  raw: string,
  messages: PlaygroundMessages,
): { commands: unknown[] } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    return { error: `${messages.invalidCommandJson} ${errorText(error)}` };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { error: messages.emptyCommands };
    return { commands: value };
  }
  if (isRecord(value)) {
    if (Array.isArray(value.commands)) {
      if (value.commands.length === 0) return { error: messages.emptyCommands };
      return { commands: value.commands };
    }
    if (typeof value.op === 'string') return { commands: [value] };
  }
  return { error: messages.badCommandShape };
}

function toolDefinitions(provider: Provider) {
  if (provider === 'openai') return getToolDefinitions({ provider: 'openai' });
  if (provider === 'anthropic') return getToolDefinitions({ provider: 'anthropic' });
  return getToolDefinitions({ provider: 'json-schema' });
}

function formatResult(result: ToolResult): string {
  return JSON.stringify(result, null, 2);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
