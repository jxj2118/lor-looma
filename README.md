# Looma

Looma is a card-based editor and viewer for presentations and long-form documents. People and external agents edit the same `.looma` document through the same command channel. The library does not call a model, store a prompt, or depend on a particular provider.

A document is a sequence of cards. In `presentation` format each card is one 16:9 slide. In `document` format each card is one flowing page. Inside a card, four layout containers arrange eleven kinds of blocks. Inline text uses a small Markdown subset, not HTML.

## Design

- **One document, two clients.** `LoomaViewer` and `LoomaEditor` both read a `LoomaStore`. The editor does not keep a second copy of the document.
- **Commands, not patches from the outside.** Hosts and agents change the document with a fixed set of commands. A batch is atomic: if one command fails, nothing is applied.
- **Agents stay outside the package.** Register `looma_get_outline`, `looma_get_cards`, and `looma_apply` with whatever model runtime you already use. `@lor-looma/core/ai` only describes the tools and dispatches them onto the store.

```text
  person ── LoomaEditor ──┐
                          ├── LoomaStore ── .looma JSON
  agent ── tool handler ──┘         │
                                    └── LoomaViewer (scroll or present)
```

## Packages

| Package             | Role                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `@lor-looma/core`   | Document model, validation, commands, undo, and the agent tool surface. No UI. |
| `@lor-looma/viewer` | React renderer for scroll reading and fullscreen presentation.                 |
| `@lor-looma/editor` | React editor built on the viewer: canvas, sidebar, inspector, and inline text. |

## Quick start

```bash
bun add @lor-looma/core @lor-looma/viewer @lor-looma/editor react react-dom
```

Read a document:

```tsx
import { parseDocument } from '@lor-looma/core';
import { LoomaViewer } from '@lor-looma/viewer';
import '@lor-looma/viewer/style.css';

const parsed = parseDocument(json, { repair: true });
if (!parsed.ok) throw new Error(parsed.errors.map((issue) => issue.message).join('\n'));

export function Deck() {
  return <LoomaViewer document={parsed.doc} mode="scroll" />;
}
```

Edit it:

```tsx
import { LoomaEditor } from '@lor-looma/editor';
import '@lor-looma/viewer/style.css';
import '@lor-looma/editor/style.css';

export function Editor({ doc }) {
  return <LoomaEditor document={doc} locale="en-US" />;
}
```

Let an agent edit the same store:

```tsx
import { createLoomaStore } from '@lor-looma/core';
import { createToolHandler } from '@lor-looma/core/ai';

const store = createLoomaStore(doc);
const callTool = createToolHandler(store, { origin: 'ai' });

callTool('looma_apply', {
  commands: [
    {
      op: 'insertNode',
      node: { type: 'callout', tone: 'note', text: 'Remember this sentence.' },
      at: { parent: doc.cards[0].id },
    },
  ],
});
```

`locale` on `LoomaEditor` is `en-US`, `zh-CN`, or `zh-TW`. It changes the editor chrome, not the document text.

## Playground

`apps/playground` loads three sample decks and can switch among the viewer, the editor, four theme presets, and the three locales. The toolbar imports `.looma` JSON and `.pptx` files, and exports `.looma` JSON. A PowerPoint file is converted with `importPptx` before it is loaded. Export calls `editor.flush()` first so a title, speaker notes, or inline edit that is still inside its debounce window is included. The AI Console runs the public tool handler against the live store: apply commands, read the outline, read cards as JSON or Markdown, print the tool schemas, and load a full document. One preset inserts a steps container, a stat metric, and a math formula.

```bash
bun install
bun run dev
```

## Documentation

- [Architecture](docs/architecture.md) — store, rendering, and how the editor mounts text fields
- [Usage](docs/usage.md) — viewer, editor, uploads, locales, and `flush()`
- [Schema reference](docs/schema-reference.md) — `.looma` v1 fields, containers, blocks, inline text, and themes
- [AI integration](docs/ai-integration.md) — tool definitions, the handler, and repairing a generated document

## Development

Requires [Bun](https://bun.sh) 1.4+ and Node.js 20+.

```bash
bun install
bun run dev            # playground
bun run test           # unit tests
bun run test:e2e       # Playwright, including theme screenshots
bun run lint
bun run typecheck
bun run build
```

`bun run test:e2e` builds the playground, serves it, and runs Chromium. Theme screenshots are compared at a 1280×800 viewport with `deviceScaleFactor: 1`.

## License

[MIT](./LICENSE)
