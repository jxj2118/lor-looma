import { describe, expect, it } from 'vitest';
import { normalizeInline, parseInline, serializeInline } from './index';

const PARTS = [
  '*',
  '**',
  '~~',
  '`',
  '[',
  ']',
  '(',
  ')',
  '{color:red}',
  '{/color}',
  '{highlight:yellow}',
  '{/highlight}',
  '\\',
  '\n',
  'a',
  'b ',
  'https://x.y',
  ' ',
];

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe('inline round-trip (deterministic fuzz)', () => {
  it('serialize(parse(s)) re-parses to the same AST and is a normalization fixpoint', () => {
    const random = createRandom(42);
    for (let i = 0; i < 5000; i++) {
      const length = 1 + Math.floor(random() * 25);
      let input = '';
      for (let j = 0; j < length; j++) input += PARTS[Math.floor(random() * PARTS.length)];

      const ast = parseInline(input);
      const serialized = serializeInline(ast);
      expect(parseInline(serialized), JSON.stringify(input)).toEqual(ast);
      expect(normalizeInline(serialized), JSON.stringify(input)).toBe(serialized);
    }
  });
});
