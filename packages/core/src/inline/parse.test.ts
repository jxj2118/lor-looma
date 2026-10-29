import { describe, expect, it } from 'vitest';
import { parseInline } from './parse';

const t = (value: string) => ({ type: 'text', value }) as const;

describe('parseInline', () => {
  it('parses plain text', () => {
    expect(parseInline('hello')).toEqual([t('hello')]);
    expect(parseInline('')).toEqual([]);
  });

  it('parses bold, italic, strike and code', () => {
    expect(parseInline('a **b** *c* ~~d~~ `e*f`')).toEqual([
      t('a '),
      { type: 'bold', children: [t('b')] },
      t(' '),
      { type: 'italic', children: [t('c')] },
      t(' '),
      { type: 'strike', children: [t('d')] },
      t(' '),
      { type: 'code', value: 'e*f' },
    ]);
  });

  it('nests marks', () => {
    expect(parseInline('***x***')).toEqual([
      { type: 'bold', children: [{ type: 'italic', children: [t('x')] }] },
    ]);
    expect(parseInline('**a *b* c**')).toEqual([
      { type: 'bold', children: [t('a '), { type: 'italic', children: [t('b')] }, t(' c')] },
    ]);
  });

  it('treats unclosed or empty markers as text', () => {
    expect(parseInline('a **b')).toEqual([t('a **b')]);
    expect(parseInline('2 * 3 = 6')).toEqual([t('2 * 3 = 6')]);
    expect(parseInline('****')).toEqual([t('****')]);
    expect(parseInline('`open')).toEqual([t('`open')]);
  });

  it('parses links with formatted labels and keeps unsafe hrefs verbatim', () => {
    expect(parseInline('see [the **docs**](https://x.dev/a_(b))')).toEqual([
      t('see '),
      {
        type: 'link',
        href: 'https://x.dev/a_(b',
        children: [t('the '), { type: 'bold', children: [t('docs')] }],
      },
      t(')'),
    ]);
    expect(parseInline('[x](javascript:alert(1))')[0]).toMatchObject({
      type: 'link',
      href: 'javascript:alert(1',
    });
    expect(parseInline('[x](has space)')).toEqual([t('[x](has space)')]);
  });

  it('parses color and highlight marks', () => {
    expect(parseInline('{color:primary}hi{/color}')).toEqual([
      { type: 'color', color: 'primary', children: [t('hi')] },
    ]);
    expect(parseInline('{highlight:yellow}**hi**{/highlight}')).toEqual([
      { type: 'highlight', color: 'yellow', children: [{ type: 'bold', children: [t('hi')] }] },
    ]);
    expect(parseInline('{color:nope}hi{/color}')).toEqual([t('{color:nope}hi{/color}')]);
  });

  it('handles escapes and line breaks', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([t('*not italic*')]);
    expect(parseInline('a\\qb')).toEqual([t('a\\qb')]);
    expect(parseInline('a\r\nb\nc')).toEqual([
      t('a'),
      { type: 'break' },
      t('b'),
      { type: 'break' },
      t('c'),
    ]);
  });

  it('keeps an escaped parenthesis inside an href', () => {
    expect(parseInline('[a](b\\)c)')).toEqual([
      { type: 'link', href: 'b\\)c', children: [t('a')] },
    ]);
  });

  it('treats an unclosed color mark and a bare backslash as text', () => {
    expect(parseInline('{color:primary}hi')).toEqual([t('{color:primary}hi')]);
    expect(parseInline('{highlight:nope}x')).toEqual([t('{highlight:nope}x')]);
    expect(parseInline('\\')).toEqual([t('\\')]);
  });
});
