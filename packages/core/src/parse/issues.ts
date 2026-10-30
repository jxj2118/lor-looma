import type { z } from 'zod';
import { ID_PATTERN } from '../ids';

export interface ParseIssue {
  /** Dot/bracket path into the document, e.g. `cards[2].body[0].level`. `$` for the root. */
  path: string;
  message: string;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** One line for a model: `path: message`, or just `message` at the document root. */
export function formatIssue(issue: ParseIssue): string {
  if (issue.path === '$') return issue.message;
  return `${issue.path}: ${issue.message}`;
}

export function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '$';
  let out = '';
  for (let index = 0; index < path.length; index += 1) {
    const key = path[index];
    if (key === undefined) continue;
    if (typeof key === 'number') {
      out += `[${key}]`;
      continue;
    }
    const text = typeof key === 'string' ? key : (key.description ?? 'symbol');
    if (IDENTIFIER.test(text)) out += index === 0 ? text : `.${text}`;
    else out += `[${JSON.stringify(text)}]`;
  }
  return out;
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? 'undefined';
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function readPath(
  input: unknown,
  path: readonly PropertyKey[],
): { found: boolean; value: unknown } {
  let current = input;
  for (const key of path) {
    if (typeof key === 'symbol' || current === null || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    if (!Object.prototype.hasOwnProperty.call(current, key))
      return { found: false, value: undefined };
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return { found: true, value: current };
}

function sizeMessage(
  code: 'too_small' | 'too_big',
  origin: string,
  limit: number | bigint,
  inclusive: boolean | undefined,
): string {
  const lower = code === 'too_small';
  if (origin === 'array' || origin === 'set') {
    return lower ? `must have at least ${limit} items` : `must have at most ${limit} items`;
  }
  if (origin === 'string') {
    return lower
      ? `must have at least ${limit} characters`
      : `must have at most ${limit} characters`;
  }
  if (lower) return inclusive === false ? `must be > ${limit}` : `must be >= ${limit}`;
  return inclusive === false ? `must be < ${limit}` : `must be <= ${limit}`;
}

function unionValues(issue: z.core.$ZodIssue & { code: 'invalid_union' }): unknown[] {
  const values: unknown[] = [];
  for (const group of issue.errors) {
    for (const inner of group) {
      if (inner.code === 'invalid_value') values.push(...inner.values);
    }
  }
  return values;
}

function messageFromZodIssue(issue: z.core.$ZodIssue, input: unknown, hasInput: boolean): string {
  const located = hasInput ? readPath(input, issue.path) : undefined;
  const missing = hasInput && (!located?.found || located.value === undefined);

  switch (issue.code) {
    case 'invalid_type':
      if (missing) return `is required (expected ${issue.expected})`;
      if (located?.found) return `expected ${issue.expected}, received ${typeName(located.value)}`;
      return issue.message;
    case 'invalid_value': {
      const options = issue.values.map((value) => formatValue(value)).join(', ');
      if (!located?.found) return `must be one of ${options}`;
      return `must be one of ${options}; received ${formatValue(located.value)}`;
    }
    case 'invalid_union': {
      if (
        issue.discriminator === 'type' ||
        issue.discriminator === 'kind' ||
        issue.discriminator === 'op'
      ) {
        const rawOptions = 'options' in issue ? issue.options : undefined;
        const options = (rawOptions ?? [])
          .map((value) => (typeof value === 'string' ? value : formatValue(value)))
          .join(', ');
        const received = located?.found ? formatValue(located.value) : undefined;
        if (issue.discriminator === 'op' && received === undefined) {
          return options ? `is required (expected one of ${options})` : 'is required';
        }
        const head =
          received === undefined
            ? `unknown ${issue.discriminator}`
            : `unknown ${issue.discriminator} ${received}`;
        return options ? `${head}; expected one of ${options}` : head;
      }
      const values = unionValues(issue);
      if (values.length === 0) return issue.message;
      const rendered = values.map((value) => formatValue(value));
      if (missing) return `is required (expected ${rendered.join(' | ')})`;
      const options = rendered.join(', ');
      if (!located?.found) return `must be one of ${options}`;
      return `must be one of ${options}; received ${formatValue(located.value)}`;
    }
    case 'too_small':
      return sizeMessage('too_small', issue.origin, issue.minimum, issue.inclusive);
    case 'too_big':
      return sizeMessage('too_big', issue.origin, issue.maximum, issue.inclusive);
    case 'invalid_format':
      if (issue.format === 'regex' && issue.pattern?.includes(ID_PATTERN.source)) {
        return 'must be a valid id (letter first, then letters, digits, "_" or "-", max 64 chars)';
      }
      return 'has an invalid format';
    case 'unrecognized_keys':
      return `unknown key(s): ${issue.keys.join(', ')}`;
    default:
      return issue.message;
  }
}

export function zodIssuesToParseIssues(
  issues: readonly z.core.$ZodIssue[],
  input?: unknown,
): ParseIssue[] {
  const hasInput = arguments.length >= 2;
  const seen = new Set<string>();
  const out: ParseIssue[] = [];
  for (const issue of issues) {
    const path = formatPath(issue.path);
    const message = messageFromZodIssue(issue, input, hasInput);
    const fingerprint = `${path}\0${message}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push({ path, message });
  }
  return out;
}
