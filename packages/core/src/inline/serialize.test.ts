import { describe, expect, it } from 'vitest';
import {
  inlineToPlainText,
  isSafeHref,
  normalizeInline,
  parseInline,
  serializeInline,
} from './index';

const CANONICAL = [
  'plain text',
  'a **b** *c* ~~d~~ `e`',
  '***x***',
  '[link **bold**](https://example.com/path?q=1)',
  '{color:primary}red **bold**{/color} and {highlight:yellow}mark{/highlight}',
  'escaped \\* \\~ \\` \\[ \\] \\{ \\} \\\\ (parens are fine)',
  'line one\nline two',
  '[mail](mailto:a@b.co)',
];

describe('serializeInline', () => {
  it.each(CANONICAL)('round-trips canonical text: %s', (text) => {
    expect(serializeInline(parseInline(text))).toBe(text);
  });

  it('normalization is idempotent on arbitrary input', () => {
    const inputs = ['a **b', '**a *b* c**', '{color:nope}x', 'a\\qb', '[x](y) [z]', '`a*b`', '\\'];
    for (const input of inputs) {
      const once = normalizeInline(input);
      expect(normalizeInline(once)).toBe(once);
      expect(parseInline(once)).toEqual(parseInline(input));
    }
  });

  it('escapes special characters in text nodes', () => {
    expect(serializeInline([{ type: 'text', value: 'a*b{c}' }])).toBe('a\\*b\\{c\\}');
  });

  it('falls back to escaped text for code containing a backtick', () => {
    expect(serializeInline([{ type: 'code', value: 'a`b' }])).toBe('a\\`b');
  });
});

describe('inlineToPlainText', () => {
  it('strips marks and keeps link labels', () => {
    expect(inlineToPlainText('**Hi** [there](https://x.dev)\n{color:red}now{/color} `code`')).toBe(
      'Hi there now code',
    );
  });
});

describe('isSafeHref', () => {
  it.each(['https://a.dev', 'http://a.dev', 'mailto:a@b.co'])('allows %s', (h) => {
    expect(isSafeHref(h)).toBe(true);
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://a', 'not a url', '/relative'])(
    'blocks %s',
    (h) => {
      expect(isSafeHref(h)).toBe(false);
    },
  );
});
