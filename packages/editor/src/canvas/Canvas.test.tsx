import type * as ViewerTypes from '@lor-looma/viewer';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoomaEditor } from '../LoomaEditor';
import type { LoomaEditorHandle } from '../LoomaEditor';
import { editorDocument } from '../test/fixture';

const { cardRenders } = vi.hoisted(() => ({ cardRenders: new Map<string, number>() }));

vi.mock('@lor-looma/viewer', async () => {
  const actual = await vi.importActual<typeof ViewerTypes>('@lor-looma/viewer');
  function CountingCard(props: ComponentProps<typeof actual.LoomaCardView>) {
    cardRenders.set(props.card.id, (cardRenders.get(props.card.id) ?? 0) + 1);
    return <actual.LoomaCardView {...props} />;
  }
  return { ...actual, LoomaCardView: CountingCard };
});

describe('Canvas', () => {
  it('shows an empty state that can add the first card', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument({ cards: [] })} />);
    expect(screen.getByText('This document has no cards.')).toBeInTheDocument();
    const canvas = document.querySelector('[data-lm-editor-canvas]');
    if (!(canvas instanceof HTMLElement)) throw new Error('missing canvas');
    await user.click(within(canvas).getByRole('button', { name: 'Add card' }));
    expect(ref.current?.store.getDocument().cards).toHaveLength(1);
    expect(screen.queryByText('This document has no cards.')).toBeNull();
  });

  it('keeps renderNode stable so an unaffected card view does not render again', () => {
    cardRenders.clear();
    render(
      <LoomaEditor
        document={editorDocument({
          cards: [
            { id: 'c_1', body: [{ id: 'b_1', type: 'paragraph', text: 'One' }] },
            { id: 'c_2', body: [{ id: 'b_2', type: 'paragraph', text: 'Two' }] },
          ],
        })}
      />,
    );
    const before = cardRenders.get('c_2');
    fireEvent.click(screen.getByText('One'));
    expect(document.querySelector('[data-lm-editor-node="b_1"]')).toHaveAttribute('data-selected');
    expect(cardRenders.get('c_2')).toBe(before);
  });

  it('renders a drag handle on each block', () => {
    render(<LoomaEditor document={editorDocument()} />);
    const node = document.querySelector('[data-lm-editor-node="b_h"]');
    expect(node?.querySelector('[aria-label="Drag to move"]')).not.toBeNull();
    fireEvent.pointerMove(within(node as HTMLElement).getByText('Hello'));
    expect(node).toHaveAttribute('data-hovered');
  });

  it('opens a block action menu when clicking the 6-dot handle', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    const node = document.querySelector('[data-lm-editor-node="b_h"]');
    fireEvent.pointerMove(within(node as HTMLElement).getByText('Hello'));
    const handle = node?.querySelector('[aria-label="Drag to move"]');
    if (!(handle instanceof HTMLElement)) throw new Error('missing handle');
    await user.click(handle);
    const menu = document.querySelector('[data-lm-node-menu]');
    expect(menu).not.toBeNull();
    expect(
      within(menu as HTMLElement).queryByRole('menuitem', { name: 'Split card here' }),
    ).toBeNull();
    await user.click(within(menu as HTMLElement).getByRole('menuitem', { name: 'Duplicate' }));
    expect(ref.current?.store.getDocument().cards[0]?.body).toHaveLength(3);
    expect(document.querySelector('[data-lm-node-menu]')).toBeNull();
  });

  it('splits the card from a later block and selects the new card', async () => {
    const user = userEvent.setup();
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    const node = document.querySelector('[data-lm-editor-node="b_p"]');
    fireEvent.pointerMove(within(node as HTMLElement).getByText('Body'));
    const handle = node?.querySelector('[aria-label="Drag to move"]');
    if (!(handle instanceof HTMLElement)) throw new Error('missing handle');
    await user.click(handle);
    const menu = document.querySelector('[data-lm-node-menu]');
    expect(menu).not.toBeNull();
    await user.click(
      within(menu as HTMLElement).getByRole('menuitem', { name: 'Split card here' }),
    );
    const cards = ref.current?.store.getDocument().cards ?? [];
    expect(cards.map((card) => card.body.map((block) => block.id))).toEqual([
      ['b_h'],
      ['b_p'],
      ['b_2'],
    ]);
    expect(ref.current?.getSelection().cardId).toBe(cards[1]?.id);
    expect(ref.current?.getSelection().nodeIds).toEqual([]);
    expect(document.querySelector('[data-lm-node-menu]')).toBeNull();
  });

  it('auto-enters inline editing and preserves the selected range when dragging across static text', () => {
    const ref = createRef<LoomaEditorHandle>();
    render(<LoomaEditor ref={ref} document={editorDocument()} />);
    const p = screen.getByText('Body');
    const textNode = p.firstChild;
    if (!textNode) throw new Error('missing text node');
    fireEvent.mouseDown(p, { button: 0, clientX: 10, clientY: 10 });
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 3);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    fireEvent.mouseUp(p, { button: 0, clientX: 40, clientY: 10 });
    expect(ref.current?.getSelection().editingId).toBe('b_p');
  });
});
