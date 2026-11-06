import { describe, expect, it } from 'vitest';
import { LOOMA_SCHEMA_VERSION } from './index';

describe('LOOMA_SCHEMA_VERSION', () => {
  it('is 2 for the v2 document format', () => {
    expect(LOOMA_SCHEMA_VERSION).toBe(2);
  });
});
