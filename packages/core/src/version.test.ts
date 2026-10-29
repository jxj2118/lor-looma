import { describe, expect, it } from 'vitest';
import { LOOMA_SCHEMA_VERSION } from './index';

describe('LOOMA_SCHEMA_VERSION', () => {
  it('is 1 for the v1 document format', () => {
    expect(LOOMA_SCHEMA_VERSION).toBe(1);
  });
});
