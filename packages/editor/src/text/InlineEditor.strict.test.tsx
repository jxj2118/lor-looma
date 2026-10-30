import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

describe('inline editing under StrictMode', () => {
  it('keeps the editor mounted and commits on Escape', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <StrictMode>
        <LoomaEditor ref={ref} document={editorDocument()} />
      </StrictMode>,
    );
    await user.dblClick(screen.getByText('Body'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const editable = document.querySelector('[contenteditable="true"]');
    expect(editable).not.toBeNull();
    expect(editable?.textContent).toBe('Body');
    expect(ref.current?.getSelection().editingId).toBe('b_p');

    fireEvent.keyDown(editable as Element, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeNull());
    expect(ref.current?.getSelection().nodeIds).toEqual(['b_p']);
    expect(document.activeElement?.hasAttribute('data-looma-root')).toBe(true);

    fireEvent.keyDown(document.activeElement as Element, { key: 'Backspace' });
    await waitFor(() => expect(screen.queryByText('Body')).toBeNull());
  });

  it('keeps the code editor mounted', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <LoomaEditor
          document={editorDocument({
            cards: [{ id: 'c_1', body: [{ id: 'b_code', type: 'code', code: 'let x = 1' }] }],
          })}
        />
      </StrictMode>,
    );
    await user.dblClick(screen.getByText('let x = 1'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('textarea')?.value).toBe('let x = 1');
  });
});
