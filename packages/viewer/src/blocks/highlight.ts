export type TokenKind =
  'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'function' | 'punctuation';

export interface CodeToken {
  kind: TokenKind;
  value: string;
}

const C_KEYWORDS = [
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'yield',
];

const GO_KEYWORDS = [
  'break',
  'case',
  'chan',
  'const',
  'continue',
  'default',
  'defer',
  'else',
  'fallthrough',
  'for',
  'func',
  'go',
  'goto',
  'if',
  'import',
  'interface',
  'map',
  'package',
  'range',
  'return',
  'select',
  'struct',
  'switch',
  'type',
  'var',
];

const RUST_KEYWORDS = [
  'as',
  'async',
  'await',
  'break',
  'const',
  'continue',
  'crate',
  'else',
  'enum',
  'extern',
  'false',
  'fn',
  'for',
  'if',
  'impl',
  'in',
  'let',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'return',
  'self',
  'Self',
  'static',
  'struct',
  'super',
  'trait',
  'true',
  'type',
  'unsafe',
  'use',
  'where',
  'while',
];

const PYTHON_KEYWORDS = [
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'False',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'None',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'True',
  'try',
  'while',
  'with',
  'yield',
];

const BASH_KEYWORDS = [
  'case',
  'do',
  'done',
  'elif',
  'else',
  'esac',
  'export',
  'fi',
  'for',
  'function',
  'if',
  'in',
  'local',
  'return',
  'then',
  'while',
];

const SQL_KEYWORDS = [
  'and',
  'as',
  'asc',
  'between',
  'by',
  'case',
  'create',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'from',
  'group',
  'having',
  'in',
  'inner',
  'insert',
  'into',
  'is',
  'join',
  'left',
  'like',
  'limit',
  'not',
  'null',
  'on',
  'or',
  'order',
  'outer',
  'right',
  'select',
  'set',
  'table',
  'then',
  'update',
  'values',
  'where',
];

const JSON_KEYWORDS = ['true', 'false', 'null'];

const TYPE_NAMES = [
  'any',
  'bool',
  'boolean',
  'byte',
  'error',
  'float',
  'float32',
  'float64',
  'int',
  'int32',
  'int64',
  'never',
  'number',
  'object',
  'string',
  'uint',
  'unknown',
  'void',
];

const PUNCTUATION = '(){}[].,;:+-*/%=<>!&|?^~@#';

interface ScanOptions {
  lineComments?: readonly string[];
  blockComments?: readonly (readonly [string, string])[];
  quotes?: readonly string[];
  charLiteral?: boolean;
  keywords?: readonly string[];
  ignoreCase?: boolean;
  types?: readonly string[];
  htmlTags?: boolean;
  punctuation?: string;
}

function plain(code: string): CodeToken[] {
  return code.length === 0 ? [] : [{ kind: 'plain', value: code }];
}

function normalize(language: string | undefined): string {
  return language?.trim().toLowerCase() ?? '';
}

function optionsFor(language: string | undefined): ScanOptions | null {
  const lang = normalize(language);
  if (lang === '' || lang === 'text' || lang === 'plaintext') return null;
  if (['js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx'].includes(lang)) {
    return {
      lineComments: ['//'],
      blockComments: [['/*', '*/']],
      quotes: ['`', '"', "'"],
      keywords: C_KEYWORDS,
      types: TYPE_NAMES,
      htmlTags: lang === 'jsx' || lang === 'tsx',
    };
  }
  if (lang === 'go') {
    return {
      lineComments: ['//'],
      blockComments: [['/*', '*/']],
      quotes: ['"', '`'],
      keywords: GO_KEYWORDS,
      types: TYPE_NAMES,
    };
  }
  if (lang === 'rust') {
    return {
      lineComments: ['//'],
      blockComments: [['/*', '*/']],
      quotes: ['"'],
      charLiteral: true,
      keywords: RUST_KEYWORDS,
      types: TYPE_NAMES,
    };
  }
  if (lang === 'py' || lang === 'python') {
    return {
      lineComments: ['#'],
      quotes: ['"""', "'''", '"', "'"],
      keywords: PYTHON_KEYWORDS,
      types: TYPE_NAMES,
    };
  }
  if (lang === 'json') {
    return { quotes: ['"'], keywords: JSON_KEYWORDS, punctuation: '{}[],:' };
  }
  if (lang === 'bash' || lang === 'sh') {
    return { lineComments: ['#'], quotes: ['"', "'"], keywords: BASH_KEYWORDS };
  }
  if (lang === 'html') {
    return {
      blockComments: [['<!--', '-->']],
      quotes: ['"', "'"],
      htmlTags: true,
      punctuation: '<>/=',
    };
  }
  if (lang === 'css') {
    return {
      blockComments: [['/*', '*/']],
      quotes: ['"', "'"],
      keywords: ['important'],
      punctuation: '{}:;,>%~+*()[].#',
    };
  }
  if (lang === 'sql') {
    return {
      lineComments: ['--'],
      blockComments: [['/*', '*/']],
      quotes: ["'", '"'],
      keywords: SQL_KEYWORDS,
      ignoreCase: true,
    };
  }
  if (lang === 'markdown' || lang === 'md') return { quotes: ['`'] };
  return null;
}

