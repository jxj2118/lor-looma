import { createLoomaStore } from '@lor-looma/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

function editable(): HTMLElement {
  const node = document.querySelector('[contenteditable="true"]');
  if (!(node instanceof HTMLElement)) throw new Error('missing editor');
  return node;
}

describe('InlineEditor', () => {
  it('shows a placeholder on an empty paragraph', () => {
    render(
      <LoomaEditor
        document={editorDocument({
          cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: '' }] }],
        })}
      />,
    );
    expect(screen.getByText('Type / for blocks')).toBeInTheDocument();
  });

  it('edits a paragraph, commits after a pause, and keeps the node selected on Escape', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(
      <LoomaEditor
        ref={ref}
        document={editorDocument({
          cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: 'Body' }] }],
        })}
      />,
    );
    await user.dblClick(screen.getByText('Body'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    editable().focus();
    await user.keyboard('!');
    await waitFor(
      () => {
        expect(ref.current?.store.getDocument().cards[0]?.body[0]).toMatchObject({ text: 'Body!' });
      },
      { timeout: 2000 },
    );

    fireEvent.keyDown(editable(), { key: 'ArrowLeft' });
    const undo = vi.spyOn(ref.current?.store ?? createLoomaStore(editorDocument()), 'undo');
    fireEvent.keyDown(editable(), { key: 'z', metaKey: true });
    expect(undo).not.toHaveBeenCalled();

    fireEvent.keyDown(editable(), { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeNull());
    expect(document.querySelector('[data-lm-editor-node="b_p"]')).toHaveAttribute('data-selected');
    expect(ref.current?.store.getDocument().cards[0]?.body[0]).toMatchObject({ text: 'Body!' });
  });

  it('edits only the targeted list item and table cell', async () => {
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
                { id: 'b_list', type: 'list', style: 'bullet', items: ['First', 'Second'] },
                {
                  id: 'b_table',
                  type: 'table',
                  header: false,
                  rows: [
                    ['A', 'B'],
                    ['C', 'D'],
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );
    await user.dblClick(screen.getByText('Second'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    editable().focus();
    await user.keyboard('!');
    fireEvent.keyDown(editable(), { key: 'Escape' });
    await waitFor(() => {
      const list = ref.current?.store.getDocument().cards[0]?.body[0];
      expect(list).toMatchObject({ items: ['First', 'Second!'] });
    });

    await user.dblClick(screen.getByText('D'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    editable().focus();
    await user.keyboard('!');
    fireEvent.keyDown(editable(), { key: 'Escape' });
    await waitFor(() => {
      const table = ref.current?.store.getDocument().cards[0]?.body[1];
      expect(table).toMatchObject({
        rows: [
          ['A', 'B'],
          ['C', 'D!'],
        ],
      });
    });
  });

  it('replaces unsaved edits when the block changes elsewhere and exits when it is deleted', async () => {
    const user = userEvent.setup();
    const store = createLoomaStore(
      editorDocument({
        cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: 'Body' }] }],
      }),
    );
    render(<LoomaEditor store={store} />);
    await user.dblClick(screen.getByText('Body'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    await user.type(editable(), 'Z');
    store.apply([{ op: 'updateNode', id: 'b_p', patch: { text: 'From AI' } }], { origin: 'ai' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/changed elsewhere/i));
    expect(editable().textContent).toContain('From AI');

    store.apply([{ op: 'deleteNode', id: 'b_p' }], { origin: 'ai' });
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeNull());
  });
});
