const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const ZIP64_MARKER = 0xffffffff;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export type UnzipResult =
  { ok: true; files: Map<string, Uint8Array> } | { ok: false; error: string };

interface ZipEntry {
  name: Uint8Array;
  data: Uint8Array;
  compressed: Uint8Array;
  crc: number;
  method: number;
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function readU16(data: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > data.length) return null;
  return data[offset]! | (data[offset + 1]! << 8);
}

function readU32(data: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > data.length) return null;
  return (
    (data[offset]! |
      (data[offset + 1]! << 8) |
      (data[offset + 2]! << 16) |
      (data[offset + 3]! << 24)) >>>
    0
  );
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let crc = n;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[n] = crc >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(name: string): string {
  const slashes = name.replaceAll('\\', '/');
  let start = 0;
  while (start < slashes.length && slashes[start] === '/') start += 1;
  return slashes.slice(start);
}

async function transformRaw(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  const consume = (async () => {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value && next.value.length > 0) chunks.push(next.value);
    }
  })();
  const produce = (async () => {
    if (input.length > 0) await writer.write(input);
    await writer.close();
  })();
  await Promise.all([produce, consume]);
  return concat(chunks);
}

async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  return transformRaw(input, new DecompressionStream('deflate-raw'));
}

async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
  return transformRaw(input, new CompressionStream('deflate-raw'));
}

function findEocd(data: Uint8Array): number | null {
  if (data.length < 22) return null;
  const earliest = Math.max(0, data.length - (22 + 0xffff));
  let fallback: number | null = null;
  for (let offset = data.length - 22; offset >= earliest; offset -= 1) {
    if (readU32(data, offset) !== SIG_EOCD) continue;
    const commentLength = readU16(data, offset + 20);
    if (commentLength === null) continue;
    if (offset + 22 + commentLength === data.length) return offset;
    if (fallback === null && offset + 22 + commentLength <= data.length) fallback = offset;
  }
  return fallback;
}

function fail(error: string): UnzipResult {
  return { ok: false, error };
}

async function readArchive(data: Uint8Array): Promise<UnzipResult> {
  const eocd = findEocd(data);
  if (eocd === null) return fail('ZIP end of central directory not found');

  const diskNumber = readU16(data, eocd + 4);
  const cdDisk = readU16(data, eocd + 6);
  const entryCount = readU16(data, eocd + 10);
  const cdSize = readU32(data, eocd + 12);
  const cdOffset = readU32(data, eocd + 16);
  if (
    diskNumber === null ||
    cdDisk === null ||
    entryCount === null ||
    cdSize === null ||
    cdOffset === null
  ) {
    return fail('ZIP end of central directory is truncated');
  }
  if (diskNumber !== 0 || cdDisk !== 0) return fail('Multi-disk ZIP archives are not supported');
  if (entryCount === 0xffff || cdOffset === ZIP64_MARKER || cdSize === ZIP64_MARKER) {
    return fail('ZIP64 archives are not supported');
  }
  if (cdOffset + cdSize > data.length) return fail('ZIP central directory is truncated');

  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  let cursor = cdOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(data, cursor) !== SIG_CENTRAL)
      return fail('ZIP central directory entry is invalid');
    const flags = readU16(data, cursor + 8);
    const method = readU16(data, cursor + 10);
    const compressedSize = readU32(data, cursor + 20);
    const uncompressedSize = readU32(data, cursor + 24);
    const nameLength = readU16(data, cursor + 28);
    const extraLength = readU16(data, cursor + 30);
    const commentLength = readU16(data, cursor + 32);
    const localOffset = readU32(data, cursor + 42);
    if (
      flags === null ||
      method === null ||
      compressedSize === null ||
      uncompressedSize === null ||
      nameLength === null ||
      extraLength === null ||
      commentLength === null ||
      localOffset === null
    ) {
      return fail('ZIP central directory entry is truncated');
    }
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > data.length) {
      return fail('ZIP central directory entry is truncated');
    }
    const rawName = decoder.decode(data.subarray(nameStart, nameEnd));
    const name = normalizeZipPath(rawName);
    cursor = nameEnd + extraLength + commentLength;

    if ((flags & FLAG_ENCRYPTED) !== 0) return fail(`ZIP entry "${name}" is encrypted`);
    if (
      compressedSize === ZIP64_MARKER ||
      uncompressedSize === ZIP64_MARKER ||
      localOffset === ZIP64_MARKER
    ) {
      return fail('ZIP64 archives are not supported');
    }
    if (name.length === 0 || name.endsWith('/')) continue;

    if (readU32(data, localOffset) !== SIG_LOCAL) {
      return fail(`ZIP local header for "${name}" is missing`);
    }
    const localNameLength = readU16(data, localOffset + 26);
    const localExtraLength = readU16(data, localOffset + 28);
    if (localNameLength === null || localExtraLength === null) {
      return fail(`ZIP local header for "${name}" is truncated`);
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart < 0 || dataEnd > data.length) {
      return fail(`ZIP entry "${name}" exceeds the archive`);
    }
    const compressed = data.subarray(dataStart, dataEnd);

    if (method === METHOD_STORED) {
      if (compressedSize !== uncompressedSize) {
        return fail(`Stored ZIP entry "${name}" has a size mismatch`);
      }
      files.set(name, compressed.slice());
      continue;
    }
    if (method === METHOD_DEFLATE) {
      let inflated: Uint8Array;
      try {
        inflated = compressedSize === 0 ? new Uint8Array() : await inflateRaw(compressed.slice());
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return fail(`Failed to inflate "${name}": ${detail}`);
      }
      if (inflated.length !== uncompressedSize) {
        return fail(`Inflated ZIP entry "${name}" has a size mismatch`);
      }
      files.set(name, inflated);
      continue;
    }
    return fail(`Unsupported compression method ${method} for "${name}"`);
  }

  return { ok: true, files };
}

