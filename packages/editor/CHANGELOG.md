# Changelog

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
