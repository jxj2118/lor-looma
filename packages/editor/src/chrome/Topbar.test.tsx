import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

describe('Topbar', () => {
  it('keeps undo disabled until the document changes', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Document' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(ref.current?.store.getDocument().format).toBe('document');
  });
});
