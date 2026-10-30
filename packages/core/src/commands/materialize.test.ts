import { describe, expect, it } from 'vitest';
import { materializeAsset, materializeCard, materializeNode } from './materialize';

const BLOCK_AND_CONTAINER_TYPES =
  'heading, paragraph, list, image, table, callout, quote, divider, code, stack, columns, grid';

describe('materializeNode', () => {
  it('fills ids parent-first for a stack containing columns containing a paragraph', () => {
    const input = {
      type: 'stack',
      children: [
        {
          type: 'columns',
          widths: [1, 1],
          children: [[{ type: 'paragraph', text: 'Hi' }], []],
        },
      ],
    };
    const taken = new Set<string>();
    const created: string[] = [];
    const result = materializeNode(input, taken, created);

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.type !== 'stack') throw new Error('expected stack');
    const columns = result.value.children[0];
    if (!columns || columns.type !== 'columns') throw new Error('expected columns');
    const paragraph = columns.children[0]?.[0];
    if (!paragraph || paragraph.type !== 'paragraph') throw new Error('expected paragraph');

    expect(created).toEqual([result.value.id, columns.id, paragraph.id]);
    expect(new Set(created).size).toBe(3);
    expect(result.value.id).toMatch(/^n_[0-9a-z]{8}$/);
    expect(columns.id).toMatch(/^n_[0-9a-z]{8}$/);
    expect(paragraph.id).toMatch(/^b_[0-9a-z]{8}$/);
    for (const id of created) expect(taken.has(id)).toBe(true);
    expect(input).toEqual({
      type: 'stack',
      children: [
        {
          type: 'columns',
          widths: [1, 1],
          children: [[{ type: 'paragraph', text: 'Hi' }], []],
        },
      ],
    });
  });

  it('rejects a duplicate id and leaves taken unchanged', () => {
    const taken = new Set(['b_1']);
    const created = ['keep'];
    expect(materializeNode({ type: 'paragraph', id: 'b_1', text: 'x' }, taken, created)).toEqual({
      ok: false,
      issues: [
        {
          path: 'id',
          message: 'id "b_1" is already in use; omit it to let Looma generate one',
        },
      ],
    });
    expect(taken).toEqual(new Set(['b_1']));
    expect(created).toEqual(['keep']);
  });

  it('rejects a heading without level at path level and does not keep the generated id', () => {
    const taken = new Set(['b_existing']);
    const created = ['keep'];
    expect(materializeNode({ type: 'heading' }, taken, created)).toEqual({
      ok: false,
      issues: [{ path: 'level', message: 'is required (expected 1 | 2 | 3)' }],
    });
    expect(taken).toEqual(new Set(['b_existing']));
    expect(created).toEqual(['keep']);
  });

  it('fills list defaults', () => {
    const taken = new Set<string>();
    const created: string[] = [];
    const result = materializeNode({ type: 'list' }, taken, created);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.type !== 'list') throw new Error('expected list');
    expect(result.value).toEqual({
      id: result.value.id,
      type: 'list',
      style: 'bullet',
      items: [],
    });
    expect(result.value.id).toMatch(/^b_[0-9a-z]{8}$/);
    expect(created).toEqual([result.value.id]);
  });

  it('rejects unsupported blocks', () => {
    const taken = new Set<string>();
    const created: string[] = [];
    expect(materializeNode({ type: 'unknown', id: 'b_1' }, taken, created)).toEqual({
      ok: false,
      issues: [{ path: 'type', message: 'unsupported blocks cannot be created' }],
    });
    expect(taken.size).toBe(0);
    expect(created).toEqual([]);
  });

  it('rejects an unknown block type and names every supported type', () => {
    expect(materializeNode({ type: 'video' }, new Set(), [])).toEqual({
      ok: false,
      issues: [
        {
          path: 'type',
          message: `unknown block type "video"; expected one of ${BLOCK_AND_CONTAINER_TYPES}`,
        },
      ],
    });
  });
});

describe('materializeCard', () => {
  it('assigns a card id before nested node ids', () => {
    const taken = new Set<string>();
    const created: string[] = [];
    const result = materializeCard({ body: [{ type: 'paragraph', text: 'Hi' }] }, taken, created);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected card');
    expect(created).toEqual([result.value.id, result.value.body[0]?.id]);
    expect(result.value.id).toMatch(/^c_[0-9a-z]{8}$/);
    expect(result.value.body[0]?.id).toMatch(/^b_[0-9a-z]{8}$/);
    expect(result.value.notes).toBeUndefined();
  });
});

describe('materializeAsset', () => {
  it('rejects a javascript src', () => {
    expect(materializeAsset({ kind: 'image', src: 'javascript:x' })).toEqual({
      ok: false,
      issues: [{ path: 'src', message: 'src must start with https://, http:// or data:image/' }],
    });
  });

  it('fills a default alt', () => {
    const result = materializeAsset({ kind: 'image', src: 'https://example.com/a.png' });
    expect(result).toEqual({
      ok: true,
      value: { kind: 'image', src: 'https://example.com/a.png', alt: '' },
    });
  });
});
