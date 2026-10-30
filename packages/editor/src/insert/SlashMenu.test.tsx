import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

function editable(): HTMLElement {
  const node = document.querySelector('[contenteditable="true"]');
  if (!(node instanceof HTMLElement)) throw new Error('missing editor');
  return node;
}

describe('SlashMenu', () => {
  it('turns an empty paragraph into a heading from /h2 and keeps the slash on Escape', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={editorDocument({
          cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: '' }] }],
        })}
      />,
    );
    const block = document.querySelector('[data-lm-editor-node="b_p"]');
    if (!(block instanceof HTMLElement)) throw new Error('missing block');
    await user.dblClick(block);
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: '/' });
    await waitFor(() => expect(document.querySelector('[data-lm-slash]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: 'h' });
    fireEvent.keyDown(editable(), { key: '2' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Heading 2' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Paragraph' })).toBeNull();
    });
    fireEvent.keyDown(editable(), { key: 'Enter' });
    await waitFor(() => {
      expect(ref.current?.store.getDocument().cards[0]?.body[0]).toMatchObject({
        id: 'b_p',
        type: 'heading',
        level: 2,
      });
    });
    expect(JSON.stringify(ref.current?.store.getDocument())).not.toContain('/h2');
  });
});
