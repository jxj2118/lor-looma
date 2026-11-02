# Changelog

## 0.1.0

First public release of `@lor-looma/editor`.

- `LoomaEditor` bound to a `LoomaStore` or an initial document, with undo, a card sidebar, an inspector, and inline text editing.
- Locales `en-US`, `zh-CN`, and `zh-TW` for the editor chrome.
- `LoomaEditorHandle.flush()` commits a debounced title, speaker notes, or open text field before export.
- External edits with an origin other than `user` flash on the canvas and can replace an open text field.
- Image upload via `uploadAsset`, and playback over the current document.