function startsWith(code: string, index: number, marker: string): boolean {
  return code.startsWith(marker, index);
}

function matchComment(code: string, index: number, options: ScanOptions): number {
  for (const marker of options.lineComments ?? []) {
    if (!startsWith(code, index, marker)) continue;
    let end = index + marker.length;
    while (end < code.length && code[end] !== '\n') end += 1;
    return end - index;
  }
  for (const pair of options.blockComments ?? []) {
    const [open, close] = pair;
    if (!open || !close || !startsWith(code, index, open)) continue;
    const found = code.indexOf(close, index + open.length);
    if (found < 0) return code.length - index;
    return found + close.length - index;
  }
  return 0;
}

function matchString(code: string, index: number, options: ScanOptions): number {
  if (options.charLiteral && code[index] === "'") {
    let end = index + 1;
    if (code[end] === '\\') end += 2;
    else end += 1;
    if (code[end] === "'") return end + 1 - index;
  }
  const quotes = [...(options.quotes ?? [])].sort((left, right) => right.length - left.length);
  const quote = quotes.find((marker) => startsWith(code, index, marker));
  if (!quote) return 0;
  let end = index + quote.length;
  while (end < code.length) {
    if (code[end] === '\\') {
      end += 2;
      continue;
    }
    if (startsWith(code, end, quote)) return end + quote.length - index;
    end += 1;
  }
  return code.length - index;
}

function matchNumber(code: string, index: number): number {
  const rest = code.slice(index);
  const match = /^(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?/.exec(rest);
  return match?.[0].length ?? 0;
}

function matchWord(code: string, index: number): number {
  const rest = code.slice(index);
  const match = /^[A-Za-z_$][\w$]*/.exec(rest);
  return match?.[0].length ?? 0;
}

function isKeyword(word: string, options: ScanOptions): boolean {
  const keywords = options.keywords ?? [];
  if (options.ignoreCase)
    return keywords.some((keyword) => keyword.toLowerCase() === word.toLowerCase());
  return keywords.includes(word);
}

function isTypeName(word: string, options: ScanOptions): boolean {
  return (options.types ?? []).includes(word) || /^[A-Z]/.test(word);
}

function scan(code: string, options: ScanOptions): CodeToken[] {
  const tokens: CodeToken[] = [];
  const punctuation = options.punctuation ?? PUNCTUATION;
  let index = 0;
  let plainStart = 0;
  let expectTag = false;

  const flush = (end: number) => {
    if (end > plainStart) tokens.push({ kind: 'plain', value: code.slice(plainStart, end) });
    plainStart = end;
  };

  const push = (kind: TokenKind, length: number) => {
    flush(index);
    tokens.push({ kind, value: code.slice(index, index + length) });
    index += length;
    plainStart = index;
  };

  while (index < code.length) {
    const comment = matchComment(code, index, options);
    if (comment > 0) {
      expectTag = false;
      push('comment', comment);
      continue;
    }
    const string = matchString(code, index, options);
    if (string > 0) {
      expectTag = false;
      push('string', string);
      continue;
    }
    if (options.htmlTags && startsWith(code, index, '</')) {
      push('punctuation', 2);
      expectTag = true;
      continue;
    }
    const word = matchWord(code, index);
    if (word > 0) {
      const value = code.slice(index, index + word);
      const rest = code.slice(index + word);
      let kind: TokenKind = 'plain';
      if (expectTag) kind = 'type';
      else if (isKeyword(value, options)) kind = 'keyword';
      else if (/^\s*\(/.test(rest)) kind = 'function';
      else if (isTypeName(value, options)) kind = 'type';
      expectTag = false;
      push(kind, word);
      continue;
    }
    const number = matchNumber(code, index);
    if (number > 0) {
      expectTag = false;
      push('number', number);
      continue;
    }
    const char = code[index] ?? '';
    if (punctuation.includes(char)) {
      push('punctuation', 1);
      expectTag = options.htmlTags === true && char === '<';
      continue;
    }
    expectTag = false;
    index += 1;
  }
  flush(code.length);
  return tokens;
}

/** Splits source into tokens whose values concatenate back to `code`. */
export function tokenizeCode(code: string, language?: string): CodeToken[] {
  const options = optionsFor(language);
  if (!options) return plain(code);
  return scan(code, options);
}
