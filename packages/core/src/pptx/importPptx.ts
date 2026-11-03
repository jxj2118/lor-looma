import { MAX_LIST_DEPTH } from '../constants';
import type { ThemePreset } from '../constants';
import { createId } from '../ids';
import type { IdKind } from '../ids';
import { inlineToPlainText, isSafeHref, normalizeInline, serializeInline } from '../inline';
import type { InlineNode } from '../inline';
import { parseDocument } from '../parse';
import type { ImageAsset } from '../schema/asset';
import type { ListItem } from '../schema/blocks';
import type { CardAccent, CardBackground, LoomaCard } from '../schema/card';
import type { LoomaDocument } from '../schema/document';
import type { LoomaNode } from '../schema/nodes';
import { isImageSrc } from '../schema/primitives';
import { attr, child, children, descendants, localName, parseXml, textContent } from './xml';
import type { XmlElement } from './xml';
import { unzipPptx } from './zip';

/** Widescreen 16:9, in English Metric Units. 4:3 decks declare 9144000 x 6858000 instead. */
const DEFAULT_SLIDE_CX = 12_192_000;
const DEFAULT_SLIDE_CY = 6_858_000;
const FULL_WIDTH_RATIO = 0.72;
const BACKDROP_AREA = 0.75;

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export interface ImportPptxOptions {
  /** Fallback document title (e.g. filename without .pptx) when docProps/core.xml has no title. */
  title?: string;
  /** Initial theme preset for the imported deck. Defaults to 'clean'. */
  themePreset?: ThemePreset;
  /**
   * Optional async uploader for extracted media files.
   * When omitted, supported images are embedded as `data:image/...;base64,...` URLs.
   */
  uploadAsset?: (file: {
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<{ src: string; width?: number; height?: number; alt?: string }>;
}

export type ImportPptxResult =
  { ok: true; doc: LoomaDocument; warnings: string[] } | { ok: false; error: string };

interface Box {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

interface Transform {
  offX: number;
  offY: number;
  extX: number;
  extY: number;
  chOffX: number;
  chOffY: number;
  chExtX: number;
  chExtY: number;
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

interface Placed {
  box: Box;
  blocks: LoomaNode[];
  kind: 'text' | 'image' | 'table';
  assetId?: string;
}

interface RichParagraph {
  text: string;
  align?: 'center' | 'right';
  list: 'bullet' | 'number' | null;
  level: number;
  size: number | null;
}

interface ImportState {
  files: Map<string, Uint8Array>;
  warnings: string[];
  assets: Record<string, ImageAsset>;
  assetByPath: Map<string, string>;
  ids: (kind: IdKind) => string;
  uploadAsset?: ImportPptxOptions['uploadAsset'];
  slide: Box;
}

interface SlideContext extends ImportState {
  part: string;
  rels: Relationship[];
  index: number;
}

/** Converts a `.pptx` package into a validated `.looma` document. */
export async function importPptx(
  input: ArrayBuffer | Uint8Array,
  options?: ImportPptxOptions,
): Promise<ImportPptxResult> {
  const archive = await unzipPptx(input);
  if (!archive.ok) return archive;

  const warnings: string[] = [];
  const taken = new Set<string>();
  const state: ImportState = {
    files: archive.files,
    warnings,
    assets: {},
    assetByPath: new Map(),
    ids: (kind) => {
      const id = createId(kind, taken);
      taken.add(id);
      return id;
    },
    uploadAsset: options?.uploadAsset,
    slide: readSlideSize(archive.files),
  };

  const parts = slideOrder(archive.files);
  if (parts.length === 0) return { ok: false, error: 'No slides found in the PowerPoint file.' };

  const cards: LoomaCard[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? '';
    const xml = readXml(archive.files, part);
    if (!xml) {
      warn(warnings, `Skipped unreadable slide "${part}".`);
      continue;
    }
    cards.push(
      await convertSlide(
        { ...state, part, rels: readRelationships(archive.files, part), index },
        xml,
      ),
    );
  }
  if (cards.length === 0) return { ok: false, error: 'No slides found in the PowerPoint file.' };

  const candidate = {
    looma: 1 as const,
    id: state.ids('document'),
    title: documentTitle(archive.files, cards, options?.title),
    format: 'presentation' as const,
    theme: { preset: options?.themePreset ?? 'clean' },
    assets: state.assets,
    cards,
  };
  const parsed = parseDocument(candidate, { repair: true });
  if (!parsed.ok) {
    const detail = parsed.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    return { ok: false, error: `PowerPoint import failed validation: ${detail}` };
  }
  for (const issue of parsed.warnings) warn(warnings, issue.message);
  return { ok: true, doc: parsed.doc, warnings };
}

function documentTitle(
  files: Map<string, Uint8Array>,
  cards: readonly LoomaCard[],
  fallback: string | undefined,
): string {
  const fromCore = coreTitle(files);
  if (fromCore) return fromCore;
  const fromOptions = fallback?.trim();
  if (fromOptions) return fromOptions;
  const heading = firstHeading(cards[0]);
  if (heading) return heading;
  return 'UntitledPresentation';
}

function coreTitle(files: Map<string, Uint8Array>): string | undefined {
  const core = readXml(files, 'docProps/core.xml');
  if (!core) return undefined;
  const title = descendants(core, 'title')[0];
  const text = title ? textContent(title).trim() : '';
  return text || undefined;
}

function firstHeading(card: LoomaCard | undefined): string | undefined {
  if (!card) return undefined;
  for (const node of card.body) {
    if (node.type === 'heading' && node.text.trim()) return inlineToPlainText(node.text).trim();
    if (node.type === 'columns') {
      for (const column of node.children) {
        for (const childNode of column) {
          if (childNode.type === 'heading' && childNode.text.trim()) {
            return inlineToPlainText(childNode.text).trim();
          }
        }
      }
    }
  }
  return undefined;
}

function readSlideSize(files: Map<string, Uint8Array>): Box {
  const presentation = readXml(files, 'ppt/presentation.xml');
  const size = presentation ? descendants(presentation, 'sldSz')[0] : undefined;
  const cx = positive(size ? attr(size, 'cx') : undefined);
  const cy = positive(size ? attr(size, 'cy') : undefined);
  return {
    x: 0,
    y: 0,
    cx: cx ?? DEFAULT_SLIDE_CX,
    cy: cy ?? DEFAULT_SLIDE_CY,
  };
}

function slideOrder(files: Map<string, Uint8Array>): string[] {
  const presentation = readXml(files, 'ppt/presentation.xml');
  const rels = readRelationships(files, 'ppt/presentation.xml');
  const ordered: string[] = [];
  if (presentation) {
    for (const slideId of descendants(presentation, 'sldId')) {
      const relId = attr(slideId, 'r:id');
      const rel = rels.find((item) => item.id === relId);
      if (!rel || rel.external) continue;
      const part = resolvePart('ppt/presentation.xml', rel.target);
      if (filesHas(files, part)) ordered.push(canonicalPath(files, part));
    }
  }
  if (ordered.length > 0) return ordered;
  return [...files.keys()]
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right) || left.localeCompare(right));
}

function slideNumber(path: string): number {
  const match = /slide(\d+)\.xml$/i.exec(path);
  return match ? Number(match[1]) : 0;
}

async function convertSlide(ctx: SlideContext, xml: XmlElement): Promise<LoomaCard> {
  const surface = child(xml, 'cSld') ?? xml;
  let background = await readBackground(ctx, child(surface, 'bg'));
  const tree = child(surface, 'spTree');
  const placed: Placed[] = [];
  if (tree) {
    const root = groupTransform(tree, identityTransform(ctx.slide));
    await walkShapes(ctx, tree, root, placed);
  }
  const backdrop = promoteBackdrop(placed, ctx.slide, background);
  background = backdrop.background;
  const accented = promoteAccent(backdrop.items, ctx.slide);
  const notes = readNotes(ctx);
  const card: LoomaCard = {
    id: ctx.ids('card'),
    body: layoutBody(accented.items, ctx.slide, ctx.ids),
  };
  if (background) card.background = background;
  if (accented.accent) card.accent = accented.accent;
  if (notes) card.notes = notes;
  return card;
}

async function walkShapes(
  ctx: SlideContext,
  container: XmlElement,
  parent: Transform,
  placed: Placed[],
): Promise<void> {
  for (const node of container.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);
    if (tag === 'sp') {
      const blocks = convertTextShape(ctx, node);
      if (blocks.length === 0) continue;
      placed.push({ box: readBox(shapeTransform(node), parent), blocks, kind: 'text' });
      continue;
    }
    if (tag === 'pic') {
      const picture = await convertPicture(ctx, node, parent);
      if (picture) placed.push(picture);
      continue;
    }
    if (tag === 'graphicFrame') {
      const table = convertTable(ctx, node);
      if (table) {
        placed.push({ box: readBox(shapeTransform(node), parent), blocks: [table], kind: 'table' });
      } else {
        warn(ctx.warnings, `Skipped unsupported graphic on slide ${ctx.index + 1}.`);
      }
      continue;
    }
    if (tag === 'grpSp') await walkShapes(ctx, node, groupTransform(node, parent), placed);
  }
}

function convertTextShape(ctx: SlideContext, shape: XmlElement): LoomaNode[] {
  const placeholder = placeholderType(shape);
  if (
    placeholder === 'sldNum' ||
    placeholder === 'dt' ||
    placeholder === 'ftr' ||
    placeholder === 'sldImg' ||
    placeholder === 'hdr'
  ) {
    return [];
  }
  const body = child(shape, 'txBody');
  if (!body) return [];
  const paragraphs = children(body, 'p').map((paragraph) => readParagraph(ctx, paragraph));
  const role =
    placeholder === 'title' || placeholder === 'ctrTitle' || placeholder === 'subTitle'
      ? placeholder
      : placeholder === null
        ? 'other'
        : 'body';
  return paragraphsToBlocks(ctx, paragraphs, headingFor(role, paragraphs, ctx.index));
}

function headingFor(
  role: 'title' | 'ctrTitle' | 'subTitle' | 'other' | 'body',
  paragraphs: readonly RichParagraph[],
  slideIndex: number,
): { level: 1 | 2 | 3; index: number } | null {
  const index = paragraphs.findIndex((paragraph) => paragraph.text.trim().length > 0);
  if (index === -1) return null;
  if (role === 'ctrTitle' || (role === 'title' && slideIndex === 0)) return { level: 1, index };
  if (role === 'title') return { level: 2, index };
  if (role === 'subTitle') return { level: 3, index };
  const first = paragraphs[index];
  if (role === 'other' && first && !first.list && (first.size ?? 0) >= 2800)
    return { level: 2, index };
  return null;
}

function paragraphsToBlocks(
  ctx: SlideContext,
  paragraphs: readonly RichParagraph[],
  heading: { level: 1 | 2 | 3; index: number } | null,
): LoomaNode[] {
  const blocks: LoomaNode[] = [];
  let list: { style: 'bullet' | 'number'; items: { level: number; text: string }[] } | null = null;
  const flush = () => {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    blocks.push({
      id: ctx.ids('block'),
      type: 'list',
      style: list.style,
      items: nestList(list.items),
    });
    list = null;
  };

  paragraphs.forEach((paragraph, index) => {
    const text = paragraph.text.trim();
    if (heading && index === heading.index) {
      flush();
      if (text) {
        blocks.push({ id: ctx.ids('block'), type: 'heading', level: heading.level, text });
      }
      return;
    }
    const continuing = paragraph.list === null && paragraph.level > 0 && list !== null;
    const listed = paragraph.list !== null || continuing;
    if (listed) {
      const style = paragraph.list ?? list?.style ?? 'bullet';
      if (list && paragraph.level === 0 && style !== list.style) flush();
      if (!text) return;
      if (!list) list = { style, items: [] };
      list.items.push({ level: paragraph.level, text });
      return;
    }
    flush();
    if (!text) return;
    blocks.push(
      paragraph.align
        ? { id: ctx.ids('block'), type: 'paragraph', text, align: paragraph.align }
        : { id: ctx.ids('block'), type: 'paragraph', text },
    );
  });
  flush();
  return blocks;
}

function nestList(items: readonly { level: number; text: string }[]): ListItem[] {
  const root: { text: string; children?: ListItem[] }[] = [];
  const stack: { level: number; item: { text: string; children?: ListItem[] } }[] = [];
  for (const entry of items) {
    const level = Math.min(entry.level, MAX_LIST_DEPTH - 1);
    const item: { text: string; children?: ListItem[] } = { text: entry.text };
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
    const parent = stack[stack.length - 1]?.item;
    if (!parent) root.push(item);
    else {
      parent.children ??= [];
      parent.children.push(item);
    }
    stack.push({ level, item });
  }
  return root;
}

function readParagraph(ctx: SlideContext, paragraph: XmlElement): RichParagraph {
  const props = child(paragraph, 'pPr');
  return {
    text: serializeParagraph(ctx, paragraph),
    align: readAlign(props),
    list: readListStyle(props),
    level: readLevel(props),
    size: readSize(paragraph),
  };
}

function serializeParagraph(ctx: SlideContext, paragraph: XmlElement): string {
  const nodes: InlineNode[] = [];
  for (const node of paragraph.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);
    if (tag === 'br') nodes.push({ type: 'break' });
    else if (tag === 'r' || tag === 'fld') nodes.push(...runNodes(ctx, node));
  }
  if (nodes.length === 0) return '';
  return normalizeInline(serializeInline(nodes));
}

