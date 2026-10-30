import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineText } from './InlineText';

describe('InlineText', () => {
  it('renders plain text', () => {
    render(<InlineText text="Photosynthesis" />);
    expect(screen.getByText('Photosynthesis').tagName).toBe('SPAN');
  });

  it('renders a line break', () => {
    const { container } = render(<InlineText text={'light\nwater'} />);
    expect(container.querySelector('br')).not.toBeNull();
    expect(screen.getByText(/light/)).toBeInTheDocument();
    expect(screen.getByText(/water/)).toBeInTheDocument();
  });

  it('renders inline code', () => {
    render(<InlineText text="use `CO2`" />);
    const code = screen.getByText('CO2');
    expect(code.tagName).toBe('CODE');
    expect(code.className).toContain('code');
  });

  it('renders bold, italic, and strike', () => {
    const { container } = render(<InlineText text="**sun** *air* ~~heat~~" />);
    expect(container.querySelector('strong')?.textContent).toBe('sun');
    expect(container.querySelector('em')?.textContent).toBe('air');
    expect(container.querySelector('s')?.textContent).toBe('heat');
  });

  it('renders a safe link', () => {
    render(<InlineText text="[the leaf](https://example.com/leaf)" />);
    const link = screen.getByRole('link', { name: 'the leaf' });
    expect(link).toHaveAttribute('href', 'https://example.com/leaf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render a javascript link as an anchor', () => {
    const { container } = render(<InlineText text="[click](javascript:alert(1))" />);
    expect(container.querySelector('a')).toBeNull();
    const unsafe = container.querySelector('[data-lm-unsafe-link]');
    expect(unsafe?.textContent).toBe('click');
    expect(unsafe?.tagName).toBe('SPAN');
  });

  it('maps theme colors and palette colors to variables', () => {
    const { container } = render(
      <InlineText text="{color:primary}energy{/color} and {color:green}leaves{/color}" />,
    );
    const spans = container.querySelectorAll('.color');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.getAttribute('style')).toContain('var(--lm-color-primary)');
    expect(spans[1]?.getAttribute('style')).toContain('var(--lm-palette-green)');
  });

  it('renders a highlight mark', () => {
    const { container } = render(<InlineText text="{highlight:yellow}glucose{/highlight}" />);
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('glucose');
    expect(mark?.className).toContain('highlight');
    expect(mark?.getAttribute('style')).toContain('var(--lm-highlight-yellow)');
  });

  it('shows script-like text as text', () => {
    const { container } = render(<InlineText text="<script>alert(1)</script>" />);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('can render as a paragraph and keeps a class name', () => {
    render(<InlineText as="p" className="lead" text="A quiet factory" />);
    const el = screen.getByText('A quiet factory');
    expect(el.tagName).toBe('P');
    expect(el.className).toContain('lead');
  });
});
