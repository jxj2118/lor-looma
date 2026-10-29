# Looma

A card-based content editor and viewer for presentations and documents, designed to be equally easy for humans and AI to operate.

> Status: early development. APIs are not stable yet.

## Packages

| Package             | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `@lor-looma/core`   | Document model, validation, commands and undo/redo. No UI dependencies. |
| `@lor-looma/viewer` | React component for rendering and presenting Looma documents.           |
| `@lor-looma/editor` | React editor component built on the viewer.                             |

## Development

Requires [Bun](https://bun.sh) 1.4+ and Node.js 20+.

```bash
bun install
bun run dev        # start the playground
bun run test
bun run build
```

## License

[MIT](./LICENSE)