function runNodes(ctx: SlideContext, run: XmlElement): InlineNode[] {
  const props = child(run, 'rPr');
  const text = children(run, 't')
    .map((node) => textContent(node))
    .join('');
  if (!text) return [];
  let node: InlineNode = { type: 'text', value: text };
  if (strikeOn(props)) node = { type: 'strike', children: [node] };
  if (boolAttr(props, 'i')) node = { type: 'italic', children: [node] };
  if (boolAttr(props, 'b')) node = { type: 'bold', children: [node] };
  const href = hyperlink(ctx, props);
  if (href) node = { type: 'link', href, children: [node] };
  return [node];
}

function hyperlink(ctx: SlideContext, props: XmlElement | undefined): string | undefined {
  if (!props) return undefined;
  const link = child(props, 'hlinkClick');
  const relId = link ? attr(link, 'id') : undefined;
  if (!relId) return undefined;
  const rel = ctx.rels.find((item) => item.id === relId);
  if (!rel?.target || !isSafeHref(rel.target)) return undefined;
  return rel.target;
}

function readListStyle(props: XmlElement | undefined): 'bullet' | 'number' | null {
  if (!props || child(props, 'buNone')) return null;
  if (child(props, 'buAutoNum')) return 'number';
  if (child(props, 'buChar')) return 'bullet';
  return null;
}

