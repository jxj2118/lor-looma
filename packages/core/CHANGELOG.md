# Changelog

## 0.6.1

- Fix workspace dependency version resolution for the 0.6.x release line.

## 0.6.0

- Upgrade `.looma` schema to v2 (`LOOMA_SCHEMA_VERSION = 2`) with `LoomaScene` support (`shape`, `image`, and `text` elements with exact coordinates, aspect ratios, `srcRect` crops, and per-run typography), lossless v1 migration, and `updateSceneElement` command.
- Switch `importPptx` to preserve original slide layout (`mode: 'scene'`) by default while keeping `mode: 'flow'` as an explicit option and reporting unsupported objects via `diagnostics`.

## 0.5.0

- Import a `.pptx` file with `importPptx`. Each slide becomes a card with headings, paragraphs, nested lists, tables, images, columns, backgrounds, accents, and speaker notes.
- Read and write ZIP archives, and parse Office XML, with no added runtime dependency. Pass `uploadAsset` to store extracted images in the host's own storage.

## 0.4.0

- Synchronize release with `@lor-looma/editor` host integration capabilities.

## 0.3.0

- Add a `steps` container, `stat` and `math` blocks, and an optional `focalPoint` on image blocks and card accents.
- Document the new nodes in the model guide. Existing v1 documents stay valid.

## 0.2.0

- Add `splitCard` to move the tail of a card onto a new card without copying node ids.
- Document `splitCard` in the model guide and the generated tool schema.

## 0.1.0

First public release of `@lor-looma/core`.

- `.looma` v1 document model: cards, three containers, nine blocks, inline text, and four theme presets.
- `parseDocument` with optional repair, semantic checks, and structured issues.
- Atomic command batches and a 200-step undo stack with a merge window.
- `getOutline` and `getCards` for compact and full reads.
- `@lor-looma/core/ai`: `LOOMA_AI_GUIDE`, `getToolDefinitions` for OpenAI, Anthropic, and JSON Schema, and `createToolHandler`.
