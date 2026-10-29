import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from './index';

describe('LoomaEditor', () => {
  it('renders inside a Looma root', () => {
    render(<LoomaEditor />);
    const editor = screen.getByText('Looma editor');
    expect(editor).toHaveAttribute('data-looma-editor');
    expect(editor.closest('[data-looma-root]')).not.toBeNull();
  });
});
