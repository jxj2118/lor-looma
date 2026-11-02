import { describe, expect, it } from 'vitest';
import type { LoomaDocument, LoomaNode } from '../schema';
import { nodePreview } from './preview';

function doc(assets: LoomaDocument['assets'] = {}): LoomaDocument {
  return {
    looma: 1,
    id: 'doc_1',
    title: '',
    format: 'presentation',
    theme: { preset: 'clean' },
    assets,
    cards: [],
  };
}

function preview(node: LoomaNode, assets?: LoomaDocument['assets'], maxLength?: number): string {
  return nodePreview(node, doc(assets), maxLength);
}

describe('nodePreview', () => {
  it('uses plain text for heading, paragraph, callout, and quote', () => {
    expect(preview({ id: 'b_1', type: 'heading', level: 1, text: 'Hello **world**' })).toBe(
      'Hello world',
    );
    expect(preview({ id: 'b_1', type: 'paragraph', text: 'hello   world\nnext' })).toBe(
      'hello world next',
    );
    expect(preview({ id: 'b_1', type: 'callout', tone: 'warning', text: 'Watch **out**' })).toBe(
      'Watch out',
    );
    expect(
      preview({ id: 'b_1', type: 'quote', text: 'A quiet factory', cite: 'Classroom notes' }),
    ).toBe('A quiet factory — Classroom notes');
  });

  it('joins list items, including nested ones, with semicolons', () => {
    expect(
      preview({
        id: 'b_1',
        type: 'list',
        style: 'bullet',
        items: ['One', { text: 'Two', children: ['Nested'] }, 'Three'],
      }),
    ).toBe('One; Two; Nested; Three');
  });

  it('joins table cells and rows', () => {
    expect(
      preview({
        id: 'b_1',
        type: 'table',
        header: true,
        rows: [
          ['Stage', 'Output'],
          ['Light', 'ATP'],
        ],
      }),
    ).toBe('Stage | Output / Light | ATP');
  });

  it('labels images, code, dividers, and unsupported blocks', () => {
    expect(
      preview(
        { id: 'b_1', type: 'image', assetId: 'img_1', caption: 'A [leaf](https://example.com)' },
        { img_1: { kind: 'image', src: 'https://example.com/a.png', alt: 'Leaf' } },
      ),
    ).toBe('[image] A leaf');
    expect(
      preview(
        { id: 'b_1', type: 'image', assetId: 'img_1' },
        { img_1: { kind: 'image', src: 'https://example.com/a.png', alt: 'Leaf' } },
      ),
    ).toBe('[image] Leaf');
    expect(
      preview({ id: 'b_1', type: 'code', language: 'ts', code: 'const a = 1\nconst b = 2' }),
    ).toBe('[code] const a = 1');
    expect(preview({ id: 'b_1', type: 'stat', value: '**98%**', label: 'Done' })).toBe(
      '98% — Done',
    );
    expect(preview({ id: 'b_1', type: 'math', tex: 'E = mc^2' })).toBe('E = mc^2');
    expect(preview({ id: 'b_1', type: 'divider' })).toBe('[divider]');
    expect(preview({ id: 'b_1', type: 'unknown', raw: { type: 'video' } })).toBe(
      '[unsupported: video]',
    );
  });

  it('summarizes containers', () => {
    const child = { id: 'b_1', type: 'paragraph' as const, text: 'Hi' };
    expect(preview({ id: 'n_1', type: 'stack', children: [child, child, child] })).toBe(
      '[stack: 3 items]',
    );
    expect(
      preview({
        id: 'n_1',
        type: 'columns',
        widths: [1, 1],
        children: [[child], [child]],
      }),
    ).toBe('[columns: 2]');
    expect(
      preview({
        id: 'n_1',
        type: 'grid',
        columns: 2,
        children: [child, child, child, child],
      }),
    ).toBe('[grid: 2 columns, 4 items]');
    expect(
      preview({
        id: 'n_1',
        type: 'steps',
        direction: 'vertical',
        children: [child, child],
      }),
    ).toBe('[steps: 2 items]');
  });

  it('truncates previews longer than the max length', () => {
    expect(preview({ id: 'b_1', type: 'paragraph', text: 'a'.repeat(70) })).toBe(
      `${'a'.repeat(60)}…`,
    );
    expect(preview({ id: 'b_1', type: 'paragraph', text: 'a'.repeat(70) }, {}, 10)).toBe(
      `${'a'.repeat(10)}…`,
    );
  });
});
