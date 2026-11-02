# @lor-looma/editor

React editor for [Looma](https://github.com/lor-looma/looma) documents. It renders through `@lor-looma/viewer` and writes through `@lor-looma/core`. The editor does not keep its own copy of the document: selection and the open text field live in view state, and the document lives in the store.

```bash
bun add @lor-looma/editor @lor-looma/viewer @lor-looma/core react react-dom
```

Import both stylesheets. The editor stylesheet does not include the viewer rules.

```tsx
import { LoomaEditor } from '@lor-looma/editor';
import '@lor-looma/viewer/style.css';
import '@lor-looma/editor/style.css';

export function Editor({ doc }) {
  return <LoomaEditor document={doc} locale="zh-CN" />;
}
```

`locale` is `en-US` (default), `zh-CN`, or `zh-TW`. It translates the chrome: toolbar, sidebar, inspector, and menus. It does not translate the document.

## Controlled or uncontrolled

Pass `document` and the editor creates a store. Pass `store` to share one store with a viewer, a save hook, or an agent. `onChange` fires after every apply, undo, redo, and load.

```tsx
const store = createLoomaStore(doc);

<LoomaEditor
  store={store}
  onChange={(next, change) => save(next, change.origin)}
  highlightExternalChanges
/>;
```

When `highlightExternalChanges` is true (the default), a change whose `origin` is not `'user'` flashes the touched cards and blocks for 1.5 seconds. An agent should call `store.apply` or `createToolHandler` with `origin: 'ai'`.

## Flush pending edits

Title edits and speaker notes wait 600ms before they hit the store. Inline text and code wait 800ms. `flush()` writes those drafts immediately and returns the document. Call it before you serialize.

```tsx
const ref = useRef<LoomaEditorHandle>(null);

function exportDeck() {
  const doc = ref.current?.flush();
  if (!doc) return;
  download(JSON.stringify(doc, null, 2));
}

<LoomaEditor ref={ref} store={store} />;
```

`flush()` also closes the open inline or code editor, the same way leaving the field does. It does not wait for the debounce timer.

## Uploads

`uploadAsset` receives a `File` and must resolve to `{ src, alt?, width?, height? }`. `src` has to be `http://`, `https://`, or `data:image/`. When `uploadAsset` is omitted, the image block still accepts a URL.

`resolveAsset` is the same hook as on the viewer, used for card previews in the sidebar.

## Handle

| Method           | Effect                                                               |
| ---------------- | -------------------------------------------------------------------- |
| `store`          | The store this editor is bound to.                                   |
| `select(ids)`    | Select those cards or nodes. Mixed ids are normalized.               |
| `scrollTo(id)`   | Scroll a card or node into the canvas.                               |
| `getSelection()` | `{ cardId, nodeIds, editingId }`.                                    |
| `flush()`        | Commit debounced title, notes, and text edits. Returns the document. |

## Keyboard

These shortcuts apply when focus is in the editor and not inside a text field.

| Shortcut                | Action                                      |
| ----------------------- | ------------------------------------------- |
| `Mod+Z`                 | Undo                                        |
| `Mod+Shift+Z`, `Ctrl+Y` | Redo                                        |
| `Mod+D`                 | Duplicate the selection                     |
| `Mod+ArrowUp` / `Down`  | Move the selection up or down               |
| `Backspace`, `Delete`   | Delete the selection                        |
| `Enter`                 | Edit the selected text block                |
| `Escape`                | Select the parent, then the card, then none |

`Mod` is Command on macOS and Control elsewhere. Inside a text field, Enter splits a block, Tab indents a list item, and Escape commits and returns to the canvas.

## Props

| Prop                       | Default | Meaning                                           |
| -------------------------- | ------- | ------------------------------------------------- |
| `document`                 |         | Initial document when you do not pass `store`.    |
| `store`                    |         | Store to edit. Required if `document` is omitted. |
| `onChange`                 |         | `(doc, change) => void` after every store change. |
| `uploadAsset`              |         | Turn a dropped or picked file into an asset.      |
| `readOnly`                 | `false` | Hide editing chrome. Play still works.            |
| `highlightExternalChanges` | `true`  | Flash non-user edits.                             |
| `resolveAsset`             | `src`   | Resolve an asset id to a URL.                     |
| `locale`                   | `en-US` | `en-US`, `zh-CN`, or `zh-TW`.                     |

See [Usage](../../docs/usage.md) for a full page, and [AI integration](../../docs/ai-integration.md) for driving the store from outside the editor.

## License

[MIT](../../LICENSE)
