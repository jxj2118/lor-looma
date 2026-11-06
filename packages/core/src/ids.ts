export const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

export const ID_PREFIX = {
  card: 'c_',
  container: 'n_',
  block: 'b_',
  element: 'el_',
  asset: 'img_',
  document: 'doc_',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomSuffix(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** Creates a new id for the given kind. Pass `taken` to guarantee it is not already in use. */
export function createId(kind: IdKind, taken?: ReadonlySet<string>): string {
  for (;;) {
    const id = `${ID_PREFIX[kind]}${randomSuffix(8)}`;
    if (!taken?.has(id)) return id;
  }
}

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}
