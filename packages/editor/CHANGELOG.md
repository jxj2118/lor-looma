# Changelog

## 0.6.1

- Fix published `@lor-looma/core` and `@lor-looma/viewer` dependency versions to `0.6.1`.

## 0.6.0

- Add in-place editing for `LoomaScene` text elements (preserving per-run typography, paragraph spacing, and IME composition) and image replacement (preserving bounding box, frame, and `srcRect` crop) with full undo/redo and `flush()` support.

## 0.5.0

- Synchronize the release with `@lor-looma/core` PowerPoint import. Load `importPptx(...).doc` into `LoomaEditor` the same way as any other document.

## 0.4.0

- Add `chrome={{ topbar, documentSettings }}` on `LoomaEditor` so a host shell can unmount the built-in topbar and global document section in the inspector without CSS workarounds.
- Add `play(page?)`, `closePlay()`, `undo()`, `redo()`, and `setTitle(title)` on `LoomaEditorHandle`, each flushing in-flight edits before acting on the shared history stack.
- Export standalone `<LoomaDocumentSettings />` (with `showFormat`, `showThemePreset`, `showThemeOverrides`, and `onBeforeChange`) so hosts can mount theme preset and override controls inside their own popovers or dialogs.

## 0.3.0

- Insert `steps`, `stat`, and `math` from the slash menu, and wrap a selection in steps.
- Edit a metric's three text slots, a formula's LaTeX source, and image or accent focal points from the inspector.

## 0.2.0

- Split a card from the block menu or the inspector.
- Insert and delete table rows and columns around the active cell.
- Drag the divider between columns to resize them, and move between text slots with the arrow keys.
- Hide editor chrome when printing.

## 0.1.0

First public release of `@lor-looma/editor`.

- `LoomaEditor` bound to a `LoomaStore` or an initial document, with undo, a card sidebar, an inspector, and inline text editing.
- Locales `en-US`, `zh-CN`, and `zh-TW` for the editor chrome.
- `LoomaEditorHandle.flush()` commits a debounced title, speaker notes, or open text field before export.
- External edits with an origin other than `user` flash on the canvas and can replace an open text field.
- Image upload via `uploadAsset`, and playback over the current document.