function readLevel(props: XmlElement | undefined): number {
  const raw = Number(props ? (attr(props, 'lvl') ?? '0') : '0');
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_LIST_DEPTH - 1);
}

function readSize(paragraph: XmlElement): number | null {
  for (const run of children(paragraph, 'r')) {
    const size = child(run, 'rPr') ? attr(child(run, 'rPr')!, 'sz') : undefined;
    if (size) return Number(size);
  }
  const props = child(paragraph, 'pPr');
  const defined = props ? child(props, 'defRPr') : undefined;
  const definedSize = defined ? attr(defined, 'sz') : undefined;
  if (definedSize) return Number(definedSize);
  const end = child(paragraph, 'endParaRPr');
  const endSize = end ? attr(end, 'sz') : undefined;
  return endSize ? Number(endSize) : null;
}

function readAlign(props: XmlElement | undefined): 'center' | 'right' | undefined {
  const value = props ? attr(props, 'algn') : undefined;
  if (value === 'ctr' || value === 'center') return 'center';
  if (value === 'r' || value === 'right') return 'right';
  return undefined;
}

function convertTable(ctx: SlideContext, frame: XmlElement): LoomaNode | null {
  const table = descendants(frame, 'tbl')[0];
  if (!table) return null;
  const rows = children(table, 'tr')
    .map((row) => children(row, 'tc').map((cell) => cellText(ctx, cell)))
    .filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const rectangular = rows.map((row) => {
    const copy = row.slice();
    while (copy.length < width) copy.push('');
    return copy;
  });
  const firstRow = attr(child(table, 'tblPr') ?? emptyElement(), 'firstRow');
  const header =
    firstRow === '1' ||
    firstRow === 'true' ||
    (firstRow !== '0' && firstRow !== 'false' && rectangular.length > 1);
  return { id: ctx.ids('block'), type: 'table', header, rows: rectangular };
}

