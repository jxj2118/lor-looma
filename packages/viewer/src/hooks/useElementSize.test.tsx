import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useElementSize } from './useElementSize';

function Probe() {
  const [ref, size] = useElementSize<HTMLDivElement>();
  return (
    <div ref={ref} data-width={size.width} data-height={size.height}>
      box
    </div>
  );
}

describe('useElementSize', () => {
  it('stays at zero when ResizeObserver is missing', () => {
    const original = globalThis.ResizeObserver;
    // @ts-expect-error deleting a host API for this case
    delete globalThis.ResizeObserver;
    try {
      const view = render(<Probe />);
      const el = view.getByText('box');
      expect(el).toHaveAttribute('data-width', '0');
      expect(el).toHaveAttribute('data-height', '0');
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
