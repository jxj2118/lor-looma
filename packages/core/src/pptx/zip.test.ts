import { describe, expect, it } from 'vitest';
import { createZip, unzipPptx } from './zip';

const encoder = new TextEncoder();

async function roundTrip(
  entries: Record<string, string | Uint8Array>,
  options?: { compress?: boolean },
): Promise<Map<string, Uint8Array>> {
  const zip = await createZip(entries, options);
  const opened = await unzipPptx(zip);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.error);
  return opened.files;
}

function text(files: Map<string, Uint8Array>, path: string): string {
  const bytes = files.get(path);
  expect(bytes).toBeDefined();
  return new TextDecoder().decode(bytes);
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    (data[offset]! |
      (data[offset + 1]! << 8) |
      (data[offset + 2]! << 16) |
      (data[offset + 3]! << 24)) >>>
    0
  );
}

function writeU16(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
  data[offset + 2] = (value >>> 16) & 0xff;
  data[offset + 3] = (value >>> 24) & 0xff;
}

describe('createZip / unzipPptx', () => {
  it('round-trips stored text, binary, empty, and unicode names', async () => {
    const binary = Uint8Array.from({ length: 256 }, (_, index) => index);
    const files = await roundTrip({
      'ppt/slides/slide1.xml': '<p:sld/>',
      'ppt/media/image1.png': binary,
      'empty.txt': '',
      'ppt/幻灯片.xml': '你好',
      'dir/': '',
    });
    expect(text(files, 'ppt/slides/slide1.xml')).toBe('<p:sld/>');
    expect(files.get('ppt/media/image1.png')).toEqual(binary);
    expect(files.get('empty.txt')).toEqual(new Uint8Array());
    expect(text(files, 'ppt/幻灯片.xml')).toBe('你好');
    expect(files.has('dir/')).toBe(false);
    expect(files.size).toBe(4);
  });

  it('stores a CRC-32 for method 0', async () => {
    const zip = await createZip({ 'a.txt': '123456789' });
    expect(readU16(zip, 8)).toBe(0);
    expect(readU32(zip, 14)).toBe(0xcbf43926);
    const opened = await unzipPptx(zip);
    expect(opened.ok).toBe(true);
  });

  it('round-trips deflate entries and writes method 8', async () => {
    const payload = 'slides'.repeat(80);
    const stored = await createZip({ 'ppt/slides/slide1.xml': payload });
    const zipped = await createZip({ 'ppt/slides/slide1.xml': payload }, { compress: true });
    expect(readU16(zipped, 8)).toBe(8);
    expect(zipped).not.toEqual(stored);
    const files = await roundTrip({ 'ppt/slides/slide1.xml': payload }, { compress: true });
    expect(text(files, 'ppt/slides/slide1.xml')).toBe(payload);
  });

  it('normalizes slashes and ignores bogus sizes in the local header', async () => {
    const zip = await createZip({
      '/ppt/slides/slide1.xml': '<p/>',
      'ppt\\media\\image1.png': Uint8Array.of(1, 2, 3, 4),
    });
    writeU16(zip, 6, readU16(zip, 6) | 0x0008);
    writeU32(zip, 14, 0);
    writeU32(zip, 18, 1);
    writeU32(zip, 22, 0);
    const opened = await unzipPptx(zip);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(text(opened.files, 'ppt/slides/slide1.xml')).toBe('<p/>');
    expect(opened.files.get('ppt/media/image1.png')).toEqual(Uint8Array.of(1, 2, 3, 4));
  });

  it('keeps bytes that look like an end-of-central-directory signature', async () => {
    const tricky = Uint8Array.from([0x50, 0x4b, 0x05, 0x06, 9, 9, 9, 9]);
    const files = await roundTrip({ 'ppt/media/fake.bin': tricky });
    expect(files.get('ppt/media/fake.bin')).toEqual(tricky);
  });

  it('reads an archive that has a comment after the central directory', async () => {
    const zip = await createZip({ 'ppt/presentation.xml': '<p:presentation/>' });
    const comment = encoder.encode('looma');
    const withComment = new Uint8Array(zip.length + comment.length);
    withComment.set(zip);
    withComment.set(comment, zip.length);
    writeU16(withComment, zip.length - 22 + 20, comment.length);
    const opened = await unzipPptx(withComment);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(text(opened.files, 'ppt/presentation.xml')).toBe('<p:presentation/>');
  });

  it('returns an empty map for an empty archive', async () => {
    const opened = await unzipPptx(await createZip({}));
    expect(opened).toEqual({ ok: true, files: new Map() });
  });

  it.each([
    ['empty', new Uint8Array()],
    ['short', Uint8Array.of(1, 2, 3, 4)],
    ['local header only', Uint8Array.of(0x50, 0x4b, 0x03, 0x04)],
    ['text', encoder.encode('not a zip')],
  ])('rejects %s input', async (_label, bytes) => {
    const opened = await unzipPptx(bytes);
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error).toMatch(/ZIP|Invalid/);
  });

  it('rejects a truncated archive, an encrypted entry, and an unsupported method', async () => {
    const zip = await createZip({ 'ppt/slides/slide1.xml': '<p:sld>hello</p:sld>' });
    const truncated = await unzipPptx(zip.slice(0, 20));
    expect(truncated.ok).toBe(false);

    const encrypted = zip.slice();
    const eocd = encrypted.length - 22;
    const cdOffset = readU32(encrypted, eocd + 16);
    writeU16(encrypted, cdOffset + 8, readU16(encrypted, cdOffset + 8) | 0x0001);
    const locked = await unzipPptx(encrypted);
    expect(locked).toEqual({ ok: false, error: 'ZIP entry "ppt/slides/slide1.xml" is encrypted' });

    const bizarre = zip.slice();
    const bizarreCd = readU32(bizarre, bizarre.length - 22 + 16);
    writeU16(bizarre, 8, 12);
    writeU16(bizarre, bizarreCd + 10, 12);
    const unsupported = await unzipPptx(bizarre);
    expect(unsupported.ok).toBe(false);
    if (unsupported.ok) return;
    expect(unsupported.error).toContain('Unsupported compression method 12');
  });

  it('rejects stored bytes labeled as deflate', async () => {
    const zip = await createZip({ 'a.txt': 'hello world' });
    const eocd = zip.length - 22;
    const cdOffset = readU32(zip, eocd + 16);
    writeU16(zip, 8, 8);
    writeU16(zip, cdOffset + 10, 8);
    const opened = await unzipPptx(zip);
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.error).toMatch(/inflate|size mismatch/i);
  });

  it('accepts an ArrayBuffer view of a larger buffer', async () => {
    const zip = await createZip({ 'note.txt': 'hi' });
    const padded = new Uint8Array(zip.length + 8);
    padded.set(zip, 4);
    const view = padded.subarray(4, 4 + zip.length);
    const opened = await unzipPptx(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
    );
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(text(opened.files, 'note.txt')).toBe('hi');
  });
});
