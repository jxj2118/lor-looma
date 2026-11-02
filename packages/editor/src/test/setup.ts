import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

configure({
  defaultIgnore: 'script, style, [data-lm-preview], [data-lm-preview] *',
});

afterEach(() => cleanup());

// ProseMirror measures layout that jsdom does not implement.
const rect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON() {
    return this;
  },
};
Range.prototype.getBoundingClientRect = () => rect as DOMRect;
Range.prototype.getClientRects = () =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;
if (!document.elementFromPoint) document.elementFromPoint = () => null;

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
