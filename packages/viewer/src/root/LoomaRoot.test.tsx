import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoomaRoot } from '../index';

describe('LoomaRoot', () => {
  it('renders children inside a scoped root element', () => {
    render(<LoomaRoot>hello</LoomaRoot>);
    const el = screen.getByText('hello');
    expect(el).toHaveAttribute('data-looma-root');
    expect(el).toHaveAttribute('data-looma-schema', '1');
    expect(el.className).toContain('root');
  });

  it('merges a custom className', () => {
    render(<LoomaRoot className="host">x</LoomaRoot>);
    expect(screen.getByText('x').className).toMatch(/\bhost\b/);
  });
});
