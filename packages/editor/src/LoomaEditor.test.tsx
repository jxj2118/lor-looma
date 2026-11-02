import { createLoomaStore } from '@lor-looma/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from './index';
import type { LoomaEditorHandle } from './index';
import { editorDocument } from './test/fixture';

function layoutDocument() {
  return editorDocument({
    cards: [
      {
        id: 'c_1',
        body: [
          { id: 'b_1', type: 'paragraph', text: 'One' },
          { id: 'b_2', type: 'paragraph', text: 'Two' },
          { id: 'b_3', type: 'paragraph', text: 'Three' },
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'paragraph', text: 'Right' }],
            ],
          },
        ],
      },
      { id: 'c_2', body: [{ id: 'b_other', type: 'paragraph', text: 'Other' }] },
    ],
  });
}

function selectedNodes(): string[] {
  return [...document.querySelectorAll('[data-lm-editor-node][data-selected]')].map(
    (element) => element.getAttribute('data-lm-editor-node') ?? '',
  );
}

function editorRoot(): HTMLElement {
  const root = document.querySelector('[data-looma-root]');
  if (!(root instanceof HTMLElement)) throw new Error('missing editor root');
  return root;
}

function canvas(): HTMLElement {
  const element = document.querySelector('[data-lm-editor-canvas]');
  if (!(element instanceof HTMLElement)) throw new Error('missing canvas');
  return element;
}

