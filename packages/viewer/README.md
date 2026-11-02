# @lor-looma/viewer

React renderer for [Looma](https://github.com/lor-looma/looma) documents. It draws cards, scales them into the available space, and can present them one at a time. It does not edit.

```bash
bun add @lor-looma/viewer @lor-looma/core react react-dom
```

Import the stylesheet once. Component CSS is extracted into that file.

```tsx
import { LoomaViewer } from '@lor-looma/viewer';
import '@lor-looma/viewer/style.css';

export function Deck({ doc }) {
  return <LoomaViewer document={doc} mode="scroll" />;
}
```

Pass a `document` for a static tree, or a `store` from `createLoomaStore` when the document changes. If both are set, the store wins.

## Modes

`mode="scroll"` stacks every card in a scrolling column. `mode="present"` shows one card and fills the frame.

```tsx
const ref = useRef<LoomaViewerHandle>(null);

<LoomaViewer
  ref={ref}
  store={store}
  mode="present"
  page={page}
  onPageChange={setPage}
  onOverflow={(ids) => console.log('overflow', ids)}
/>;

await ref.current?.enterFullscreen();
ref.current?.next();
```

In present mode the root is focusable. Arrow keys, Space, Page Down, Home, and End change the page. Clicking the right half of the slide advances; the left half goes back. Links are not treated as page turns.

`onOverflow` reports card ids whose content is taller than the 1280×720 slide. It is only measured for `presentation` format. Document pages are not clipped, so they do not overflow.

## Layout

Presentation cards use a logical size of 1280×720. Document cards use a logical width of 816 and grow with their content. `ScaledFrame` measures the container and scales the card with a CSS transform. Theme colors, fonts, radius, and spacing are CSS variables on the root (`--lm-color-bg`, `--lm-color-fg`, `--lm-font-heading`, and the rest). A card whose own background is much lighter or darker than the theme swaps the text palette so the copy stays readable.

## Themes

```tsx
store.apply([{ op: 'setTheme', preset: 'serif' }]);
store.apply([{ op: 'setTheme', overrides: { colorPrimary: '#8b2e2e', radius: 4 } }]);
```

Presets are `clean`, `dark`, `warm`, and `serif`. Overrides are listed in the [schema reference](../../docs/schema-reference.md).

## One card, and custom assets

`LoomaCardView` renders a single card. Use it when you are building your own frame. `resolveAsset(asset, id)` turns an asset record into a URL. The default is `asset.src`.

```tsx
import { LoomaCardView } from '@lor-looma/viewer';

<LoomaCardView card={doc.cards[0]} document={doc} resolveAsset={(asset) => asset.src} />;
```

`renderNode` replaces the default block renderer for a node. Return `undefined` to keep the default.

## Props

| Prop                   | Default        | Meaning                                          |
| ---------------------- | -------------- | ------------------------------------------------ |
| `document`             |                | Static document. Ignored when `store` is set.    |
| `store`                |                | Live store. The view re-renders when it changes. |
| `mode`                 | `scroll`       | `scroll` or `present`.                           |
| `page` / `defaultPage` | `0`            | Present-mode page. `page` is controlled.         |
| `onPageChange`         |                | Called when the page changes.                    |
| `resolveAsset`         | `asset.src`    | Map an image asset to a URL.                     |
| `onOverflow`           |                | Card ids that exceed the slide.                  |
| `maxScale`             | format default | Cap on scale-up. Documents default to `1`.       |
| `showPageNumber`       | `true`         | Page indicator in present mode.                  |
| `onFullscreenChange`   |                | Fullscreen entered or left on this viewer.       |
| `renderNode`           |                | Optional custom block renderer.                  |

The handle exposes `next`, `prev`, `goTo`, `enterFullscreen`, and `exitFullscreen`.

More integration notes are in [Usage](../../docs/usage.md).

## License

[MIT](../../LICENSE)
