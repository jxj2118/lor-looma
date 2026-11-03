# Changelog

## 0.5.0

- Synchronize the release with `@lor-looma/core` PowerPoint import. Decks produced by `importPptx` render in scroll and present mode without an API change.

## 0.4.0

- Synchronize release with `@lor-looma/editor` host integration capabilities.

## 0.3.0

- Render a `steps` container, a `stat` metric, and LaTeX `math` without an extra runtime dependency.
- Honor `focalPoint` on images and card accents.
- Open a fullscreen image preview from the viewer and from present mode. The click does not turn the page.

## 0.2.0

- Highlight code blocks with a built-in tokenizer and add a language badge plus a Copy button.
- Show speaker notes in present mode from the Notes button or the N key.
- Print cards with their theme colors and hide present chrome.

## 0.1.0

First public release of `@lor-looma/viewer`.

- `LoomaViewer` in `scroll` and `present` modes, with keyboard page turns and fullscreen.
- `LoomaCardView` and `ScaledFrame` at 1280×720 for slides and 816px wide for documents.
- Theme presets `clean`, `dark`, `warm`, and `serif` as `--lm-*` CSS variables.
- Card surfaces that switch text color when a card background is much lighter or darker than the theme.
- Overflow detection for presentation cards that exceed the slide.
