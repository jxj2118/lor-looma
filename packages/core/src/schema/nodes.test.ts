import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  ColumnsContainer,
  ColumnsSchema,
  GridContainer,
  GridSchema,
  StackContainer,
  StackSchema,
  StepsContainer,
  StepsSchema,
} from './containers';
import type { LoomaNode } from './nodes';
import { LoomaNodeSchema } from './nodes';

expectTypeOf<z.output<typeof StackSchema>>().toEqualTypeOf<StackContainer>();
expectTypeOf<z.output<typeof ColumnsSchema>>().toEqualTypeOf<ColumnsContainer>();
expectTypeOf<z.output<typeof GridSchema>>().toEqualTypeOf<GridContainer>();
expectTypeOf<z.output<typeof StepsSchema>>().toEqualTypeOf<StepsContainer>();
expectTypeOf<z.output<typeof LoomaNodeSchema>>().toEqualTypeOf<LoomaNode>();

describe('LoomaNodeSchema', () => {
  it('parses a stack that contains columns of blocks', () => {
    expect(
      LoomaNodeSchema.parse({
        id: 'n_stack',
        type: 'stack',
        children: [
          {
            id: 'n_cols',
            type: 'columns',
            widths: [1, 1],
            children: [
              [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
              [{ id: 'b_right', type: 'heading', level: 2, text: 'Right' }],
            ],
          },
        ],
      }),
    ).toEqual({
      id: 'n_stack',
      type: 'stack',
      children: [
        {
          id: 'n_cols',
          type: 'columns',
          widths: [1, 1],
          children: [
            [{ id: 'b_left', type: 'paragraph', text: 'Left' }],
            [{ id: 'b_right', type: 'heading', level: 2, text: 'Right' }],
          ],
        },
      ],
    });
  });

  it('rejects columns with a single width', () => {
    expect(
      LoomaNodeSchema.safeParse({
        id: 'n_cols',
        type: 'columns',
        widths: [1],
        children: [[{ id: 'b_1', type: 'paragraph' }]],
      }).success,
    ).toBe(false);
  });

  it('strips unknown fields', () => {
    expect(LoomaNodeSchema.parse({ id: 'b_1', type: 'paragraph', text: 'Hi', foo: 1 })).toEqual({
      id: 'b_1',
      type: 'paragraph',
      text: 'Hi',
    });
  });

  it('accepts an unknown block with raw payload', () => {
    expect(
      LoomaNodeSchema.parse({
        id: 'b_video',
        type: 'unknown',
        raw: { type: 'video', url: 'https://example.com/clip.mp4' },
      }),
    ).toEqual({
      id: 'b_video',
      type: 'unknown',
      raw: { type: 'video', url: 'https://example.com/clip.mp4' },
    });
  });

  it('fills container defaults', () => {
    expect(LoomaNodeSchema.parse({ id: 'n_1', type: 'stack' })).toEqual({
      id: 'n_1',
      type: 'stack',
      children: [],
    });
    expect(LoomaNodeSchema.parse({ id: 'n_1', type: 'grid' })).toEqual({
      id: 'n_1',
      type: 'grid',
      columns: 2,
      children: [],
    });
    expect(LoomaNodeSchema.parse({ id: 'n_1', type: 'steps' })).toEqual({
      id: 'n_1',
      type: 'steps',
      children: [],
    });
  });

  it('parses steps around a stat and a math block', () => {
    expect(
      LoomaNodeSchema.parse({
        id: 'n_steps',
        type: 'steps',
        direction: 'horizontal',
        gap: 'sm',
        children: [
          { id: 'b_stat', type: 'stat', value: '6CO2', label: 'Carbon dioxide' },
          { id: 'b_math', type: 'math', tex: '6CO_2 + 6H_2O' },
        ],
      }),
    ).toEqual({
      id: 'n_steps',
      type: 'steps',
      direction: 'horizontal',
      gap: 'sm',
      children: [
        { id: 'b_stat', type: 'stat', value: '6CO2', label: 'Carbon dioxide' },
        { id: 'b_math', type: 'math', tex: '6CO_2 + 6H_2O' },
      ],
    });
  });

  it('rejects a steps direction other than vertical or horizontal', () => {
    expect(
      LoomaNodeSchema.safeParse({ id: 'n_1', type: 'steps', direction: 'diagonal' }).success,
    ).toBe(false);
  });
});
