import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

function codeArea(): HTMLTextAreaElement {
  const node = document.querySelector('textarea');
  if (!(node instanceof HTMLTextAreaElement)) throw new Error('missing code editor');
  return node;
}

describe('CodeEditor', () => {
  it('commits typed code after a pause, exits on Escape, and indents with Tab', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={editorDocument({
          cards: [
            {
              id: 'c_1',
              body: [{ id: 'b_code', type: 'code', language: 'text', code: 'const a = 1' }],
            },
          ],
        })}
      />,
    );

    await user.dblClick(screen.getByText('const a = 1'));
    await waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    expect(codeArea().selectionStart).toBe(codeArea().value.length);

    codeArea().focus();
    await user.keyboard('!');
    await waitFor(
      () => {
        expect(ref.current?.store.getDocument().cards[0]?.body[0]).toMatchObject({
          code: 'const a = 1!',
        });
      },
      { timeout: 2000 },
    );

    fireEvent.keyDown(codeArea(), { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('textarea')).toBeNull());
    expect(document.querySelector('[data-lm-editor-node="b_code"]')).toHaveAttribute(
      'data-selected',
    );
    expect(document.activeElement).toBe(document.querySelector('[data-looma-root]'));

    await user.dblClick(screen.getByText('const a = 1!'));
    await waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    const area = codeArea();
    area.setSelectionRange(0, 0);
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area.value.startsWith('  const a = 1!')).toBe(true);
    area.setSelectionRange(area.value.length, area.value.length);
    fireEvent.keyDown(area, { key: 'ArrowDown' });
    expect(document.querySelector('textarea')).not.toBeNull();
    area.setSelectionRange(0, 0);
    fireEvent.keyDown(area, { key: 'ArrowUp', shiftKey: true });
    expect(area.selectionStart).toBe(0);
    fireEvent.keyDown(area, { key: 'Escape' });
    await waitFor(() => {
      expect(ref.current?.store.getDocument().cards[0]?.body[0]).toMatchObject({
        code: '  const a = 1!',
      });
    });
  });

  it('moves to the neighboring block from the start or end of the code', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={editorDocument({
          cards: [
            {
              id: 'c_1',
              body: [
                { id: 'b_p', type: 'paragraph', text: 'Before' },
                { id: 'b_code', type: 'code', code: 'print(1)' },
                { id: 'b_after', type: 'paragraph', text: 'After' },
              ],
            },
          ],
        })}
      />,
    );
    await user.dblClick(screen.getByText('print(1)'));
    await waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    fireEvent.keyDown(codeArea(), { key: 'ArrowDown' });
    await waitFor(() =>
      expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('After'),
    );
    expect(ref.current?.getSelection().nodeIds).toEqual(['b_after']);

    await user.dblClick(screen.getByText('print(1)'));
    await waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    codeArea().setSelectionRange(0, 0);
    fireEvent.keyDown(codeArea(), { key: 'ArrowUp' });
    await waitFor(() =>
      expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('Before'),
    );
    expect(ref.current?.getSelection().nodeIds).toEqual(['b_p']);
  });
});
