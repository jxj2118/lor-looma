import { describe, expect, it } from 'vitest';
import { LOOMA_TOOL_NAMES } from './tools';

describe('LOOMA_TOOL_NAMES', () => {
  it('lists the three public tool names', () => {
    expect(LOOMA_TOOL_NAMES).toEqual(['looma_get_outline', 'looma_get_cards', 'looma_apply']);
  });
});
