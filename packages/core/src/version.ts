import type { ParseIssue } from './parse/issues';

/** Major version of the `.looma` document schema produced by this package. */
export const LOOMA_SCHEMA_VERSION = 2 as const;

/**
 * Checks whether a raw document's `looma` schema version is supported by a consumer
 * supporting up to `maxSupportedVersion` (defaults to `LOOMA_SCHEMA_VERSION`).
 */
export function assertSupportedSchemaVersion(
  doc: unknown,
  maxSupportedVersion: number = LOOMA_SCHEMA_VERSION,
): ParseIssue | undefined {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { path: '$', message: 'document must be a JSON object' };
  }
  const raw = (doc as Record<string, unknown>).looma;
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return {
      path: 'looma',
      message: `must be a positive integer; received ${JSON.stringify(raw)}`,
    };
  }
  if (raw > maxSupportedVersion) {
    return {
      path: 'looma',
      message: `document uses schema version ${raw}, but this library only supports up to ${maxSupportedVersion}`,
    };
  }
  return undefined;
}
