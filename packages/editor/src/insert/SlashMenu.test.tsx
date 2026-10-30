import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

function plusButton(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector('button[aria-label="Add a block"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('missing add button');
  return button;
}

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

  it('keeps the text caret when the slash menu opens from a paragraph', async () => {
    const user = userEvent.setup();
    render(
      <LoomaEditor
        document={editorDocument({
          cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: '' }] }],
        })}
      />,
    );
    const block = document.querySelector('[data-lm-editor-node="b_p"]');
    if (!(block instanceof HTMLElement)) throw new Error('missing block');
    await user.dblClick(block);
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    const field = editable();
    field.focus();
    fireEvent.keyDown(field, { key: '/' });
    await waitFor(() => expect(document.querySelector('[data-lm-slash]')).not.toBeNull());
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[data-lm-slash]')).toBeNull());
    expect(field.textContent).toContain('/');
  });

  it('inserts a divider from the hover button and an image from a URL', async () => {
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
    const block = document.querySelector('[data-lm-editor-node="b_p"]');
    if (!(block instanceof HTMLElement)) throw new Error('missing block');
    fireEvent.pointerMove(block);
    await user.click(plusButton(block));
    const search = screen.getByRole('textbox', { name: 'Search blocks' });
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    await user.type(search, 'div');
    await user.click(screen.getByRole('button', { name: 'Divider' }));
    await waitFor(() => {
      expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.type)).toEqual([
        'paragraph',
        'divider',
      ]);
    });

    fireEvent.pointerMove(block);
    await user.click(plusButton(block));
    await user.type(screen.getByRole('textbox', { name: 'Search blocks' }), 'image');
    await user.click(screen.getByRole('button', { name: 'Image' }));
    const url = screen.getByRole('textbox', { name: 'https://' });
    await user.type(url, 'notaurl');
    const invalidForm = url.closest('form');
    if (!invalidForm) throw new Error('missing url form');
    fireEvent.submit(invalidForm);
    expect(screen.getByText(/Image URL must start/)).toBeInTheDocument();
    await user.clear(url);
    await user.type(url, 'https://example.com/leaf.png');
    const validForm = url.closest('form');
    if (!validForm) throw new Error('missing url form');
    fireEvent.submit(validForm);
    await waitFor(() => {
      const body = ref.current?.store.getDocument().cards[0]?.body ?? [];
      expect(body.some((node) => node.type === 'image')).toBe(true);
    });
  });

  it('uploads an image and reports a failed upload', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    const uploadAsset = vi.fn(async () => ({ src: 'https://cdn.example/a.png', alt: 'Leaf' }));
    render(
      <LoomaEditor
        ref={ref}
        uploadAsset={uploadAsset}
        document={editorDocument({
          cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: 'Body' }] }],
        })}
      />,
    );
    const block = document.querySelector('[data-lm-editor-node="b_p"]');
    if (!(block instanceof HTMLElement)) throw new Error('missing block');
    fireEvent.pointerMove(block);
    await user.click(plusButton(block));
    await user.type(screen.getByRole('textbox', { name: 'Search blocks' }), 'image');
    await user.click(screen.getByRole('button', { name: 'Image' }));
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('missing file input');
    const file = new File(['img'], 'leaf.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadAsset).toHaveBeenCalledWith(file);
      expect(
        ref.current?.store.getDocument().cards[0]?.body.some((node) => node.type === 'image'),
      ).toBe(true);
    });

    uploadAsset.mockRejectedValueOnce(new Error('nope'));
    fireEvent.pointerMove(block);
    await user.click(plusButton(block));
    await user.type(screen.getByRole('textbox', { name: 'Search blocks' }), 'image');
    await user.click(screen.getByRole('button', { name: 'Image' }));
    const again = document.querySelector('input[type="file"]');
    if (!(again instanceof HTMLInputElement)) throw new Error('missing file input');
    fireEvent.change(again, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Image upload failed');
    });
  });

  it('hides layout blocks when the paragraph is already at the nesting limit', async () => {
    const user = userEvent.setup();
    render(
      <LoomaEditor
        document={editorDocument({
          cards: [
            {
              id: 'c_1',
              body: [
                {
                  id: 'n_cols',
                  type: 'columns',
                  widths: [1, 1],
                  children: [
                    [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
                    [
                      {
                        id: 'n_stack',
                        type: 'stack',
                        children: [{ id: 'b_inner', type: 'paragraph', text: 'Inner' }],
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );
    const inner = document.querySelector('[data-lm-editor-node="b_inner"]');
    if (!(inner instanceof HTMLElement)) throw new Error('missing inner block');
    fireEvent.pointerMove(inner);
    await user.click(plusButton(inner));
    expect(screen.getByRole('button', { name: 'Paragraph' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Columns (2)' })).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Search blocks' }), 'zzzz');
    expect(screen.getByText('No matching blocks')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search blocks' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('No matching blocks')).toBeNull());
  });

  it('opens the menu on an empty card', async () => {
    const user = userEvent.setup();
    render(
      <LoomaEditor
        document={editorDocument({
          cards: [{ id: 'c_1', body: [] }],
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add a block' }));
    expect(screen.getByRole('textbox', { name: 'Search blocks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 1' })).toBeInTheDocument();
  });
});
