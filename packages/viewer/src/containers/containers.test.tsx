import { parseDocument } from '@lor-looma/core';
import type { LoomaDocument } from '@lor-looma/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoomaCardView } from '../card/LoomaCardView';

function document(): LoomaDocument {
  const parsed = parseDocument({
    looma: 1,
    id: 'doc_layout',
    title: 'Layout',
    cards: [
      {
        id: 'c_layout',
        body: [
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1.2, 1],
            gap: 'lg',
            align: 'center',
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left column' }],
              [
                { id: 'b_right', type: 'paragraph', text: 'Right column' },
                { id: 'b_more', type: 'heading', level: 3, text: 'More' },
              ],
            ],
          },
          {
            id: 'n_grid',
            type: 'grid',
            columns: 3,
            gap: 'sm',
            children: [
              { id: 'b_g1', type: 'paragraph', text: 'One' },
              { id: 'b_g2', type: 'paragraph', text: 'Two' },
            ],
          },
          { id: 'n_stack', type: 'stack', gap: 'none', children: [] },
          {
            id: 'n_steps',
            type: 'steps',
            direction: 'horizontal',
            gap: 'sm',
            children: [
              { id: 'b_step1', type: 'paragraph', text: 'Capture' },
              { id: 'b_step2', type: 'paragraph', text: 'Convert' },
            ],
          },
          { id: 'n_steps_empty', type: 'steps', children: [] },
          {
            id: 'n_default',
            type: 'stack',
            children: [{ id: 'b_in', type: 'paragraph', text: 'Inside' }],
          },
          {
            id: 'n_empty_col',
            type: 'columns',
            widths: [1, 1],
            children: [[{ id: 'b_only', type: 'paragraph', text: 'Only' }], []],
          },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error('fixture failed to parse');
  return parsed.doc;
}

function node(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-lm-node-id="${id}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`missing node ${id}`);
  return el;
}

describe('containers', () => {
  it('lays out columns, grids, and stacks with the gap scale', () => {
    const { container } = render(
      <LoomaCardView card={document().cards[0]!} document={document()} />,
    );

    const columns = node(container, 'n_cols').firstElementChild;
    expect(columns).toHaveAttribute('data-lm-columns', '');
    expect((columns as HTMLElement).style.gridTemplateColumns).toBe('1.2fr 1fr');
    expect((columns as HTMLElement).style.alignItems).toBe('center');
    expect((columns as HTMLElement).style.gap).toBe('calc(var(--lm-block-gap) * 1.75)');
    expect(columns?.querySelectorAll(':scope > [data-lm-slot]')).toHaveLength(2);
    expect(columns?.querySelector('[data-lm-slot="1"]')?.textContent).toContain('Right column');

    const grid = node(container, 'n_grid').firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(grid.style.gap).toBe('calc(var(--lm-block-gap) * 0.5)');

    const stack = node(container, 'n_stack').firstElementChild as HTMLElement;
    expect(stack.style.gap).toBe('0px');
    expect(stack.querySelector('[data-lm-empty]')).not.toBeNull();

    const defaults = node(container, 'n_default').firstElementChild as HTMLElement;
    expect(defaults.style.gap).toBe('var(--lm-block-gap)');
    expect(defaults.style.alignItems).toBe('');

    const steps = node(container, 'n_steps').firstElementChild as HTMLElement;
    expect(steps).toHaveAttribute('data-lm-steps', 'horizontal');
    expect(steps.style.gap).toBe('calc(var(--lm-block-gap) * 0.5)');
    expect([...steps.querySelectorAll('[data-lm-step]')].map((item) => item.textContent)).toEqual([
      '1Capture',
      '2Convert',
    ]);
    expect(steps.querySelectorAll('[data-lm-connector]')).toHaveLength(1);
    expect(node(container, 'b_step1').parentElement?.parentElement).toHaveAttribute(
      'data-lm-step',
      '1',
    );

    const emptySteps = node(container, 'n_steps_empty').firstElementChild as HTMLElement;
    expect(emptySteps).toHaveAttribute('data-lm-steps', 'vertical');
    expect(emptySteps.querySelector('[data-lm-empty]')).not.toBeNull();

    const emptyColumn = node(container, 'n_empty_col').querySelector('[data-lm-slot="1"]');
    expect(emptyColumn?.querySelector('[data-lm-empty]')).not.toBeNull();
    expect((node(container, 'n_empty_col').firstElementChild as HTMLElement).style.alignItems).toBe(
      'start',
    );
  });
});
