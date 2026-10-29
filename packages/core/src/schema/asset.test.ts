import { describe, expect, it } from 'vitest';
import { ImageAssetSchema } from './asset';

const SRC_MESSAGE = 'src must start with https://, http:// or data:image/';

describe('ImageAssetSchema', () => {
  it.each([
    'https://example.com/a.png',
    'HTTP://example.com/a.png',
    'data:image/png;base64,aaaa',
    'DATA:IMAGE/svg+xml,<svg/>',
  ])('accepts src %s', (src) => {
    expect(ImageAssetSchema.safeParse({ kind: 'image', src }).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<p>x</p>', 'ftp://example.com/a.png'])(
    'rejects src %s',
    (src) => {
      const result = ImageAssetSchema.safeParse({ kind: 'image', src });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.message === SRC_MESSAGE)).toBe(true);
      }
    },
  );

  it('defaults alt to an empty string', () => {
    expect(ImageAssetSchema.parse({ kind: 'image', src: 'https://example.com/a.png' })).toEqual({
      kind: 'image',
      src: 'https://example.com/a.png',
      alt: '',
    });
  });

  it('accepts positive integer dimensions and rejects fractions', () => {
    expect(
      ImageAssetSchema.safeParse({
        kind: 'image',
        src: 'http://example.com/a.png',
        width: 10,
        height: 20,
        alt: 'leaf',
      }).success,
    ).toBe(true);
    expect(
      ImageAssetSchema.safeParse({
        kind: 'image',
        src: 'http://example.com/a.png',
        width: 1.5,
      }).success,
    ).toBe(false);
  });
});
