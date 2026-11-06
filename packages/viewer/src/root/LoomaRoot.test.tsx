import { render, screen } from '@testing-library/react';
import type { CSSProperties } from 'react';
import { describe, expect, it } from 'vitest';
import { LoomaRoot } from '../index';

describe('LoomaRoot', () => {
  it('renders children inside a scoped root element', () => {
    render(<LoomaRoot>hello</LoomaRoot>);
    const el = screen.getByText('hello');
    expect(el).toHaveAttribute('data-looma-root');
    expect(el).toHaveAttribute('data-looma-schema', '2');
    expect(el.className).toContain('root');
  });

  it('merges a custom className', () => {
    render(<LoomaRoot className="host">x</LoomaRoot>);
    expect(screen.getByText('x').className).toMatch(/\bhost\b/);
  });

  it('applies theme variables and the preset attribute', () => {
    render(<LoomaRoot theme={{ preset: 'dark' }}>themed</LoomaRoot>);
    const el = screen.getByText('themed');
    expect(el).toHaveAttribute('data-looma-theme', 'dark');
    expect(el.style.getPropertyValue('--lm-color-primary')).toBe('#60a5fa');
    expect(el.style.getPropertyValue('--lm-color-bg')).toBe('#0b0f17');
  });

  it('lets the caller style override theme variables', () => {
    const style = { '--lm-color-primary': '#abcdef' } as CSSProperties;
    render(
      <LoomaRoot theme={{ preset: 'clean' }} style={style}>
        override
      </LoomaRoot>,
    );
    const el = screen.getByText('override');
    expect(el).toHaveAttribute('data-looma-theme', 'clean');
    expect(el.style.getPropertyValue('--lm-color-primary')).toBe('#abcdef');
    expect(el.style.getPropertyValue('--lm-color-fg')).toBe('#1f2328');
  });
});