/** Reads a `.pptx` (ZIP) archive. Corrupt input returns `{ ok: false }` instead of throwing. */
export async function unzipPptx(input: ArrayBuffer | Uint8Array): Promise<UnzipResult> {
  try {
    return await readArchive(toBytes(input));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(detail || 'Invalid ZIP archive');
  }
}

/**
 * Builds a ZIP archive in memory. `compress: true` uses raw deflate (method 8);
 * otherwise entries are stored (method 0) with a CRC-32.
 */
export async function createZip(
  entries: Record<string, string | Uint8Array>,
  options?: { compress?: boolean },
): Promise<Uint8Array> {
  const compress = options?.compress === true;
  const encoder = new TextEncoder();
  const prepared: ZipEntry[] = [];
  for (const [path, content] of Object.entries(entries)) {
    const data = typeof content === 'string' ? encoder.encode(content) : content.slice();
    const method = compress && data.length > 0 ? METHOD_DEFLATE : METHOD_STORED;
    const compressed = method === METHOD_DEFLATE ? await deflateRaw(data) : data;
    prepared.push({
      name: encoder.encode(path),
      data,
      compressed,
      crc: crc32(data),
      method,
    });
  }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of prepared) {
    const local = concat([
      u32(SIG_LOCAL),
      u16(20),
      u16(FLAG_UTF8),
      u16(entry.method),
      u16(0),
      u16(0x21),
      u32(entry.crc),
      u32(entry.compressed.length),
      u32(entry.data.length),
      u16(entry.name.length),
      u16(0),
      entry.name,
      entry.compressed,
    ]);
    localParts.push(local);
    centralParts.push(
      concat([
        u32(SIG_CENTRAL),
        u16(20),
        u16(20),
        u16(FLAG_UTF8),
        u16(entry.method),
        u16(0),
        u16(0x21),
        u32(entry.crc),
        u32(entry.compressed.length),
        u32(entry.data.length),
        u16(entry.name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        entry.name,
      ]),
    );
    offset += local.length;
  }

  const central = concat(centralParts);
  const eocd = concat([
    u32(SIG_EOCD),
    u16(0),
    u16(0),
    u16(prepared.length),
    u16(prepared.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...localParts, central, eocd]);
}