function cellText(ctx: SlideContext, cell: XmlElement): string {
  const body = child(cell, 'txBody');
  if (!body) return textContent(cell).trim();
  return children(body, 'p')
    .map((paragraph) => serializeParagraph(ctx, paragraph).trim())
    .filter((text) => text.length > 0)
    .join('\n');
}

async function convertPicture(
  ctx: SlideContext,
  picture: XmlElement,
  parent: Transform,
): Promise<Placed | null> {
  if (
    descendants(picture, 'videoFile').length > 0 ||
    descendants(picture, 'audioFile').length > 0
  ) {
    warn(ctx.warnings, `Skipped video or audio on slide ${ctx.index + 1}.`);
    return null;
  }
  const blip = descendants(picture, 'blip')[0];
  const relId = blip ? attr(blip, 'embed') : undefined;
  if (!relId) return null;
  const rel = ctx.rels.find((item) => item.id === relId);
  if (!rel) {
    warn(ctx.warnings, `Missing relationship "${relId}" on slide ${ctx.index + 1}.`);
    return null;
  }
  const assetId = await assetForRelationship(ctx, rel);
  if (!assetId) return null;
  return {
    box: readBox(shapeTransform(picture), parent),
    blocks: [{ id: ctx.ids('block'), type: 'image', assetId }],
    kind: 'image',
    assetId,
  };
}

