import { describe, expect, it } from 'vitest';
import { LoomaDocumentSchema } from '../schema/document';
import { formatIssue, formatPath, zodIssuesToParseIssues } from './issues';

function issuesFor(input: unknown) {
  const result = LoomaDocumentSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) return [];
  return zodIssuesToParseIssues(result.error.issues, input);
}

describe('formatIssue', () => {
  it('prints path and message on one line, except at the root', () => {
    expect(formatIssue({ path: 'id', message: 'missing or invalid id, generated "doc_x"' })).toBe(
      'id: missing or invalid id, generated "doc_x"',
    );
    expect(formatIssue({ path: 'looma', message: 'missing schema version, assumed 1' })).toBe(
      'looma: missing schema version, assumed 1',
    );
    expect(formatIssue({ path: '$', message: 'document must be a JSON object' })).toBe(
      'document must be a JSON object',
    );
  });
});

describe('formatPath', () => {
  it('formats root, indexes, identifiers, and quoted keys', () => {
    expect(formatPath([])).toBe('$');
    expect(formatPath(['cards', 2, 'body', 0, 'level'])).toBe('cards[2].body[0].level');
    expect(formatPath(['assets', 'img 1'])).toBe('assets["img 1"]');
    expect(formatPath(['theme', 'overrides', 'fontScale'])).toBe('theme.overrides.fontScale');
  });
});

describe('zodIssuesToParseIssues', () => {
  it('says a missing heading level is required', () => {
    expect(
      issuesFor({
        looma: 1,
        id: 'doc_1',
        cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'heading', text: 'Hi' }] }],
      }),
    ).toEqual([{ path: 'cards[0].body[0].level', message: 'is required (expected 1 | 2 | 3)' }]);
  });

  it('names the allowed heading levels when the value is wrong', () => {
    expect(
      issuesFor({
        looma: 1,
        id: 'doc_1',
        cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'heading', level: 4 }] }],
      }),
    ).toEqual([{ path: 'cards[0].body[0].level', message: 'must be one of 1, 2, 3; received 4' }]);
  });

  it('omits the received value when the original input is not provided', () => {
    const result = LoomaDocumentSchema.safeParse({
      looma: 1,
      id: 'doc_1',
      cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'heading', level: 4 }] }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(zodIssuesToParseIssues(result.error.issues)).toEqual([
      { path: 'cards[0].body[0].level', message: 'must be one of 1, 2, 3' },
    ]);
  });

  it('describes an unknown block type', () => {
    expect(
      issuesFor({
        looma: 1,
        id: 'doc_1',
        cards: [{ id: 'c_1', body: [{ id: 'b_1', type: 'video' }] }],
      }),
    ).toEqual([
      {
        path: 'cards[0].body[0].type',
        message:
          'unknown type "video"; expected one of heading, paragraph, list, image, table, callout, quote, divider, code, unknown, stack, columns, grid',
      },
    ]);
  });

  it('describes an unknown asset kind', () => {
    expect(
      issuesFor({
        looma: 1,
        id: 'doc_1',
        assets: { img_1: { kind: 'video', src: 'https://example.com/a.png' } },
      }),
    ).toEqual([
      { path: 'assets.img_1.kind', message: 'unknown kind "video"; expected one of image' },
    ]);
  });

  it('describes columns that are too short and theme numbers that are out of range', () => {
    expect(
      issuesFor({
        looma: 1,
        id: 'doc_1',
        cards: [
          {
            id: 'c_1',
            body: [
              {
                id: 'n_1',
                type: 'columns',
                widths: [1],
                children: [[{ id: 'b_1', type: 'paragraph' }]],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      { path: 'cards[0].body[0].widths', message: 'must have at least 2 items' },
      { path: 'cards[0].body[0].children', message: 'must have at least 2 items' },
    ]);

    expect(issuesFor({ looma: 1, id: 'doc_1', theme: { overrides: { fontScale: 9 } } })).toEqual([
      { path: 'theme.overrides.fontScale', message: 'must be <= 1.4' },
    ]);

    expect(issuesFor({ looma: 1, id: 'doc_1', theme: { overrides: { fontScale: 0.1 } } })).toEqual([
      { path: 'theme.overrides.fontScale', message: 'must be >= 0.8' },
    ]);
  });

  it('rejects an invalid id and unknown theme keys', () => {
    expect(issuesFor({ looma: 1, id: '1bad' })).toEqual([
      {
        path: 'id',
        message:
          'must be a valid id (letter first, then letters, digits, "_" or "-", max 64 chars)',
      },
    ]);
    expect(
      issuesFor({
        looma: 1,
        id: 'doc_1',
        theme: { overrides: { colorEvil: '#fff', alsoBad: 1 } },
      }),
    ).toEqual([{ path: 'theme.overrides', message: 'unknown key(s): colorEvil, alsoBad' }]);
  });

  it('formats invalid types, enums, and custom messages', () => {
    expect(issuesFor({ looma: 1 })).toEqual([
      { path: 'id', message: 'is required (expected string)' },
    ]);
    expect(issuesFor({ looma: 1, id: 'doc_1', title: 1 })).toEqual([
      { path: 'title', message: 'expected string, received number' },
    ]);
    expect(issuesFor({ looma: 1, id: 'doc_1', theme: { preset: 'neon' } })).toEqual([
      {
        path: 'theme.preset',
        message: 'must be one of "clean", "dark", "warm", "serif"; received "neon"',
      },
    ]);
    expect(
      issuesFor({ looma: 1, id: 'doc_1', theme: { overrides: { colorPrimary: 'red' } } }),
    ).toEqual([
      {
        path: 'theme.overrides.colorPrimary',
        message: 'must be #rgb, #rrggbb, rgb(), or hsl()',
      },
    ]);
  });

  it('drops duplicate messages on the same path', () => {
    const result = LoomaDocumentSchema.safeParse({ looma: 1, id: '1bad' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const once = zodIssuesToParseIssues(result.error.issues, { looma: 1, id: '1bad' });
    expect(
      zodIssuesToParseIssues([...result.error.issues, ...result.error.issues], {
        looma: 1,
        id: '1bad',
      }),
    ).toEqual(once);
  });
});
