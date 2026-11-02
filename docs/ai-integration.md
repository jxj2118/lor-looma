# AI integration

Looma does not call a model. You register three tools with the runtime you already use, and you dispatch tool calls onto a `LoomaStore`. The person and the agent share that store, so an agent edit is an undo step and shows up in the editor immediately.

```ts
import { createLoomaStore } from '@lor-looma/core';
import { LOOMA_AI_GUIDE, createToolHandler, getToolDefinitions } from '@lor-looma/core/ai';

const store = createLoomaStore(doc);
const tools = getToolDefinitions({ provider: 'openai' });
const callTool = createToolHandler(store, { origin: 'ai' });

const system = `You edit a Looma document with tools.\n\n${LOOMA_AI_GUIDE}`;
```

`origin: 'ai'` is what the editor uses to flash touched cards and blocks. Use a stable origin string if you have more than one automated writer.

## Tools

| Name                | Arguments                                  | Returns                                             |
| ------------------- | ------------------------------------------ | --------------------------------------------------- |
| `looma_get_outline` | none                                       | `outline`                                           |
| `looma_get_cards`   | `ids` (card ids), optional `as`            | `cards` or `markdown`, plus `missing`               |
| `looma_apply`       | `commands` (one or more), optional `label` | `createdIds`, `touchedIds`, `removedIds`, `outline` |

`getToolDefinitions` accepts `provider`:

- `'openai'` — `{ type: 'function', function: { name, description, parameters } }`
- `'anthropic'` — `{ name, description, input_schema }`
- `'json-schema'` (default) — `{ name, description, parameters }`

The parameter schemas are the same command schema the store validates, so a model that follows them still gets a structured error when a reference is wrong. That second check is semantic: ids exist, containers are not nested too deep, assets are declared.

`looma_get_cards` with `as: "markdown"` is a reading view. Every node is preceded by an `<!-- id: ... -->` comment. It is not an editing format. Do not ask the model to return that Markdown. Ask it to return `looma_apply` commands.

`LOOMA_AI_GUIDE` is the system text that describes the document, the workflow, every command, the inline subset, and the mistakes models usually make. Put it in the system prompt. Do not paraphrase the command rules beside it; the guide is the source those rules are tested against.

## A turn

1. Call `looma_get_outline` once. Keep the ids.
2. Call `looma_get_cards` with `as: "json"` for the cards you will change. Use `as: "markdown"` when you only need to read.
3. Send one intention as one `looma_apply` batch. A successful batch is one undo step. A failed batch changes nothing and is not an undo step.
4. On success, use the `outline` in the result for the next step. You do not need another `looma_get_outline`.
5. On failure, read `error` and `errors`, fix the commands, and send the whole batch again.

```ts
const outline = callTool('looma_get_outline', {});
const cards = callTool('looma_get_cards', {
  ids: ['c_title'],
  as: 'json',
});
const applied = callTool('looma_apply', {
  label: 'Add a summary',
  commands: [
    {
      op: 'insertNode',
      node: { type: 'callout', tone: 'note', text: 'Plants store light as sugar.' },
      at: { parent: 'c_title' },
    },
  ],
});
```

The handler also accepts a JSON string as the arguments, which is what some runtimes pass through.

Omit ids on nodes you are creating. `createdIds` lists them in creation order, parent before children. If a later command in the same batch must point at a node you are creating now, choose the id yourself.

## Errors

A failed `looma_apply` looks like this:

```json
{
  "ok": false,
  "error": "No changes were applied. Command 0 (insertNode) failed: at.parent: card not found. Fix the command and send the whole batch again.",
  "errors": [{ "commandIndex": 0, "path": "at.parent", "message": "card not found" }]
}
```

`commandIndex` is the index in the batch, or `null` when the document that would have resulted is invalid. `path` is relative to that command (`node.level`, `at.after`) or a document path when `commandIndex` is null. `error` is a single paragraph meant for the model. Show `errors` in your own UI when a person is debugging a command.

Common repairs, all of which are spelled out in `LOOMA_AI_GUIDE`:

- `updateNode` cannot change `type` or `children`. Use `replaceNode`, or insert and delete.
- `before` and `after` name a node, never a card. Insert into a card with `{ "parent": "<cardId>" }`.
- An image, accent, or image background needs an asset. `putAsset` earlier in the same batch is enough.
- `columns` needs 2 to 4 columns. `wrapNodes` needs that many adjacent siblings.
- Do not split one intention across several `looma_apply` calls. The person would undo them one at a time.

`looma_get_cards` returns `missing` for ids that are not cards. If you passed a node id, the `hint` says which card it belongs to.

## Whole documents

When the host asks for a brand-new deck in one shot, the model may write `.looma` JSON instead of commands. Run it through the parser before it touches the store.

```ts
import { formatIssue, parseDocument } from '@lor-looma/core';

const parsed = parseDocument(modelJson, { repair: true });
if (!parsed.ok) {
  return parsed.errors.map((issue) => formatIssue(issue));
}
store.load(parsed.doc);
```

`repair: true` fills defaults, normalizes small mistakes, and records each change in `warnings`. `load` does not repair. It throws if the document is still invalid, and it clears undo history. After a repair, show the warnings if a person should know the JSON was changed. A second `parseDocument` of `parsed.doc` should return no warnings.

The playground's AI Console is a thin host around this API. The Execute tab accepts one command, an array, or `{ "commands": [...] }` and calls `createToolHandler(store, { origin: 'ai' })('looma_apply', { commands })`. The Inspect tab calls the read tools and prints `getToolDefinitions` and `LOOMA_AI_GUIDE`. The Load tab parses a full document with `repair: true` and then `store.load`. Export on the toolbar calls `LoomaEditorHandle.flush()` first so debounced title, notes, and text edits are in the file.

## What not to add

Do not give the model a tool that writes raw JSON over the open document. `looma_apply` is atomic and undoable; replacing the store is not. Do not ask it to edit the Markdown from `looma_get_cards`. Do not keep a shadow copy of the document in the agent and merge it later. Read, then apply, then read the outline that came back.
