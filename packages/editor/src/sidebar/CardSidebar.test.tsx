import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';
import { cardReorderCommand } from './CardSidebar';

function row(id: string): HTMLElement {
  const element = document.querySelector(`[data-lm-sidebar-card="${id}"]`)?.closest('li');
  if (!(element instanceof HTMLElement)) throw new Error(`missing row ${id}`);
  return element;
}

function cardIds(ref: { current: LoomaEditorHandle | null }): string[] {
  return ref.current?.store.getDocument().cards.map((card) => card.id) ?? [];
}

describe('cardReorderCommand', () => {
  it('builds a move and ignores a no-op', () => {
    expect(cardReorderCommand(['c_1', 'c_2', 'c_3'], 'c_1', 'c_3')).toEqual({
      op: 'moveCard',
      id: 'c_1',
      to: { index: 2 },
    });
    expect(cardReorderCommand(['c_1', 'c_2'], 'c_1', 'c_1')).toBeNull();
    expect(cardReorderCommand(['c_1'], 'c_1', 'missing')).toBeNull();
    expect(cardReorderCommand(['c_1'], 'missing', 'c_1')).toBeNull();
  });
});

describe('CardSidebar', () => {
  it('selects a card from its preview and scrolls the canvas', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    const preview = document.querySelector('[data-lm-sidebar-card="c_1"] [data-lm-preview]');
    expect(preview).toHaveStyle({ pointerEvents: 'none' });
    expect(preview?.textContent).toContain('Hello');
    expect(within(row('c_1')).getByText('1')).toBeInTheDocument();
    expect(within(row('c_2')).getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Card 2' }));
    expect(document.querySelector('[data-lm-sidebar-card="c_2"]')).toHaveAttribute('data-active');
    expect(ref.current?.getSelection()).toMatchObject({ cardId: 'c_2', nodeIds: [] });
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(within(row('c_1')).getByRole('button', { name: 'Move up' })).toBeDisabled();
    expect(within(row('c_2')).getByRole('button', { name: 'Move down' })).toBeDisabled();
  });

  it('inserts, duplicates, moves, and deletes cards from the toolbar and the bottom button', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);

    await user.click(within(row('c_1')).getByRole('button', { name: 'Duplicate card' }));
    let cards = ref.current?.store.getDocument().cards ?? [];
    expect(cards).toHaveLength(3);
    const copyId = cards[1]?.id;
    expect(cards[1]?.body[0]).toMatchObject({ type: 'heading', text: 'Hello' });
    expect(ref.current?.getSelection().cardId).toBe(copyId);

    await user.click(within(row('c_2')).getByRole('button', { name: 'Move up' }));
    expect(cardIds(ref)).toEqual(['c_1', 'c_2', copyId]);

    await user.click(within(row('c_1')).getByRole('button', { name: 'Insert card below' }));
    cards = ref.current?.store.getDocument().cards ?? [];
    expect(cards).toHaveLength(4);
    const created = cards[1];
    expect(created?.body[0]).toMatchObject({ type: 'heading', level: 2, text: '' });
    expect(ref.current?.getSelection().cardId).toBe(created?.id);
    expect(document.querySelector('[contenteditable="true"]')).not.toBeNull();

    const sidebar = document.querySelector('[data-lm-sidebar]');
    if (!(sidebar instanceof HTMLElement)) throw new Error('missing sidebar');
    await user.click(within(sidebar).getByRole('button', { name: 'Add card' }));
    expect(cardIds(ref)).toHaveLength(5);
    expect(cardIds(ref).at(-1)).toBe(ref.current?.getSelection().cardId);

    await user.click(within(row('c_1')).getByRole('button', { name: 'Delete card' }));
    expect(cardIds(ref)).not.toContain('c_1');
  });

  it('runs the same actions from the context menu and closes it', () => {
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Card 2' }), {
      clientX: 24,
      clientY: 80,
    });
    const menu = document.querySelector('[data-lm-card-menu]');
    if (!(menu instanceof HTMLElement)) throw new Error('missing menu');
    expect(menu).toHaveStyle({ left: '24px', top: '80px' });
    expect(within(menu).getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move up' }));
    expect(cardIds(ref)).toEqual(['c_2', 'c_1']);
    expect(document.querySelector('[data-lm-card-menu]')).toBeNull();

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Card 1' }));
    const next = document.querySelector('[data-lm-card-menu]');
    if (!(next instanceof HTMLElement)) throw new Error('missing menu');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-lm-card-menu]')).toBeNull();

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Card 1' }));
    fireEvent.pointerDown(document.body);
    expect(document.querySelector('[data-lm-card-menu]')).toBeNull();
  });

  it('reorders cards by dragging', () => {
    const rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const id = this.getAttribute('data-lm-sidebar-card');
      const index = id === 'c_2' ? 1 : 0;
      const top = index * 120;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 180,
        bottom: top + 100,
        width: id ? 180 : 0,
        height: id ? 100 : 0,
        toJSON() {
          return {};
        },
      } as DOMRect;
    };
    try {
      const ref = createRef<LoomaEditorHandle>();
      render(<LoomaEditor ref={ref} document={editorDocument()} />);
      const card = screen.getByRole('button', { name: 'Card 1' });
      fireEvent.pointerDown(card, {
        button: 0,
        isPrimary: true,
        clientX: 20,
        clientY: 20,
        pointerId: 1,
      });
      fireEvent.pointerMove(document, {
        clientX: 20,
        clientY: 40,
        pointerId: 1,
        buttons: 1,
      });
      fireEvent.pointerMove(document, {
        clientX: 20,
        clientY: 170,
        pointerId: 1,
        buttons: 1,
      });
      fireEvent.pointerUp(document, { clientX: 20, clientY: 170, pointerId: 1 });
      expect(cardIds(ref)).toEqual(['c_2', 'c_1']);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect;
    }
  });

  it('marks a card that overflows the slide', async () => {
    render(<LoomaEditor document={editorDocument()} />);
    const content = document.querySelector('[data-lm-sidebar-card="c_1"] [data-lm-card-content]');
    if (!(content instanceof HTMLElement)) throw new Error('missing preview content');
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 720 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(
      document.querySelector('[data-lm-sidebar-card="c_1"] [data-lm-overflow]'),
    ).not.toBeNull();
  });

  it('hides the sidebar while read only', () => {
    render(<LoomaEditor document={editorDocument()} readOnly />);
    expect(document.querySelector('[data-lm-sidebar]')).toBeNull();
  });
});
