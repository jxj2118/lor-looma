# @lor-looma/core

Document model, validation, commands, and undo for [Looma](https://github.com/lor-looma/looma). This package has no React dependency. The viewer and the editor both sit on top of it, and so can a server or a script.

```bash
bun add @lor-looma/core
```

## Parse a document

`parseDocument` accepts a JSON value or a JSON string. Repair is on by default: missing ids are filled in and duplicate ids are renamed. Pass `{ repair: false }` to reject those fixes instead. An unrecognized block type is always kept as an unsupported node, with a warning. Anything else that is still invalid is an error.

```ts
import { formatIssue, parseDocument } from '@lor-looma/core';

const parsed = parseDocument(input, { repair: true });
if (!parsed.ok) {
  for (const issue of parsed.errors) console.error(formatIssue(issue));
} else {
  console.log(parsed.doc.title, parsed.warnings);
}
```

A successful result is `{ ok: true, doc, warnings }`. A failure is `{ ok: false, errors }`. Each issue has a `path` and a `message`.

## Import a PowerPoint file

`importPptx` reads a `.pptx` package in the browser or on Node.js 20+ and returns a validated `LoomaDocument`. It does not add a runtime dependency. The same function is available from `@lor-looma/core/pptx`.

```ts
import { importPptx } from '@lor-looma/core';
import { LoomaEditor } from '@lor-looma/editor';

const result = await importPptx(await file.arrayBuffer(), {
  title: file.name.replace(/\.pptx$/i, ''),
  uploadAsset: async ({ filename, mimeType, bytes }) => {
    const uploaded = await uploadToObjectStorage({ filename, mimeType, bytes });
    return {
      src: uploaded.url,
      width: uploaded.width,
      height: uploaded.height,
      alt: filename,
    };
  },
});
if (!result.ok) throw new Error(result.error);

export function ImportedDeck() {
  return <LoomaEditor document={result.doc} />;
}
```

Without `uploadAsset`, png, jpeg, gif, webp, and svg files are embedded as `data:image/...;base64,...` URLs. The same image used on several slides becomes one asset. Unsupported media such as EMF, WMF, video, and audio is skipped and listed in `warnings`. The returned `doc` has already passed `parseDocument` with repair, so it can be loaded into `LoomaEditor` or `createLoomaStore`.

## Store

`createLoomaStore(doc)` checks the document, freezes it, and keeps an undo stack of 200 entries. Consecutive edits that share a `mergeKey` inside a one-second window become one undo step.

```ts
import { createLoomaStore } from '@lor-looma/core';

const store = createLoomaStore(doc);
const stop = store.subscribe((next, change) => {
  console.log(change.kind, change.origin, next.title);
});

const result = store.apply([{ op: 'setTitle', title: 'Field notes' }], {
  origin: 'user',
  label: 'Rename',
  mergeKey: 'title',
});
if (result.ok) {
  store.undo();
  store.redo();
}
store.load(otherDoc); // replaces the document and clears history
stop();
```

`apply` takes an array of commands. The batch is atomic. On success the result includes `createdIds`, `touchedIds`, and `removedIds`. On failure it includes `errors`, each with `commandIndex`, `path`, and `message`, and the document is unchanged.

`load` throws if the document does not validate. Parse and repair first, then load `parsed.doc`.

## Commands

Every command has an `op`. Ids you are creating may be omitted; the store generates them and returns them in `createdIds`. Ids you are targeting are required.

| Op              | Required fields                         |
| --------------- | --------------------------------------- |
| `setTitle`      | `title`                                 |
| `setFormat`     | `format` (`presentation` or `document`) |
| `setTheme`      | `preset`, `overrides`, or both          |
| `putAsset`      | `asset` (`kind: "image"`, `src`)        |
| `removeAsset`   | `id`                                    |
| `insertCard`    | nothing (`card` and `at` are optional)  |
| `updateCard`    | `id`, `patch`                           |
| `moveCard`      | `id`, `to`                              |
| `duplicateCard` | `id`                                    |
| `deleteCard`    | `id`                                    |
| `insertNode`    | `node`, `at`                            |
| `updateNode`    | `id`, `patch`                           |
| `replaceNode`   | `id`, `node`                            |
| `moveNode`      | `id`, `to`                              |
| `deleteNode`    | `id`                                    |
| `wrapNodes`     | `ids`, `container`                      |
| `unwrapNode`    | `id`                                    |
| `insertColumn`  | `id` of a `columns` container           |
| `deleteColumn`  | `id`, `index`                           |

The field-level rules, inline markup, and theme override whitelist are in the [schema reference](../../docs/schema-reference.md).

## Reading

`getOutline(doc)` returns the title, format, and a short preview of every card and node. `getCards(doc, ids, { as: 'json' | 'markdown' })` returns the full cards. Markdown is a read-only view: each node is preceded by an `<!-- id: ... -->` comment. Do not parse that Markdown back into commands.

## Agent tools

`@lor-looma/core/ai` exports the system guide, JSON Schemas for three providers, and a handler that calls the functions above.

```ts
import { createToolHandler, getToolDefinitions, LOOMA_AI_GUIDE } from '@lor-looma/core/ai';

const tools = getToolDefinitions({ provider: 'openai' });
const callTool = createToolHandler(store, { origin: 'ai' });
const outline = callTool('looma_get_outline', {});
```

`provider` is `'openai'`, `'anthropic'`, or `'json-schema'`. See [AI integration](../../docs/ai-integration.md) for the full loop.

## License

[MIT](../../LICENSE)
