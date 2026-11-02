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
});
