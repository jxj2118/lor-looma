import { LOOMA_SCHEMA_VERSION } from '../version';
import type { ParseIssue } from './issues';

/** Migrations keyed by the version they upgrade from. v1 is the first version, so this is empty. */
export const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> =
  {};

export function runMigrations<T>(
  doc: T,
  from: number,
  migrations: Record<number, (doc: T) => T>,
): T {
  let current = doc;
  for (
    let version = from;
    Object.prototype.hasOwnProperty.call(migrations, version);
    version += 1
  ) {
    const step = migrations[version];
    if (!step) break;
    current = step(current);
  }
  return current;
}

function formatReceived(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? 'undefined';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

export function migrateDocument(
  doc: Record<string, unknown>,
  repair: boolean,
  warnings: ParseIssue[],
): ParseIssue | undefined {
  const missing = !Object.prototype.hasOwnProperty.call(doc, 'looma') || doc.looma === undefined;
  if (missing) {
    if (!repair) return { path: 'looma', message: 'looma: is required (expected 1)' };
    doc.looma = 1;
    warnings.push({ path: 'looma', message: 'looma: missing schema version, assumed 1' });
  } else if (!isPositiveInteger(doc.looma)) {
    return {
      path: 'looma',
      message: `looma: must be a positive integer; received ${formatReceived(doc.looma)}`,
    };
  } else if (doc.looma > LOOMA_SCHEMA_VERSION) {
    return {
      path: 'looma',
      message: `looma: document uses schema version ${doc.looma}, but this library only supports up to ${LOOMA_SCHEMA_VERSION}`,
    };
  }

  const version = doc.looma;
  if (!isPositiveInteger(version)) {
    return { path: 'looma', message: 'looma: must be a positive integer; received undefined' };
  }
  const migrated = runMigrations(doc, version, MIGRATIONS);
  if (migrated !== doc) {
    for (const key of Object.keys(doc)) delete doc[key];
    Object.assign(doc, migrated);
  }
  return undefined;
}
