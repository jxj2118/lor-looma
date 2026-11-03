# Usage

This guide shows the usual ways to embed Looma in a React app. Field-level rules live in the [schema reference](schema-reference.md). Agent setup lives in [AI integration](ai-integration.md).

Install the packages you need. The viewer and the editor both expect React 18 or 19.

```bash
bun add @lor-looma/core @lor-looma/viewer @lor-looma/editor react react-dom
```

Import stylesheets from the packages you render. The editor does not re-export the viewer stylesheet.

```tsx
import '@lor-looma/viewer/style.css';
import '@lor-looma/editor/style.css';
```

## Read-only

Parse JSON, then pass the document. `repair: true` accepts slightly messy input and lists what it fixed. Check `warnings` if you want to show that list.

```tsx
import { parseDocument } from '@lor-looma/core';
import { LoomaViewer } from '@lor-looma/viewer';

const parsed = parseDocument(raw, { repair: true });
if (!parsed.ok) {
  return <pre>{parsed.errors.map((issue) => issue.message).join('\n')}</pre>;
}

export function Reader() {
  return <LoomaViewer document={parsed.doc} mode="scroll" />;
}
```

`mode="scroll"` is the default. Cards stack vertically. Document-format cards use their natural height. Presentation cards stay at 16:9 and scale down to the container width.

Code blocks show a language badge when `language` is set, a Copy button, and lightweight syntax coloring for common languages. `text` and `plaintext` stay uncolored. The coloring uses theme colors, so it follows the active preset.

## Present

Control the page yourself, or let the viewer keep it.

```tsx
import { useRef, useState } from 'react';
import { LoomaViewer } from '@lor-looma/viewer';
import type { LoomaViewerHandle } from '@lor-looma/viewer';

export function Show({ doc }) {
  const ref = useRef<LoomaViewerHandle>(null);
  const [page, setPage] = useState(0);

  return (
    <>
      <button type="button" onClick={() => ref.current?.prev()}>
        Prev
      </button>
      <button type="button" onClick={() => ref.current?.next()}>
        Next
      </button>
      <button type="button" onClick={() => void ref.current?.enterFullscreen()}>
        Fullscreen
      </button>
      <LoomaViewer
        ref={ref}
        document={doc}
        mode="present"
        page={page}
        onPageChange={setPage}
        onOverflow={(ids) => console.log(ids)}
      />
    </>
  );
}
```

`onOverflow` lists presentation cards whose content is taller than 720 logical pixels. Split those cards instead of shrinking the type. The callback does not fire for `document` format.

Keyboard page turns work after the present view is focused: Arrow keys, Space, Page Up, Page Down, Home, and End. Press `n` or `N`, or the Notes button beside the page number, to open the current card's speaker notes. The notes use the same inline text as the slide. Clicking the notes panel does not turn the page. A card with no notes shows an empty message.

In the viewer and in present mode, clicking an image opens a fullscreen preview. The click does not turn the page. Press Escape, click the backdrop, or use the close button to dismiss it. The editor canvas does not open this preview, so a click there still selects the block.

## Editor

An uncontrolled editor owns its store. A controlled editor uses a store you created, which is what you want when a viewer, a save function, and an agent share one document.

```tsx
import { createLoomaStore } from '@lor-looma/core';
import { LoomaEditor } from '@lor-looma/editor';
import { useRef } from 'react';
import type { LoomaEditorHandle } from '@lor-looma/editor';

const store = createLoomaStore(doc);

export function Editor() {
  const ref = useRef<LoomaEditorHandle>(null);

  return (
    <LoomaEditor
      ref={ref}
      store={store}
      locale="en-US"
      onChange={(next, change) => {
        if (change.kind === 'apply' || change.kind === 'undo' || change.kind === 'redo') {
          scheduleSave(next);
        }
      }}
    />
  );
}

function scheduleSave(next: unknown) {
  void next;
}
```

`readOnly` hides the sidebar, inspector, and undo controls. Play remains available.

### Locales

`locale` accepts `en-US`, `zh-CN`, and `zh-TW`. The strings cover the toolbar, card sidebar, slash menu, inspector, and playback chrome. Document text is never translated. The playground keeps the same locale control visible in both the viewer and the editor, and passes it through to `LoomaEditor`.

