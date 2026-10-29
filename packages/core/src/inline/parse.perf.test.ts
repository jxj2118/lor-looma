import { describe, expect, it } from 'vitest';
import { parseInline } from './parse';
import { serializeInline } from './serialize';

function realisticParagraph(): string {
  const parts = [
    'Leaves capture **sunlight** and *water* to build {color:green}sugar{/color}. ',
    'Read [the diagram](https://example.com/leaf) before the lab. ',
    'Chlorophyll reflects {color:green}green{/color} light and absorbs **blue**. ',
    'A {highlight:yellow}key idea{/highlight}: oxygen is released from the leaf. ',
  ];
  let out = '';
  let index = 0;
  while (out.length < 20_000) {
    const part = parts[index % parts.length];
    if (part) out += part;
    index += 1;
  }
  return out.slice(0, 20_000);
}

const CASES: { name: string; input: string }[] = [
  { name: 'unclosed color marks', input: '{color:red}a '.repeat(200) },
  { name: 'color marks closed only at the end', input: '{color:red}a '.repeat(200) + '{/color}' },
  { name: 'unclosed highlight marks', input: '{highlight:yellow}a '.repeat(200) },
  { name: 'unclosed italic marks', input: '*a '.repeat(500) },
  { name: 'unclosed bold marks', input: '**a '.repeat(500) },
  { name: 'unclosed strike marks', input: '~~a '.repeat(500) },
  { name: 'unclosed link labels', input: '[a '.repeat(500) },
  { name: 'unclosed link hrefs', input: '[a]('.repeat(500) },
  { name: 'mixed unclosed marks', input: '**a *b ~~c [d {color:red}e '.repeat(100) },
  { name: 'a long realistic paragraph', input: realisticParagraph() },
];

describe('parseInline performance', () => {
  it.each(CASES)('$name finishes quickly and round-trips', ({ input }) => {
    const start = performance.now();
    const nodes = parseInline(input);
    expect(performance.now() - start).toBeLessThan(50);
    expect(parseInline(serializeInline(nodes))).toEqual(nodes);
  });
});
