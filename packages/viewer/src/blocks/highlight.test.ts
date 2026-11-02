import { describe, expect, it } from 'vitest';
import { tokenizeCode } from './highlight';

const SAMPLES: Array<[string, string]> = [
  ['ts', 'const greet = (name: string) => {\n  return `Hi ${name}`;\n};\n'],
  ['js', 'function add(a, b) {\n  // sum\n  return a + b;\n}\n'],
  ['tsx', 'export function App() {\n  return <Button label="Go" />;\n}\n'],
  ['py', 'def greet(name):\n    """hi"""\n    return f"Hi {name}"\n'],
  ['json', '{\n  "ok": true,\n  "n": 1.5\n}\n'],
  ['bash', '#!/bin/sh\nif [ -n "$name" ]; then\n  echo "$name"\nfi\n'],
  ['html', '<p class="note">Hello</p>\n<!-- end -->\n'],
  ['css', '.note {\n  color: #2563eb; /* brand */\n}\n'],
  ['sql', 'SELECT id FROM trees WHERE name IS NULL;\n'],
  ['go', 'func main() {\n  fmt.Println("hi")\n}\n'],
  ['rust', 'fn main() {\n  let name = "leaf";\n  println!("{}", name);\n}\n'],
  ['markdown', '# Title\n\nUse `code` here.\n'],
  ['text', '1a Leaves opposite\n1b Leaves alternate\n'],
  ['plaintext', 'keep every space  \n'],
];

describe('tokenizeCode', () => {
  it('is lossless for every supported language, including odd input', () => {
    const odd = ['', ' ', '\n\t', '/*', '"unterminated', 'const', '😀 const', '\\', '<<<'];
    for (const [language, code] of SAMPLES) {
      expect(
        tokenizeCode(code, language)
          .map((token) => token.value)
          .join(''),
        language,
      ).toBe(code);
    }
    for (const code of odd) {
      for (const language of ['ts', 'python', 'html', 'text', undefined]) {
        expect(
          tokenizeCode(code, language)
            .map((token) => token.value)
            .join(''),
        ).toBe(code);
      }
    }
  });

  it('keeps plain text as one token', () => {
    const code = '1a Leaves opposite\n1b Leaves alternate';
    expect(tokenizeCode(code, 'text')).toEqual([{ kind: 'plain', value: code }]);
    expect(tokenizeCode(code, 'plaintext')).toEqual([{ kind: 'plain', value: code }]);
    expect(tokenizeCode(code)).toEqual([{ kind: 'plain', value: code }]);
    expect(tokenizeCode('', 'ts')).toEqual([]);
  });

  it('classifies keywords, strings, comments, numbers, calls, and types', () => {
    const tokens = tokenizeCode('const label: string = greet("leaf"); // note\n', 'typescript');
    expect(tokens.find((token) => token.value === 'const')?.kind).toBe('keyword');
    expect(tokens.find((token) => token.value === 'string')?.kind).toBe('type');
    expect(tokens.find((token) => token.value === 'greet')?.kind).toBe('function');
    expect(tokens.find((token) => token.value === '"leaf"')?.kind).toBe('string');
    expect(tokens.find((token) => token.value === '// note')?.kind).toBe('comment');
    expect(
      tokenizeCode('SELECT * FROM trees;', 'sql').some((token) => token.kind === 'keyword'),
    ).toBe(true);
    expect(tokenizeCode('def read():\n    pass\n', 'python').map((token) => token.kind)).toContain(
      'keyword',
    );
    expect(tokenizeCode('<p>Hi</p>', 'html').find((token) => token.value === 'p')?.kind).toBe(
      'type',
    );
  });
});