```tsx
<LoomaEditor store={store} locale={locale} />
```

### Flush before you save

The title, speaker notes, and the open text field commit on a short debounce (600ms for the title and notes, 800ms for inline text and code). If the user hits Save during that window, `store.getDocument()` is missing the latest keystrokes. `flush()` writes them first.

```tsx
function onSave() {
  const doc = ref.current?.flush();
  if (doc) persist(JSON.stringify(doc, null, 2));
}
```

`flush()` returns the document. It also closes the inline editor or code editor. Call it from export, from a manual save, and before you hand the document to another process. You do not need it for `onChange`: that callback already runs after a commit.

The other handle methods are `select(ids)`, `scrollTo(id)`, `getSelection()`, `play(page?)`, `closePlay()`, `undo()`, `redo()`, and `setTitle(title)`. `play`, `undo`, `redo`, and `setTitle` all flush pending edits first so a host toolbar never drops in-flight typing.

### Embedding in a custom host shell

If your application already renders its own top bar, pass `chrome={{ topbar: false, documentSettings: false }}` on `LoomaEditor`. The internal top bar is not mounted, and the right inspector keeps card, container, and block properties without duplicating global document settings. Mount `<LoomaDocumentSettings />` inside your own popover or dialog:

```tsx
<LoomaDocumentSettings
  store={store}
  locale="zh-CN"
  showFormat={false}
  onBeforeChange={() => {
    ref.current?.flush();
  }}
/>
```

### Images

`uploadAsset` runs when a person drops or picks a file. Return a URL the browser can load. `resolveAsset` runs when a card draws an image, including sidebar thumbnails.

```tsx
<LoomaEditor
  store={store}
  uploadAsset={async (file) => {
    const uploaded = await uploadToCdn(file);
    return { src: uploaded.url, alt: file.name, width: uploaded.width, height: uploaded.height };
  }}
  resolveAsset={(asset) => asset.src}
/>
```

`src` must start with `http://`, `https://`, or `data:image/`. The editor stores the asset with `putAsset` and points the block or card accent at the new id.

An image block and a card accent can set `focalPoint` to `{ "x", "y" }` in the 0–100 range. The viewer uses that point as `object-position` (or `background-position` when the accent is a background). The inspector exposes Horizontal X and Vertical Y, and a button that clears the point back to the center.

### External edits

Apply agent commands on the same store. The canvas updates on its own. With `highlightExternalChanges` left at its default, touched ids flash for 1.5 seconds and the change is a single undo step.

```tsx
store.apply([{ op: 'updateNode', id: 'b_lead', patch: { text: 'A shorter lead.' } }], {
  origin: 'ai',
  label: 'Tighten the lead',
});
```

If that node was being edited, the open field is replaced with the new text and a notice explains why. Prefer the tool handler in [AI integration](ai-integration.md) when the caller is a model: it checks arguments and returns errors the model can repair.

## Programmatic selection

```tsx
ref.current?.select(['c_title', 'b_lead']);
ref.current?.scrollTo('b_lead');
const selection = ref.current?.getSelection();
```

`select` accepts card ids and node ids. A card id selects the card. Node ids select those nodes and remember the card that contains them.

## Playground import and export

The playground is a host, not a library API, but it is the reference for round-tripping a file:

1. Export calls `editorRef.current?.flush()`, then downloads `JSON.stringify(store.getDocument(), null, 2)` as `<slug>.looma.json`.
2. Import reads `.looma` or `.json`, runs `parseDocument(value, { repair: true })`, and on success calls `store.load(doc)`.
3. Repair warnings and validation errors are shown above the canvas. `load` itself does not repair; do that before calling it.

Use the same two steps in your own save dialog.

## Print and PDF

Looma prints through the browser. `@media print` hides the editor chrome (top bar, sidebar, inspector, block handles, and overflow badges), the playground toolbar, and the code-block copy button. Cards keep their colors (`print-color-adjust: exact`) and avoid breaking in the middle of a card.

In the playground, **Print / PDF** calls `editorRef.current?.flush()` and then `window.print()`. Choose "Save as PDF" in the system dialog for a vector PDF. Call `flush()` yourself before `window.print()` in your own host so a debounced edit is included.