describe('LoomaEditor', () => {
  it('edits the title on blur as a single undo step', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('Field notes');
    await user.type(title, ' abc');
    await user.tab();
    expect(ref.current?.store.getDocument().title).toBe('Field notes abc');
    expect(ref.current?.store.canUndo()).toBe(true);
    ref.current?.store.undo();
    expect(ref.current?.store.getDocument().title).toBe('Field notes');
    expect(ref.current?.store.canUndo()).toBe(false);
  });

  it('undoes and redoes from the toolbar', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Document' }));
    expect(ref.current?.store.getDocument().format).toBe('document');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(ref.current?.store.getDocument().format).toBe('presentation');
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(ref.current?.store.getDocument().format).toBe('document');
  });

  it('changes the theme preset', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'warm');
    expect(ref.current?.store.getDocument().theme.preset).toBe('warm');
  });

  it('follows an external store and reports changes', () => {
    const store = createLoomaStore(editorDocument());
    const onChange = vi.fn();
    render(<LoomaEditor store={store} onChange={onChange} />);
    act(() => {
      store.apply([{ op: 'updateNode', id: 'b_h', patch: { text: 'Changed' } }], {
        origin: 'user',
      });
    });
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(
      store.getDocument(),
      expect.objectContaining({ kind: 'apply', origin: 'user' }),
    );
  });

  it('loads a replacement document and clears history', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    const first = editorDocument();
    const { rerender } = render(<LoomaEditor ref={ref} document={first} />);
    await user.click(screen.getByRole('button', { name: 'Document' }));
    expect(ref.current?.store.canUndo()).toBe(true);
    rerender(
      <LoomaEditor
        ref={ref}
        document={editorDocument({
          title: 'Replacement',
          cards: [{ id: 'c_new', body: [{ id: 'b_new', type: 'paragraph', text: 'Fresh' }] }],
        })}
      />,
    );
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(ref.current?.store.getDocument().title).toBe('Replacement');
    expect(ref.current?.store.canUndo()).toBe(false);
  });

  it('inserts a card after the selection', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    ref.current?.select(['c_1']);
    await user.click(within(canvas()).getByRole('button', { name: 'Add card' }));
    const cards = ref.current?.store.getDocument().cards ?? [];
    expect(cards).toHaveLength(3);
    expect(cards[1]?.id).not.toBe('c_2');
    expect(cards[2]?.id).toBe('c_2');
    expect(cards[1]?.body[0]).toMatchObject({ type: 'heading', level: 2, text: '' });
    expect(ref.current?.getSelection().cardId).toBe(cards[1]?.id);
  });

  it('opens the present view and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<LoomaEditor document={editorDocument()} />);
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(document.querySelector('[data-lm-present-fit]')).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-lm-present-fit]')).toBeNull();
  });

  it('hides editing controls when read only', () => {
    render(<LoomaEditor document={editorDocument()} readOnly />);
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
    expect(screen.getByText('Field notes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add card' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('scrolls the requested card into view', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    expect(ref.current?.store.getDocument().id).toBe('doc_edit');
    ref.current?.scrollTo('c_2');
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  });

  it('selects a node, extends to siblings, and falls back across columns', () => {
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={layoutDocument()} />);
    fireEvent.click(screen.getByText('One'));
    expect(selectedNodes()).toEqual(['b_1']);
    fireEvent.click(screen.getByText('Three'), { shiftKey: true });
    expect(selectedNodes()).toEqual(['b_1', 'b_2', 'b_3']);
    fireEvent.click(screen.getByText('Left'));
    fireEvent.click(screen.getByText('Right'), { shiftKey: true });
    expect(selectedNodes()).toEqual(['b_right']);
  });

  it('selects a card from its padding and clears the selection from the canvas', () => {
    render(<LoomaEditor document={layoutDocument()} />);
    fireEvent.click(screen.getByText('One'));
    const card = document.querySelector('[data-lm-card-id="c_1"]');
    if (!(card instanceof HTMLElement)) throw new Error('missing card');
    fireEvent.click(card);
    expect(document.querySelector('[data-lm-editor-card="c_1"]')).toHaveAttribute('data-selected');
    expect(selectedNodes()).toEqual([]);
    const canvas = document.querySelector('.canvas');
    if (!(canvas instanceof HTMLElement)) throw new Error('missing canvas');
    fireEvent.click(canvas);
    expect(document.querySelector('[data-selected]')).toBeNull();
  });

  it('walks selection up to the card with Escape', () => {
    render(<LoomaEditor document={layoutDocument()} />);
    fireEvent.click(screen.getByText('Left'));
    const root = editorRoot();
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(selectedNodes()).toEqual(['n_cols']);
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(selectedNodes()).toEqual([]);
    expect(document.querySelector('[data-lm-editor-card="c_1"]')).toHaveAttribute('data-selected');
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(document.querySelector('[data-selected]')).toBeNull();
  });

  it('deletes the selected node, selects the next sibling, and restores it with undo', () => {
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={layoutDocument()} />);
    fireEvent.click(screen.getByText('One'));
    const root = editorRoot();
    fireEvent.keyDown(root, { key: 'Backspace' });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
      'b_2',
      'b_3',
      'n_cols',
    ]);
    expect(selectedNodes()).toEqual(['b_2']);
    fireEvent.keyDown(root, { key: 'z', metaKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toContain('b_1');
  });

  it('keeps the other card mounted when the selection changes', () => {
    render(<LoomaEditor document={layoutDocument()} />);
    const other = document.querySelector('[data-lm-card-id="c_2"]');
    fireEvent.click(screen.getByText('One'));
    expect(document.querySelector('[data-lm-card-id="c_2"]')).toBe(other);
    expect(selectedNodes()).toEqual(['b_1']);
  });

  it('flashes external edits and drops that highlight for user edits or when disabled', () => {
    vi.useFakeTimers();
    try {
      const store = createLoomaStore(layoutDocument());
      const { rerender } = render(<LoomaEditor store={store} />);
      act(() => {
        store.apply([{ op: 'updateNode', id: 'b_1', patch: { text: 'Edited' } }], { origin: 'ai' });
      });
      expect(document.querySelector('[data-lm-editor-node="b_1"]')).toHaveAttribute('data-flash');
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(document.querySelector('[data-lm-editor-node="b_1"]')).not.toHaveAttribute(
        'data-flash',
      );

      act(() => {
        store.apply([{ op: 'updateNode', id: 'b_1', patch: { text: 'Mine' } }], { origin: 'user' });
      });
      expect(document.querySelector('[data-lm-editor-node="b_1"]')).not.toHaveAttribute(
        'data-flash',
      );

      rerender(<LoomaEditor store={store} highlightExternalChanges={false} />);
      act(() => {
        store.apply([{ op: 'updateNode', id: 'b_2', patch: { text: 'Nope' } }], { origin: 'ai' });
      });
      expect(document.querySelector('[data-lm-editor-node="b_2"]')).not.toHaveAttribute(
        'data-flash',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a selection when that node is deleted elsewhere', () => {
    const store = createLoomaStore(layoutDocument());
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} store={store} />);
    act(() => {
      ref.current?.select(['b_1']);
    });
    act(() => {
      store.apply([{ op: 'deleteNode', id: 'b_1' }], { origin: 'ai' });
    });
    expect(ref.current?.getSelection().nodeIds).not.toContain('b_1');
  });

  it('toggles a check, clears hover, and starts editing with Enter', () => {
    render(
      <LoomaEditor
        document={editorDocument({
          cards: [
            {
              id: 'c_1',
              body: [
                {
                  id: 'b_list',
                  type: 'list',
                  style: 'check',
                  items: [{ text: 'Done', checked: false }],
                },
                { id: 'b_d', type: 'divider' },
              ],
            },
          ],
        })}
      />,
    );
    const mark = document.querySelector('[data-lm-editor-node="b_list"] [aria-hidden="true"]');
    if (!(mark instanceof Element)) throw new Error('missing check mark');
    fireEvent.click(mark);
    const list = document.querySelector('[data-lm-editor-node="b_list"]');
    expect(list?.textContent).toContain('☑');

    const item = screen.getByText('Done');
    fireEvent.pointerMove(item);
    expect(document.querySelector('[data-lm-editor-node="b_list"]')).toHaveAttribute(
      'data-hovered',
    );
    const canvas = document.querySelector('.canvas');
    if (!(canvas instanceof HTMLElement)) throw new Error('missing canvas');
    fireEvent.pointerLeave(canvas);
    expect(document.querySelector('[data-hovered]')).toBeNull();

    fireEvent.click(item);
    fireEvent.keyDown(editorRoot(), { key: 'Enter' });
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();

    const field = document.querySelector('[contenteditable="true"]');
    if (field instanceof HTMLElement) fireEvent.keyDown(field, { key: 'Escape' });
    const divider = document.querySelector('[data-lm-editor-node="b_d"]');
    if (!(divider instanceof HTMLElement)) throw new Error('missing divider');
    fireEvent.pointerDown(divider);
    fireEvent.click(divider);
    fireEvent.keyDown(editorRoot(), { key: 'Enter' });
    expect(document.querySelector('textarea, [contenteditable="true"]')).toBeNull();
  });

  it('deletes a selected card and restores it with redo', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={layoutDocument()} />);
    const card = document.querySelector('[data-lm-card-id="c_1"]');
    if (!(card instanceof HTMLElement)) throw new Error('missing card');
    fireEvent.click(card);
    fireEvent.keyDown(editorRoot(), { key: 'Backspace' });
    expect(ref.current?.store.getDocument().cards.map((item) => item.id)).toEqual(['c_2']);
    fireEvent.keyDown(editorRoot(), { key: 'z', metaKey: true });
    expect(ref.current?.store.getDocument().cards.map((item) => item.id)).toEqual(['c_1', 'c_2']);
    fireEvent.keyDown(editorRoot(), { key: 'y', ctrlKey: true });
    expect(ref.current?.store.getDocument().cards.map((item) => item.id)).toEqual(['c_2']);

    await user.click(screen.getByRole('button', { name: 'Presentation' }));
    expect(ref.current?.store.getDocument().format).toBe('presentation');
  });

  it('clears an external-change notice after a few seconds', () => {
    vi.useFakeTimers();
    try {
      const store = createLoomaStore(
        editorDocument({
          cards: [{ id: 'c_1', body: [{ id: 'b_p', type: 'paragraph', text: 'Body' }] }],
        }),
      );
      render(<LoomaEditor store={store} />);
      fireEvent.dblClick(screen.getByText('Body'));
      expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();
      act(() => {
        store.apply([{ op: 'updateNode', id: 'b_p', patch: { text: 'From AI' } }], {
          origin: 'ai',
        });
      });
      expect(screen.getByRole('status', { name: /changed elsewhere/i })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole('status', { name: /changed elsewhere/i })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('duplicates and moves the selection from the keyboard, then undoes it', () => {
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={layoutDocument()} />);
    fireEvent.click(screen.getByText('One'));
    fireEvent.click(screen.getByText('Two'), { shiftKey: true });
    const root = editorRoot();
    fireEvent.keyDown(root, { key: 'd', metaKey: true });
    const body = ref.current?.store.getDocument().cards[0]?.body ?? [];
    expect(body.slice(2, 4).map((node) => ('text' in node ? node.text : ''))).toEqual([
      'One',
      'Two',
    ]);
    expect(ref.current?.getSelection().nodeIds).toEqual([body[2]?.id, body[3]?.id]);
    fireEvent.keyDown(root, { key: 'z', metaKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
      'b_1',
      'b_2',
      'b_3',
      'n_cols',
    ]);

    fireEvent.click(screen.getByText('Two'));
    fireEvent.keyDown(root, { key: 'ArrowUp', ctrlKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
      'b_2',
      'b_1',
      'b_3',
      'n_cols',
    ]);
    expect(ref.current?.getSelection().nodeIds).toEqual(['b_2']);
    fireEvent.keyDown(root, { key: 'ArrowDown', metaKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
      'b_1',
      'b_2',
      'b_3',
      'n_cols',
    ]);

    const card = document.querySelector('[data-lm-card-id="c_2"]');
    if (!(card instanceof HTMLElement)) throw new Error('missing card');
    fireEvent.click(card);
    fireEvent.keyDown(root, { key: 'd', ctrlKey: true });
    const cards = ref.current?.store.getDocument().cards ?? [];
    expect(cards).toHaveLength(3);
    expect(cards[2]?.body[0]).toMatchObject({ type: 'paragraph', text: 'Other' });
    expect(ref.current?.getSelection()).toMatchObject({ cardId: cards[2]?.id, nodeIds: [] });
    fireEvent.keyDown(root, { key: 'ArrowUp', metaKey: true });
    expect(ref.current?.store.getDocument().cards[1]?.id).toBe(cards[2]?.id);
  });

  it('ignores duplicate and move while read only, editing, or typing in a field', () => {
    const ref = createRef<LoomaEditorHandle>();
    const { rerender } = render(<LoomaEditor ref={ref} document={layoutDocument()} readOnly />);
    act(() => {
      ref.current?.select(['b_2']);
    });
    fireEvent.keyDown(editorRoot(), { key: 'd', metaKey: true });
    fireEvent.keyDown(editorRoot(), { key: 'ArrowUp', metaKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
      'b_1',
      'b_2',
      'b_3',
      'n_cols',
    ]);

    rerender(<LoomaEditor ref={ref} document={layoutDocument()} />);
    fireEvent.dblClick(screen.getByText('One'));
    fireEvent.keyDown(editorRoot(), { key: 'd', metaKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body).toHaveLength(4);

    const title = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.pointerDown(title);
    fireEvent.keyDown(title, { key: 'd', metaKey: true });
    fireEvent.keyDown(title, { key: 'ArrowDown', ctrlKey: true });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toEqual([
      'b_1',
      'b_2',
      'b_3',
      'n_cols',
    ]);
  });

  it('does not select or delete while read only', () => {
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={layoutDocument()} readOnly />);
    fireEvent.click(screen.getByText('One'));
    expect(document.querySelector('[data-selected]')).toBeNull();
    fireEvent.keyDown(editorRoot(), { key: 'Backspace' });
    expect(ref.current?.store.getDocument().cards[0]?.body.map((node) => node.id)).toContain('b_1');
  });
});
