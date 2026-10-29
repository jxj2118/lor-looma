import { describe, expect, it } from 'vitest';
import { createId, ID_PATTERN, ID_PREFIX, isValidId } from './ids';

describe('createId', () => {
  it('uses the prefix and 8 lowercase alphanumeric characters', () => {
    expect(createId('card')).toMatch(/^c_[0-9a-z]{8}$/);
    expect(createId('container')).toMatch(/^n_[0-9a-z]{8}$/);
    expect(createId('block')).toMatch(/^b_[0-9a-z]{8}$/);
    expect(createId('asset')).toMatch(/^img_[0-9a-z]{8}$/);
    expect(createId('document')).toMatch(/^doc_[0-9a-z]{8}$/);
  });

  it('produces valid, practically unique ids', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => createId('block')));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(isValidId(id)).toBe(true);
  });

  it('avoids ids in the `taken` set', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) taken.add(createId('block', taken));
    expect(taken.size).toBe(50);
  });
});

describe('isValidId', () => {
  it.each(['a', 'b_1', 'Card-2', 'x'.repeat(64)])('accepts %s', (id) => {
    expect(isValidId(id)).toBe(true);
  });
  it.each(['', '1abc', '_a', 'a b', 'a.b', 'x'.repeat(65), 42])('rejects %s', (id) => {
    expect(isValidId(id)).toBe(false);
  });
  it('exposes the pattern and prefixes', () => {
    expect(ID_PATTERN.source).toBe('^[a-zA-Z][a-zA-Z0-9_-]{0,63}$');
    expect(ID_PREFIX).toEqual({
      card: 'c_',
      container: 'n_',
      block: 'b_',
      asset: 'img_',
      document: 'doc_',
    });
  });
});