async function readBackground(
  ctx: SlideContext,
  background: XmlElement | undefined,
): Promise<CardBackground | undefined> {
  if (!background) return undefined;
  const blip = descendants(background, 'blip')[0];
  const relId = blip ? attr(blip, 'embed') : undefined;
  if (relId) {
    const rel = ctx.rels.find((item) => item.id === relId);
    const assetId = rel ? await assetForRelationship(ctx, rel) : null;
    if (assetId) return { kind: 'image', assetId };
  }
  const color = descendants(background, 'srgbClr')[0];
  const value = cssHex(color ? attr(color, 'val') : undefined);
  if (value) return { kind: 'color', value };
  return undefined;
}

async function assetForRelationship(ctx: SlideContext, rel: Relationship): Promise<string | null> {
  if (rel.external) {
    if (!isImageSrc(rel.target)) {
      warn(ctx.warnings, `Skipped unsupported media "${rel.target}".`);
      return null;
    }
    return rememberAsset(ctx, rel.target, {
      kind: 'image',
      src: rel.target,
      alt: rel.target.split('/').pop() ?? '',
    });
  }
  const path = canonicalPath(ctx.files, resolvePart(ctx.part, rel.target));
  const cached = ctx.assetByPath.get(path);
  if (cached) return cached;
  const bytes = fileBytes(ctx.files, path);
  if (!bytes) {
    warn(ctx.warnings, `Missing media file "${path}".`);
    return null;
  }
  const extension = fileExtension(path);
  const mimeType = IMAGE_TYPES[extension];
  if (!mimeType) {
    warn(ctx.warnings, `Skipped unsupported media "${path}".`);
    return null;
  }
  const filename = path.split('/').pop() ?? path;
  const sniffed = sniffSize(bytes, mimeType);
  let src = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  let width = sniffed.width;
  let height = sniffed.height;
  let alt = filename;
  if (ctx.uploadAsset) {
    try {
      const uploaded = await ctx.uploadAsset({ filename, mimeType, bytes });
      src = uploaded.src;
      if (uploaded.width && uploaded.width > 0) width = Math.round(uploaded.width);
      if (uploaded.height && uploaded.height > 0) height = Math.round(uploaded.height);
      if (uploaded.alt) alt = uploaded.alt;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn(ctx.warnings, `Failed to upload "${filename}": ${detail}`);
      return null;
    }
  }
  if (!isImageSrc(src)) {
    warn(ctx.warnings, `Skipped media "${path}" because its URL is not an image source.`);
    return null;
  }
  const asset: ImageAsset = { kind: 'image', src, alt };
  if (width && width > 0) asset.width = width;
  if (height && height > 0) asset.height = height;
  return rememberAsset(ctx, path, asset);
}

function rememberAsset(ctx: SlideContext, path: string, asset: ImageAsset): string {
  const existing = ctx.assetByPath.get(path);
  if (existing) return existing;
  const id = ctx.ids('asset');
  ctx.assets[id] = asset;
  ctx.assetByPath.set(path, id);
  return id;
}

function promoteBackdrop(
  items: readonly Placed[],
  slide: Box,
  background: CardBackground | undefined,
): { background: CardBackground | undefined; items: Placed[] } {
  const pictures = items
    .filter(
      (item) =>
        item.kind === 'image' && item.assetId && areaRatio(item.box, slide) >= BACKDROP_AREA,
    )
    .sort((left, right) => area(right.box) - area(left.box));
  const winner = pictures[0];
  if (!winner?.assetId || items.length <= pictures.length) return { background, items: [...items] };
  return {
    background: { kind: 'image', assetId: winner.assetId },
    items: items.filter((item) => item !== winner),
  };
}

