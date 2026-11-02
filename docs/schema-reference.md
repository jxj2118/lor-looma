# Schema reference

A `.looma` file is JSON. The schema version is the number `1` in the `looma` field. Ids are strings: a letter, then letters, digits, `_`, or `-`, at most 64 characters. Generated ids use the prefixes `doc_`, `c_`, `n_`, `b_`, and `img_`. You may choose ids yourself as long as they are unique in the document.

`parseDocument` is the supported way to accept JSON. The Zod schemas exported from `@lor-looma/core` describe the same shape, but repair and the semantic checks (asset references, container depth, list depth) live in the parser.

## Document

| Field    | Type                         | Default               | Notes                                                              |
| -------- | ---------------------------- | --------------------- | ------------------------------------------------------------------ |
| `looma`  | `1`                          | required              | Schema version. Missing version is assumed to be 1 when repairing. |
| `id`     | id                           | generated             | Document id.                                                       |
| `title`  | string                       | `""`                  | Shown in the editor toolbar. Not a card.                           |
| `format` | `presentation` \| `document` | `presentation`        | Switching format keeps the cards.                                  |
| `theme`  | theme                        | `{ preset: "clean" }` | See [Themes](#themes).                                             |
| `assets` | map of id to asset           | `{}`                  | Image bytes live behind `src`.                                     |
| `cards`  | card[]                       | `[]`                  | Order is the reading order.                                        |

An image asset is `{ "kind": "image", "src", "alt"?, "width"?, "height"? }`. `src` must start with `http://`, `https://`, or `data:image/`.

## Cards

| Field        | Type       | Notes                                                            |
| ------------ | ---------- | ---------------------------------------------------------------- |
| `id`         | id         | Required once the document is stored. Omitted ids are generated. |
| `body`       | node[]     | Ordered top-level nodes. Default `[]`.                           |
| `notes`      | string     | Speaker script. Not drawn on the card.                           |
| `accent`     | accent     | Decorative image. `{ "position", "assetId" }`.                   |
| `background` | background | Fill behind the card content.                                    |

`accent.position` is `left`, `right`, `top`, or `background`. `assetId` must name an image in `assets`.

`background` is one of:

- `{ "kind": "color", "value" }`
- `{ "kind": "gradient", "from", "to", "angle"? }` — `angle` defaults to 135 and must be from 0 to 360
- `{ "kind": "image", "assetId" }`

Color fields accept `#rgb`, `#rrggbb`, `rgb(r, g, b)`, or `hsl(h, s%, l%)`.

## Containers

A card body is depth 0. Containers may sit at depth 0 and depth 1 only, so the tree holds at most two container levels. The third level is blocks only. A `columns` container inside a `stack` is already the second level; its cells must hold blocks.

| Type      | Fields                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`   | `children` (flat list). Optional `gap`: `none`, `sm`, `md`, `lg`.                                                                                             |
| `columns` | `widths` (2 to 4 positive numbers) and `children` (one array per column, same length). Optional `gap`. Optional `align`: `start`, `center`, `end`, `stretch`. |
| `grid`    | `children` (flat list). `columns` is 2, 3, or 4 and defaults to 2. Optional `gap`.                                                                            |

`wrapNodes` into `columns` needs 2 to 4 adjacent siblings. Its `widths` are optional and default to equal columns. `insertNode` of a `columns` node must include `widths`.

## Blocks

All blocks have `id` and `type`. Inline fields (`text`, `caption`, `cite`, list items, table cells) use the [inline subset](#inline-text). `code` does not.

| Type        | Fields                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `heading`   | `level` 1, 2, or 3. `text`.                                                                                  |
| `paragraph` | `text`. Optional `align`: `left`, `center`, `right`.                                                         |
| `list`      | `style`: `bullet` (default), `number`, or `check`. `items`.                                                  |
| `image`     | `assetId`. Optional `fit` `cover` or `contain`, `caption`, `width` `auto` or `full`.                         |
| `table`     | `rows`: array of arrays of strings, at least one row, every row the same length. `header` defaults to false. |
| `callout`   | `tone`: `info` (default), `success`, `warning`, `danger`, `note`. `text`.                                    |
| `quote`     | `text`. Optional `cite`.                                                                                     |
| `divider`   | No other fields.                                                                                             |
| `code`      | `code` is plain text. Optional `language`, at most 32 characters.                                            |

A list item is a string or `{ "text", "checked"?, "children"? }`. `checked` is meaningful for `check` lists. `children` uses the same item shape. Lists nest at most 3 levels.

An unrecognized block type is kept as `{ "type": "unknown", "raw" }` so a newer writer does not destroy data an older reader can still round-trip. The editor shows those blocks as unsupported and will not rewrite their fields.

## Inline text

Inline fields accept this markup and nothing else:

- `**bold**`, `*italic*`, `~~strike~~`
- inline code wrapped in single backticks
- links: `[label](https://example.com)`. The href must be `http`, `https`, or `mailto`
- color: `{color:name}...{/color}`. Names: `primary`, `accent`, `muted`, `info`, `success`, `warning`, `danger`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `gray`
- highlight: `{highlight:name}...{/highlight}`. Names: `yellow`, `green`, `blue`, `pink`, `purple`, `orange`, `red`, `gray`
- one newline is a line break. A blank line is allowed only in `callout` and `quote`, where it starts another paragraph
- a literal `*`, `~`, backtick, bracket, or brace is written with a backslash

Do not use HTML. Do not put images in inline text. Headings, lists, quotes, and tables are blocks, not characters inside `text`. A heading's `text` is the words only; the `#` level is the `level` field.

## Themes

`theme.preset` is `clean`, `dark`, `warm`, or `serif`.

| Preset  | Background | Text      | Heading font |
| ------- | ---------- | --------- | ------------ |
| `clean` | `#f6f7f9`  | `#1f2328` | sans         |
| `dark`  | `#0b0f17`  | `#e6edf3` | sans         |
| `warm`  | `#f6ede1`  | `#3b2f2a` | rounded      |
| `serif` | `#efece4`  | `#1c1b19` | serif        |

`theme.overrides` may set any of these. A value of `null` in `setTheme` removes that override. Unknown keys are rejected.

| Key                                                                     | Values                                       |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| `colorBg`, `colorFg`, `colorMuted`, `colorPrimary`, `colorAccent`       | CSS color                                    |
| `colorInfo`, `colorSuccess`, `colorWarning`, `colorDanger`, `colorNote` | CSS color                                    |
| `cardBackground`                                                        | CSS color                                    |
| `fontHeading`, `fontBody`, `fontMono`                                   | `system`, `sans`, `serif`, `rounded`, `mono` |
| `fontScale`                                                             | number from 0.8 to 1.4                       |
| `radius`                                                                | integer from 0 to 32                         |
| `spacing`                                                               | number from 0.75 to 1.5                      |

Font names map to built-in stacks. Hosts that want a webfont can still set the matching stack; Looma does not download fonts.

`setTheme` needs a preset, an overrides object, or both. Sending neither is an error.

## Locations

Node locations, used by `insertNode` and `moveNode`:

- `{ "before": "<nodeId>" }` or `{ "after": "<nodeId>" }` — a sibling. The id must be a node, not a card.
- `{ "parent": "<cardOrContainerId>" }` — append. Add `"index"` (from 0) to choose the position.
- `{ "parent": "<columnsId>", "slot": 0, "index": 1 }` — one column. `slot` is required when the parent is `columns`, and forbidden on a card, stack, or grid.

Card locations, used by `insertCard` and `moveCard`:

- `{ "before": "<cardId>" }`, `{ "after": "<cardId>" }`, or `{ "index": 0 }`
- omit `at` on `insertCard` to append

## Commands

`updateNode` shallow-merges `patch` and cannot set `id`, `type`, or `children`. Set an optional field to `null` to remove it. To change a block's type, use `replaceNode`. To change a container's children, insert, move, or delete the children, or replace the container.

`updateCard` patches `accent`, `background`, and `notes`. `null` clears a field.

`putAsset` adds or replaces an image. Omit `id` to generate one. `removeAsset` deletes an asset that nothing still references.

`duplicateCard` copies a card to the slot after the original and assigns new ids. `deleteCard` removes the card and its nodes. Assets are left in place until something removes them.

The full command list and the error strings a model sees are in [AI integration](ai-integration.md).
