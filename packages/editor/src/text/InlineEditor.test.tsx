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

describe('structural editing and formatting', () => {
  it('splits a paragraph on Enter, indents with Tab, and bolds a selection', async () => {
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
                { id: 'b_p', type: 'paragraph', text: 'Hello' },
                { id: 'b_list', type: 'list', style: 'bullet', items: ['One', 'Two'] },
              ],
            },
          ],
        })}
      />,
    );
    await user.dblClick(screen.getByText('Hello'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: 'ArrowLeft', keyCode: 37 });
    fireEvent.keyDown(editable(), { key: 'ArrowLeft', keyCode: 37 });
    fireEvent.keyDown(editable(), { key: 'Enter', keyCode: 13 });
    await waitFor(() => {
      const body = ref.current?.store.getDocument().cards[0]?.body ?? [];
      expect(body.slice(0, 2).map((node) => ('text' in node ? node.text : node.type))).toEqual([
        'Hello',
        '',
      ]);
    });

    await user.dblClick(screen.getByText('Two'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: 'Tab' });
    await waitFor(() => {
      const list = ref.current?.store
        .getDocument()
        .cards[0]?.body.find((node) => node.type === 'list');
      expect(list).toMatchObject({ items: [{ text: 'One', children: ['Two'] }] });
    });
  });

  it('bolds the selection and rejects an unsafe link', async () => {
    const { Editor } = await import('@tiptap/core');
    const { createExtensions } = await import('./extensions');
    const { markdownToDoc, docToMarkdown } = await import('./markdown');
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new Editor({
      element: host,
      extensions: createExtensions({ mode: 'single' }),
      content: markdownToDoc('Hello', 'single'),
    });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().focus().toggleBold().run();
    expect(docToMarkdown(editor.getJSON(), 'single')).toBe('**Hello**');
    editor.chain().focus().setLink({ href: 'javascript:x' }).run();
    expect(docToMarkdown(editor.getJSON(), 'single')).not.toContain('javascript');
    editor.destroy();
    host.remove();
  });
});

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
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /changed elsewhere/i })).toBeInTheDocument(),
    );
    expect(editable().textContent).toContain('From AI');

    store.apply([{ op: 'deleteNode', id: 'b_p' }], { origin: 'ai' });
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeNull());
  });

  it('removes an empty paragraph on Backspace and outdents a nested item', async () => {
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
                { id: 'b_h', type: 'heading', level: 2, text: 'Title' },
                { id: 'b_p', type: 'paragraph', text: '' },
                {
                  id: 'b_list',
                  type: 'list',
                  style: 'bullet',
                  items: [{ text: 'Parent', children: ['Child'] }],
                },
              ],
            },
          ],
        })}
      />,
    );
    const empty = document.querySelector('[data-lm-editor-node="b_p"]');
    if (!(empty instanceof HTMLElement)) throw new Error('missing paragraph');
    await user.dblClick(empty);
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: 'Backspace' });
    await waitFor(() => {
      expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
        'b_h',
        'b_list',
      ]);
    });

    await user.dblClick(screen.getByText('Child'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: 'Tab', shiftKey: true });
    await waitFor(() => {
      const list = ref.current?.store
        .getDocument()
        .cards[0]?.body.find((node) => node.id === 'b_list');
      expect(list).toMatchObject({ items: [{ text: 'Parent' }, 'Child'] });
    });
  });

  it('moves between a paragraph and the following list item with arrow keys', async () => {
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
                { id: 'b_p', type: 'paragraph', text: 'Intro' },
                { id: 'b_list', type: 'list', style: 'bullet', items: ['One', 'Two'] },
              ],
            },
          ],
        })}
      />,
    );
    await user.dblClick(screen.getByText('Intro'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(editable(), { key: 'ArrowDown' });
    await waitFor(() => expect(editable().textContent).toContain('One'));
    expect(ref.current?.getSelection().nodeIds).toEqual(['b_list']);
    fireEvent.keyDown(editable(), { key: 'ArrowUp' });
    await waitFor(() => expect(editable().textContent).toContain('Intro'));
    expect(ref.current?.getSelection().nodeIds).toEqual(['b_p']);
  });

  it('moves to the next table cell on Tab and exits the cell on Enter', async () => {
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
    await user.dblClick(screen.getByText('A'));
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull());
    expect(screen.getByText('Row 1, Column 1')).toBeInTheDocument();
    fireEvent.keyDown(editable(), { key: 'Tab' });
    await waitFor(() =>
      expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('B'),
    );
    expect(screen.getByText('Row 1, Column 2')).toBeInTheDocument();
    fireEvent.keyDown(editable(), { key: 'Tab', shiftKey: true });
    await waitFor(() =>
      expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('A'),
    );
    expect(screen.getByText('Row 1, Column 1')).toBeInTheDocument();
    fireEvent.keyDown(editable(), { key: 'Enter' });
    await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).toBeNull());
  });

  it('flattens pasted paragraphs into one block', async () => {
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
    const clipboardData = {
      getData(type: string) {
        if (type === 'text/html') return '<p>One</p><p>Two</p>';
        if (type === 'text/plain') return 'One\n\nTwo';
        return '';
      },
    };
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    editable().dispatchEvent(event);
    await waitFor(() => {
      const text = editable().textContent ?? '';
      expect(text).toContain('One');
      expect(text).toContain('Two');
    });
  });
});
