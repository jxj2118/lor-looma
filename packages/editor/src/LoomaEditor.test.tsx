import { createLoomaStore } from '@lor-looma/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from './index';
import type { LoomaEditorHandle } from './index';
import { editorDocument } from './test/fixture';

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
    await user.click(screen.getByRole('button', { name: 'Add card' }));
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
});
