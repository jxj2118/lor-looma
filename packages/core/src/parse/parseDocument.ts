import { LoomaDocumentSchema } from '../schema/document';
import type { LoomaDocument } from '../schema/document';
import { zodIssuesToParseIssues } from './issues';
import type { ParseIssue } from './issues';
import { migrateDocument } from './migrate';
import { cloneJson, isPlainObject, preprocessDocument } from './repair';
import { validateDocumentSemantics } from './semantics';

export interface ParseOptions {
  /** Fill in missing ids and derivable fields, rename duplicate ids, convert unknown block types. Default true. */
  repair?: boolean;
}

export type ParseResult =
  { ok: true; doc: LoomaDocument; warnings: ParseIssue[] } | { ok: false; errors: ParseIssue[] };

export function parseDocument(input: unknown, options?: ParseOptions): ParseResult {
  const repair = options?.repair !== false;
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, errors: [{ path: '$', message: `invalid JSON: ${detail}` }] };
    }
  }
  if (!isPlainObject(value)) {
    return { ok: false, errors: [{ path: '$', message: 'document must be a JSON object' }] };
  }

  const doc = cloneJson(value);
  const warnings: ParseIssue[] = [];
  const versionError = migrateDocument(doc, repair, warnings);
  if (versionError) return { ok: false, errors: [versionError] };
  preprocessDocument(doc, warnings, repair);

  const parsed = LoomaDocumentSchema.safeParse(doc);
  if (!parsed.success)
    return { ok: false, errors: zodIssuesToParseIssues(parsed.error.issues, doc) };

  const semantic = validateDocumentSemantics(parsed.data);
  if (semantic.length > 0) return { ok: false, errors: semantic };
  return { ok: true, doc: parsed.data, warnings };
}