function promoteAccent(
  items: readonly Placed[],
  slide: Box,
): { accent?: CardAccent; items: Placed[] } {
  const texts = items.filter((item) => item.kind !== 'image');
  const candidates = items.filter(
    (item) => item.kind === 'image' && accentPosition(item.box, slide, texts),
  );
  if (candidates.length !== 1) return { items: [...items] };
  const picture = candidates[0];
  const position = picture ? accentPosition(picture.box, slide, texts) : null;
  if (!picture?.assetId || !position) return { items: [...items] };
  return {
    accent: { position, assetId: picture.assetId },
    items: items.filter((item) => item !== picture),
  };
}

function accentPosition(
  box: Box,
  slide: Box,
  texts: readonly Placed[],
): 'left' | 'right' | 'top' | null {
  if (slide.cx <= 0 || slide.cy <= 0) return null;
  const width = box.cx / slide.cx;
  const height = box.cy / slide.cy;
  const right = box.x + box.cx;
  const bottom = box.y + box.cy;
  const overlapsX = texts.some((item) =>
    rangesOverlap(box.x, right, item.box.x, item.box.x + item.box.cx, slide.cx * 0.02),
  );
  const overlapsY = texts.some((item) =>
    rangesOverlap(box.y, bottom, item.box.y, item.box.y + item.box.cy, slide.cy * 0.02),
  );
  if (
    width >= 0.25 &&
    height >= 0.35 &&
    box.x <= slide.cx * 0.08 &&
    right <= slide.cx * 0.62 &&
    !overlapsX
  ) {
    return 'left';
  }
  if (
    width >= 0.25 &&
    height >= 0.35 &&
    box.x >= slide.cx * 0.38 &&
    right >= slide.cx * 0.92 &&
    !overlapsX
  ) {
    return 'right';
  }
  if (
    width >= 0.6 &&
    height >= 0.2 &&
    height < 0.7 &&
    box.y <= slide.cy * 0.08 &&
    bottom <= slide.cy * 0.5 &&
    !overlapsY
  ) {
    return 'top';
  }
  return null;
}

function layoutBody(
  items: readonly Placed[],
  slide: Box,
  ids: (kind: IdKind) => string,
): LoomaNode[] {
  const sorted = [...items].sort(
    (left, right) => left.box.y - right.box.y || left.box.x - right.box.x,
  );
  const used = new Set<Placed>();
  const body: LoomaNode[] = [];
  for (const item of sorted) {
    if (used.has(item)) continue;
    const columns = columnGroup(item, sorted, used, slide);
    if (!columns) {
      used.add(item);
      body.push(...item.blocks);
      continue;
    }
    for (const column of columns) for (const member of column) used.add(member);
    body.push({
      id: ids('container'),
      type: 'columns',
      widths: proportionalWidths(
        columns.map((column) => Math.max(...column.map((member) => member.box.cx))),
      ),
      children: columns.map((column) =>
        column.sort((left, right) => left.box.y - right.box.y).flatMap((member) => member.blocks),
      ),
    });
  }
  return body;
}

