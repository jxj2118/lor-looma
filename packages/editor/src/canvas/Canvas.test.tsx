import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

describe('Canvas', () => {
  it('shows an empty state that can add the first card', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument({ cards: [] })} />);
    expect(screen.getByText('This document has no cards.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(ref.current?.store.getDocument().cards).toHaveLength(1);
    expect(screen.queryByText('This document has no cards.')).toBeNull();
  });
});
