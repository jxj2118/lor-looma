import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Callout } from '../blocks/Callout';
import { Code } from '../blocks/Code';
import { Heading } from '../blocks/Heading';
import { List } from '../blocks/List';
import { Quote } from '../blocks/Quote';
import { Table } from '../blocks/Table';
import { NodeRenderProvider } from './context';
import { parseSlotKey, slotKey } from './TextSlot';
import type { RenderSlot } from './TextSlot';

const assets = {};

function withSlot(node: ReactNode, renderSlot?: RenderSlot) {
  return render(
    <NodeRenderProvider value={{ format: 'presentation', assets, renderSlot }}>
      {node}
    </NodeRenderProvider>,
  );
}

describe('slot keys', () => {
  it.each([
    ['text', { kind: 'text' as const }],
    ['item:0', { kind: 'item' as const, path: [0] }],
    ['item:2.0.1', { kind: 'item' as const, path: [2, 0, 1] }],
    ['cell:0:3', { kind: 'cell' as const, row: 0, col: 3 }],
    ['code', { kind: 'code' as const }],
    ['stat:value', { kind: 'stat' as const, field: 'value' as const }],
    ['stat:label', { kind: 'stat' as const, field: 'label' as const }],
    ['stat:detail', { kind: 'stat' as const, field: 'detail' as const }],
  ])('round-trips %s', (key, parsed) => {
    expect(slotKey(parsed)).toBe(key);
    expect(parseSlotKey(key)).toEqual(parsed);
  });

  it.each(['item:', 'item:a', 'cell:1', 'x', 'stat:', 'stat:foo'])('rejects %s', (key) => {
    expect(parseSlotKey(key)).toBeNull();
  });
});

describe('TextSlot', () => {
  it('marks heading text with a slot and keeps inline formatting', () => {
    const { container } = render(
      <Heading block={{ id: 'b_h', type: 'heading', level: 2, text: 'The **short** version' }} />,
    );
    const slot = container.querySelector('[data-lm-slot="text"]');
    expect(slot).not.toBeNull();
    expect(slot?.querySelector('strong')?.textContent).toBe('short');
    expect(container.querySelector('h2')).toContainElement(slot as HTMLElement);
  });

  it('calls renderSlot with the node id and slot, and renderDefault matches the default output', () => {
    const plain = render(
      <Heading block={{ id: 'b_h', type: 'heading', level: 2, text: 'The **short** version' }} />,
    );
    const seen: Array<[string, string]> = [];
    const slotted = withSlot(
      <Heading block={{ id: 'b_h', type: 'heading', level: 2, text: 'The **short** version' }} />,
      (nodeId, slot, renderDefault) => {
        seen.push([nodeId, slot]);
        return renderDefault();
      },
    );
    expect(seen).toEqual([['b_h', 'text']]);
    expect(slotted.container.querySelector('h2')?.innerHTML).toBe(
      plain.container.querySelector('h2')?.innerHTML,
    );
  });

  it('replaces only the text when renderSlot returns a custom element', () => {
    const { container } = withSlot(
      <Heading block={{ id: 'b_h', type: 'heading', level: 2, text: 'Hello' }} />,
      () => <em>custom</em>,
    );
    const heading = container.querySelector('h2');
    expect(heading?.className).toContain('heading');
    expect(heading?.querySelector('em')?.textContent).toBe('custom');
    expect(heading?.querySelector('[data-lm-slot]')).toBeNull();
  });

  it('addresses nested list items by index path', () => {
    const { container } = render(
      <List
        block={{
          id: 'b_list',
          type: 'list',
          style: 'bullet',
          items: ['Green', { text: 'Other', children: ['Blue'] }],
        }}
      />,
    );
    const slots = [...container.querySelectorAll('[data-lm-slot]')].map((element) =>
      element.getAttribute('data-lm-slot'),
    );
    expect(slots).toEqual(['item:0', 'item:1', 'item:1.0']);
    expect(container.querySelector('[data-lm-slot="item:1.0"]')?.textContent).toBe('Blue');
  });

  it('addresses table cells as cell:row:col, with the header on row 0', () => {
    const { container } = render(
      <Table
        block={{
          id: 'b_table',
          type: 'table',
          header: true,
          rows: [
            ['Stage', 'Output'],
            ['Light', '**ATP**'],
          ],
        }}
      />,
    );
    expect(container.querySelector('[data-lm-slot="cell:0:1"]')?.textContent).toBe('Output');
    expect(container.querySelector('[data-lm-slot="cell:1:1"] strong')?.textContent).toBe('ATP');
  });

  it('puts the callout slot on the body that wraps every paragraph', () => {
    const { container } = render(
      <Callout
        block={{
          id: 'b_call',
          type: 'callout',
          tone: 'info',
          text: 'First **line**.\n\nSecond.',
        }}
      />,
    );
    const body = container.querySelector('.calloutBody');
    expect(body).toHaveAttribute('data-lm-slot', 'text');
    expect(body?.querySelectorAll('p')).toHaveLength(2);
    expect(body?.querySelector('strong')?.textContent).toBe('line');
  });

  it('slots quote body text and leaves the citation outside the slot', () => {
    const { container } = render(
      <Quote
        block={{
          id: 'b_quote',
          type: 'quote',
          text: 'A leaf is a quiet factory.\n\nIt runs on light.',
          cite: 'Classroom notes',
        }}
      />,
    );
    const slot = container.querySelector('[data-lm-slot="text"]');
    expect(slot?.querySelectorAll('p')).toHaveLength(2);
    expect(slot?.textContent).toContain('quiet factory');
    expect(slot?.querySelector('cite')).toBeNull();
    expect(container.querySelector('cite')?.textContent).toBe('Classroom notes');
  });

  it('marks code with the code slot and keeps the raw source', () => {
    const { container } = render(
      <Code block={{ id: 'b_code', type: 'code', language: 'text', code: 'const a = 1;' }} />,
    );
    const slot = container.querySelector('[data-lm-slot="code"]');
    expect(slot?.textContent).toBe('const a = 1;');
    expect(container.querySelector('pre')).toContainElement(slot as HTMLElement);
  });
});