function columnGroup(
  seed: Placed,
  all: readonly Placed[],
  used: ReadonlySet<Placed>,
  slide: Box,
): Placed[][] | null {
  if (used.has(seed) || isFullWidth(seed, slide)) return null;
  const pool = all.filter((item) => !used.has(item) && !isFullWidth(item, slide));
  const band: Placed[] = [];
  const seen = new Set<Placed>([seed]);
  const queue = [seed];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    band.push(current);
    for (const other of pool) {
      if (seen.has(other)) continue;
      if (yOverlapRatio(current.box, other.box) < 0.45) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  if (band.length < 2) return null;
  const columns: Placed[][] = [];
  for (const item of [...band].sort(
    (left, right) => left.box.x - right.box.x || left.box.y - right.box.y,
  )) {
    const last = columns[columns.length - 1];
    if (last && xOverlapRatio(unionBox(last), item.box) >= 0.4) last.push(item);
    else columns.push([item]);
  }
  if (columns.length < 2 || columns.length > 4) return null;
  for (let index = 0; index < columns.length - 1; index += 1) {
    const left = columns[index];
    const right = columns[index + 1];
    if (!left || !right || xOverlapRatio(unionBox(left), unionBox(right)) > 0.15) return null;
  }
  return columns;
}

function proportionalWidths(widths: number[]): number[] {
  const min = Math.min(...widths);
  const scale = min > 0 ? min : 1;
  return widths.map((width) => Math.max(0.1, Math.round((width / scale) * 10) / 10));
}

function readNotes(ctx: SlideContext): string | undefined {
  const rel = ctx.rels.find(
    (item) => item.type.includes('/notesSlide') || item.type.endsWith('notesSlide'),
  );
  if (!rel || rel.external) return undefined;
  const part = canonicalPath(ctx.files, resolvePart(ctx.part, rel.target));
  const xml = readXml(ctx.files, part);
  if (!xml) return undefined;
  const notesCtx: SlideContext = { ...ctx, part, rels: readRelationships(ctx.files, part) };
  const chunks: string[] = [];
  for (const shape of descendants(xml, 'sp')) {
    if (placeholderType(shape) !== 'body') continue;
    const body = child(shape, 'txBody');
    if (!body) continue;
    const text = children(body, 'p')
      .map((paragraph) => serializeParagraph(notesCtx, paragraph).trim())
      .filter((paragraph) => paragraph.length > 0)
      .join('\n');
    if (text) chunks.push(text);
  }
  const notes = chunks.join('\n\n').trim();
  return notes || undefined;
}

function placeholderType(shape: XmlElement): string | null {
  const placeholder = descendants(shape, 'ph')[0];
  if (!placeholder) return null;
  return attr(placeholder, 'type') ?? 'body';
}

function identityTransform(slide: Box): Transform {
  return {
    offX: 0,
    offY: 0,
    extX: slide.cx,
    extY: slide.cy,
    chOffX: 0,
    chOffY: 0,
    chExtX: slide.cx,
    chExtY: slide.cy,
  };
}

function groupTransform(group: XmlElement, parent: Transform): Transform {
  const xfrm = shapeTransform(group);
  const box = readBox(xfrm, parent);
  const childOffset = xfrm ? child(xfrm, 'chOff') : undefined;
  const childExtent = xfrm ? child(xfrm, 'chExt') : undefined;
  const chExtX = positive(childExtent ? attr(childExtent, 'cx') : undefined);
  const chExtY = positive(childExtent ? attr(childExtent, 'cy') : undefined);
  return {
    offX: box.x,
    offY: box.y,
    extX: box.cx > 0 ? box.cx : parent.extX,
    extY: box.cy > 0 ? box.cy : parent.extY,
    chOffX: numberAttr(childOffset, 'x'),
    chOffY: numberAttr(childOffset, 'y'),
    chExtX: chExtX ?? (box.cx > 0 ? box.cx : parent.chExtX),
    chExtY: chExtY ?? (box.cy > 0 ? box.cy : parent.chExtY),
  };
}

function shapeTransform(shape: XmlElement): XmlElement | undefined {
  const props = child(shape, 'spPr') ?? child(shape, 'grpSpPr');
  return (props ? child(props, 'xfrm') : undefined) ?? child(shape, 'xfrm');
}

function readBox(xfrm: XmlElement | undefined, parent: Transform): Box {
  const offset = xfrm ? child(xfrm, 'off') : undefined;
  const extent = xfrm ? child(xfrm, 'ext') : undefined;
  const scaleX = parent.chExtX > 0 ? parent.extX / parent.chExtX : 1;
  const scaleY = parent.chExtY > 0 ? parent.extY / parent.chExtY : 1;
  return {
    x: parent.offX + (numberAttr(offset, 'x') - parent.chOffX) * scaleX,
    y: parent.offY + (numberAttr(offset, 'y') - parent.chOffY) * scaleY,
    cx: numberAttr(extent, 'cx') * scaleX,
    cy: numberAttr(extent, 'cy') * scaleY,
  };
}

function readRelationships(files: Map<string, Uint8Array>, part: string): Relationship[] {
  const xml = readXml(files, relationshipPath(part));
  if (!xml) return [];
  const rels: Relationship[] = [];
  for (const rel of children(xml, 'Relationship')) {
    const id = attr(rel, 'Id') ?? '';
    const target = attr(rel, 'Target') ?? '';
    if (!id || !target) continue;
    rels.push({
      id,
      type: attr(rel, 'Type') ?? '',
      target,
      external: (attr(rel, 'TargetMode') ?? '').toLowerCase() === 'external',
    });
  }
  return rels;
}

function relationshipPath(part: string): string {
  const slash = part.lastIndexOf('/');
  const dir = slash === -1 ? '' : part.slice(0, slash);
  const file = slash === -1 ? part : part.slice(slash + 1);
  return `${dir}${dir ? '/' : ''}_rels/${file}.rels`;
}

function resolvePart(fromPart: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const stack = fromPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') stack.pop();
    else stack.push(decodeSegment(segment));
  }
  return stack.join('/');
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readXml(files: Map<string, Uint8Array>, path: string): XmlElement | null {
  const bytes = fileBytes(files, path);
  if (!bytes) return null;
  return parseXml(decodeXml(bytes));
}

function decodeXml(bytes: Uint8Array): string {
  const owned = new Uint8Array(bytes);
  if (owned.length >= 2 && owned[0] === 0xff && owned[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(owned);
  }
  if (owned.length >= 2 && owned[0] === 0xfe && owned[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(owned);
  }
  return new TextDecoder().decode(owned);
}

function filesHas(files: Map<string, Uint8Array>, path: string): boolean {
  return fileBytes(files, path) !== undefined;
}

function canonicalPath(files: Map<string, Uint8Array>, path: string): string {
  if (files.has(path)) return path;
  const lower = path.toLowerCase();
  for (const key of files.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return path;
}

function fileBytes(files: Map<string, Uint8Array>, path: string): Uint8Array | undefined {
  const exact = files.get(path);
  if (exact) return exact;
  const lower = path.toLowerCase();
  for (const [key, value] of files) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function fileExtension(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

function sniffSize(bytes: Uint8Array, mimeType: string): { width?: number; height?: number } {
  if (mimeType === 'image/png') return sniffPng(bytes);
  if (mimeType === 'image/jpeg') return sniffJpeg(bytes);
  return {};
}

function sniffPng(bytes: Uint8Array): { width?: number; height?: number } {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return {};
  }
  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  if (!width || !height) return {};
  return { width, height };
}

function sniffJpeg(bytes: Uint8Array): { width?: number; height?: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0x00 || marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    const startOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (startOfFrame) {
      const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
      if (width > 0 && height > 0) return { width, height };
      return {};
    }
    if (length < 2) return {};
    offset += 2 + length;
  }
  return {};
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function cssHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return `#${hex.toLowerCase()}`;
}

function boolAttr(element: XmlElement | undefined, name: string): boolean {
  const value = element ? attr(element, name) : undefined;
  if (value === undefined) return false;
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function strikeOn(element: XmlElement | undefined): boolean {
  const value = element ? attr(element, 'strike') : undefined;
  return value === 'sngStrike' || value === 'dblStrike' || value === '1' || value === 'true';
}

function numberAttr(element: XmlElement | undefined, name: string): number {
  const parsed = Number(element ? attr(element, name) : undefined);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function area(box: Box): number {
  return Math.max(0, box.cx) * Math.max(0, box.cy);
}

function areaRatio(box: Box, slide: Box): number {
  const slideArea = area(slide);
  return slideArea > 0 ? area(box) / slideArea : 0;
}

function isFullWidth(item: Placed, slide: Box): boolean {
  return slide.cx > 0 && item.box.cx >= slide.cx * FULL_WIDTH_RATIO;
}

function yOverlapRatio(left: Box, right: Box): number {
  const overlap = Math.min(left.y + left.cy, right.y + right.cy) - Math.max(left.y, right.y);
  if (overlap <= 0) return 0;
  const min = Math.min(left.cy, right.cy);
  return min > 0 ? overlap / min : 0;
}

function xOverlapRatio(left: Box, right: Box): number {
  const overlap = Math.min(left.x + left.cx, right.x + right.cx) - Math.max(left.x, right.x);
  if (overlap <= 0) return 0;
  const min = Math.min(left.cx, right.cx);
  return min > 0 ? overlap / min : 0;
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number, slack: number): boolean {
  return a0 < b1 - slack && b0 < a1 - slack;
}

function unionBox(items: readonly Placed[]): Box {
  const first = items[0]?.box ?? { x: 0, y: 0, cx: 0, cy: 0 };
  let x = first.x;
  let y = first.y;
  let right = first.x + first.cx;
  let bottom = first.y + first.cy;
  for (const item of items.slice(1)) {
    x = Math.min(x, item.box.x);
    y = Math.min(y, item.box.y);
    right = Math.max(right, item.box.x + item.box.cx);
    bottom = Math.max(bottom, item.box.y + item.box.cy);
  }
  return { x, y, cx: right - x, cy: bottom - y };
}

function warn(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

function emptyElement(): XmlElement {
  return { name: 'empty', attributes: {}, children: [] };
}
