import { MAX_LIST_DEPTH } from '../constants';
import type { CalloutTone, HighlightColor, InlineColor, ThemePreset } from '../constants';
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
const SHAPE_BACKDROP_AREA = 0.85;
const PANEL_MIN_HEIGHT = 0.25;
const PANEL_MIN_WIDTH = 0.18;
const PANEL_MAX_WIDTH = 0.6;
const HEADER_BAND = 0.18;
const FOOTER_BAND = 0.88;
const BADGE_X = 0.85;
const BADGE_Y = 0.15;
const PILL_MAX_WIDTH = 0.25;
const PILL_MAX_HEIGHT = 0.12;
const TINY_WIDTH = 0.06;
const TINY_HEIGHT = 0.08;
const ROW_GAP = 0.04;
const ROW_LINK = 0.08;
const COLUMN_GAP_BRIDGE = 0.012;

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

type Fill =
  { kind: 'color'; value: string } | { kind: 'gradient'; from: string; to: string; angle: number };

interface RawItem {
  box: Box;
  kind: 'text' | 'image' | 'table' | 'shape';
  fill?: Fill;
  paragraphs: RichParagraph[];
  blocks: LoomaNode[];
  assetId?: string;
  placeholder: string | null;
  highlight?: HighlightColor;
  callout?: CalloutTone;
}

interface RichParagraph {
  text: string;
  plain: string;
  align?: 'center' | 'right';
  list: 'bullet' | 'number' | null;
  level: number;
  size: number | null;
  bold: boolean;
  color?: InlineColor;
}

interface FlowPiece {
  y: number;
  step?: number;
  nodes: LoomaNode[];
  fallback: LoomaNode[];
}

interface ImportState {
  files: Map<string, Uint8Array>;
  warnings: string[];
  assets: Record<string, ImageAsset>;
  assetByPath: Map<string, string>;
  ids: (kind: IdKind) => string;
  uploadAsset?: ImportPptxOptions['uploadAsset'];
  slide: Box;
  themeColors: Map<string, string>;
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
    themeColors: readThemeColors(archive.files),
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

  const theme = deckTheme(cards, options?.themePreset);
  const candidate = {
    looma: 1 as const,
    id: state.ids('document'),
    title: documentTitle(archive.files, cards, options?.title),
    format: 'presentation' as const,
    theme,
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
  let background = await readInheritedBackground(ctx, xml);
  const placed: RawItem[] = [];
  const surface = child(xml, 'cSld') ?? xml;
  const tree = child(surface, 'spTree');
  if (tree) {
    const root = groupTransform(tree, identityTransform(ctx.slide));
    await walkShapes(ctx, tree, root, placed);
  }
  const painted = promoteShapeBackground(placed, ctx.slide, background);
  background = painted.background;
  const panels = findPanels(painted.items, ctx.slide);
  applyPills(painted.items, ctx.slide);
  applyCallouts(painted.items, ctx.slide);
  const visible = painted.items.filter(
    (item) =>
      item.kind !== 'shape' && !isRunningFooter(item, ctx.slide) && !isCornerBadge(item, ctx.slide),
  );
  const backdrop = promoteBackdrop(visible, ctx.slide, background);
  background = backdrop.background;
  const accented = promoteAccent(backdrop.items, ctx.slide);
  const header = takeHeaderRow(accented.items, ctx.slide);
  const notes = readNotes(ctx);
  const card: LoomaCard = {
    id: ctx.ids('card'),
    body: [...renderItems(ctx, header.header), ...layoutContent(ctx, header.rest, panels)],
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
  placed: RawItem[],
): Promise<void> {
  for (const node of container.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);
    if (tag === 'sp') {
      const shape = readTextItem(ctx, node, parent);
      if (shape) placed.push(shape);
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
        placed.push({
          box: readBox(shapeTransform(node), parent),
          kind: 'table',
          paragraphs: [],
          blocks: [table],
          placeholder: null,
        });
      } else {
        warn(ctx.warnings, `Skipped unsupported graphic on slide ${ctx.index + 1}.`);
      }
      continue;
    }
    if (tag === 'grpSp') await walkShapes(ctx, node, groupTransform(node, parent), placed);
  }
}

function readTextItem(ctx: SlideContext, shape: XmlElement, parent: Transform): RawItem | null {
  const placeholder = placeholderType(shape);
  if (
    placeholder === 'sldNum' ||
    placeholder === 'dt' ||
    placeholder === 'ftr' ||
    placeholder === 'sldImg' ||
    placeholder === 'hdr'
  ) {
    return null;
  }
  const body = child(shape, 'txBody');
  const paragraphs = body
    ? children(body, 'p').map((paragraph) => readParagraph(ctx, paragraph))
    : [];
  const plain = paragraphs
    .map((paragraph) => paragraph.plain)
    .join('')
    .trim();
  return {
    box: readBox(shapeTransform(shape), parent),
    kind: plain ? 'text' : 'shape',
    fill: readFill(child(shape, 'spPr'), ctx.themeColors),
    paragraphs: plain ? paragraphs : [],
    blocks: [],
    placeholder,
  };
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
  if (!first || first.list || role !== 'other') return null;
  const size = first.size ?? 0;
  if (size >= 3600) return { level: 1, index };
  if (size >= 2400) return { level: 2, index };
  const plain = first.plain.trim();
  const onlyLine = paragraphs.filter((paragraph) => paragraph.plain.trim()).length === 1;
  if (size >= 1850 && first.bold && onlyLine && plain.length <= 80) return { level: 3, index };
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
  const inspected = inspectParagraph(ctx, paragraph);
  return {
    text: inspected.text,
    plain: inspected.plain,
    bold: inspected.bold,
    color: inspected.color,
    align: readAlign(props),
    list: readListStyle(props),
    level: readLevel(props),
    size: readSize(paragraph),
  };
}

interface RunStyle {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  color?: InlineColor;
  href?: string;
}

interface StyledPiece {
  break: boolean;
  text: string;
  style: RunStyle;
}

function serializeParagraph(ctx: SlideContext, paragraph: XmlElement): string {
  return inspectParagraph(ctx, paragraph).text;
}

function inspectParagraph(
  ctx: SlideContext,
  paragraph: XmlElement,
): { text: string; plain: string; bold: boolean; color?: InlineColor } {
  const pieces: StyledPiece[] = [];
  for (const node of paragraph.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);
    if (tag === 'br')
      pieces.push({ break: true, text: '', style: { bold: false, italic: false, strike: false } });
    else if (tag === 'r' || tag === 'fld') {
      const piece = readPiece(ctx, node);
      if (piece) pieces.push(piece);
    }
  }
  const merged: StyledPiece[] = [];
  for (const piece of pieces) {
    const previous = merged[merged.length - 1];
    if (previous && !previous.break && !piece.break && sameStyle(previous.style, piece.style)) {
      previous.text += piece.text;
    } else {
      merged.push({ break: piece.break, text: piece.text, style: { ...piece.style } });
    }
  }
  const textPieces = merged.filter((piece) => !piece.break && piece.text.length > 0);
  const bold = textPieces.length > 0 && textPieces.every((piece) => piece.style.bold);
  const firstColor = textPieces[0]?.style.color;
  const color =
    firstColor && textPieces.every((piece) => piece.style.color === firstColor)
      ? firstColor
      : undefined;
  const nodes: InlineNode[] = [];
  let plain = '';
  for (const piece of merged) {
    if (piece.break) {
      nodes.push({ type: 'break' });
      plain += '\n';
      continue;
    }
    plain += piece.text;
    nodes.push(styleNode(piece.text, piece.style));
  }
  return {
    text: nodes.length > 0 ? normalizeInline(serializeInline(nodes)) : '',
    plain,
    bold,
    color,
  };
}

function readPiece(ctx: SlideContext, run: XmlElement): StyledPiece | null {
  const props = child(run, 'rPr');
  const text = children(run, 't')
    .map((node) => textContent(node))
    .join('');
  if (!text) return null;
  const fill = props ? readSolidColor(child(props, 'solidFill'), ctx.themeColors) : undefined;
  return {
    break: false,
    text,
    style: {
      bold: boolAttr(props, 'b'),
      italic: boolAttr(props, 'i'),
      strike: strikeOn(props),
      color: fill ? (semanticTextColor(fill) ?? undefined) : undefined,
      href: hyperlink(ctx, props),
    },
  };
}

function sameStyle(left: RunStyle, right: RunStyle): boolean {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.strike === right.strike &&
    left.color === right.color &&
    left.href === right.href
  );
}

function styleNode(text: string, style: RunStyle): InlineNode {
  let node: InlineNode = { type: 'text', value: text };
  if (style.strike) node = { type: 'strike', children: [node] };
  if (style.italic) node = { type: 'italic', children: [node] };
  if (style.bold) node = { type: 'bold', children: [node] };
  if (style.color) node = { type: 'color', color: style.color, children: [node] };
  if (style.href) node = { type: 'link', href: style.href, children: [node] };
  return node;
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
): Promise<RawItem | null> {
  if (
    descendants(picture, 'videoFile').length > 0 ||
    descendants(picture, 'audioFile').length > 0
  ) {
    warn(ctx.warnings, `Skipped video or audio on slide ${ctx.index + 1}.`);
    return null;
  }
  const box = readBox(shapeTransform(picture), parent);
  if (isTinyIcon(box, ctx.slide)) return null;
  const relId = pictureRelId(picture);
  if (!relId) return null;
  const rel = ctx.rels.find((item) => item.id === relId);
  if (!rel) {
    warn(ctx.warnings, `Missing relationship "${relId}" on slide ${ctx.index + 1}.`);
    return null;
  }
  const assetId = await assetForRelationship(ctx, rel);
  if (!assetId) return null;
  return {
    box,
    blocks: [{ id: ctx.ids('block'), type: 'image', assetId }],
    kind: 'image',
    paragraphs: [],
    assetId,
    placeholder: null,
  };
}

function pictureRelId(picture: XmlElement): string | undefined {
  const blip = descendants(picture, 'blip')[0];
  const embed = blip ? attr(blip, 'embed') : undefined;
  if (embed) return embed;
  const svg = descendants(picture, 'svgBlip')[0];
  return svg ? attr(svg, 'embed') : undefined;
}

async function readInheritedBackground(
  ctx: SlideContext,
  xml: XmlElement,
): Promise<CardBackground | undefined> {
  const surface = child(xml, 'cSld') ?? xml;
  const own = await readBackground(ctx, child(surface, 'bg'));
  if (own) return own;
  const layout = linkedPart(ctx, 'slideLayout');
  if (!layout) return undefined;
  const layoutXml = readXml(ctx.files, layout.part);
  if (!layoutXml) return undefined;
  const layoutCtx: SlideContext = { ...ctx, part: layout.part, rels: layout.rels };
  const layoutSurface = child(layoutXml, 'cSld') ?? layoutXml;
  const layoutBg = await readBackground(layoutCtx, child(layoutSurface, 'bg'));
  if (layoutBg) return layoutBg;
  const master = linkedPart(layoutCtx, 'slideMaster');
  if (!master) return undefined;
  const masterXml = readXml(ctx.files, master.part);
  if (!masterXml) return undefined;
  const masterCtx: SlideContext = { ...ctx, part: master.part, rels: master.rels };
  const masterSurface = child(masterXml, 'cSld') ?? masterXml;
  return readBackground(masterCtx, child(masterSurface, 'bg'));
}

function linkedPart(
  ctx: SlideContext,
  suffix: string,
): { part: string; rels: Relationship[] } | undefined {
  const rel = ctx.rels.find(
    (item) => item.type.endsWith(`/${suffix}`) || item.type.endsWith(suffix),
  );
  if (!rel || rel.external) return undefined;
  const part = canonicalPath(ctx.files, resolvePart(ctx.part, rel.target));
  if (!filesHas(ctx.files, part)) return undefined;
  return { part, rels: readRelationships(ctx.files, part) };
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
  return fillToBackground(readFill(background, ctx.themeColors));
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
  items: readonly RawItem[],
  slide: Box,
  background: CardBackground | undefined,
): { background: CardBackground | undefined; items: RawItem[] } {
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
  items: readonly RawItem[],
  slide: Box,
): { accent?: CardAccent; items: RawItem[] } {
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
  texts: readonly RawItem[],
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

interface FlowSegment {
  y: number;
  x: number;
  kind: 'row' | 'items';
  items: RawItem[];
}

function layoutContent(
  ctx: SlideContext,
  items: readonly RawItem[],
  panels: readonly RawItem[],
): LoomaNode[] {
  return emitSegments(ctx, buildSegments(items, ctx.slide), panels);
}

function buildSegments(items: readonly RawItem[], slide: Box): FlowSegment[] {
  const { rows, rest } = peelFullRows(items, slide);
  const segments: FlowSegment[] = rows.map((row) => ({
    y: Math.min(...row.map((item) => item.box.y)),
    x: Math.min(...row.map((item) => item.box.x)),
    kind: 'row',
    items: row,
  }));
  const sorted = [...rest].sort(
    (left, right) => left.box.y - right.box.y || left.box.x - right.box.x,
  );
  let band: RawItem[] = [];
  const flush = () => {
    if (band.length === 0) return;
    segments.push({
      y: Math.min(...band.map((item) => item.box.y)),
      x: Math.min(...band.map((item) => item.box.x)),
      kind: 'items',
      items: band,
    });
    band = [];
  };
  for (const item of sorted) {
    if (isSeparator(item, sorted, slide)) {
      flush();
      segments.push({ y: item.box.y, x: item.box.x, kind: 'row', items: [item] });
    } else {
      band.push(item);
    }
  }
  flush();
  return segments.sort((left, right) => left.y - right.y || left.x - right.x);
}

function emitSegments(
  ctx: SlideContext,
  segments: readonly FlowSegment[],
  panels: readonly RawItem[],
): LoomaNode[] {
  const out: LoomaNode[] = [];
  let steps: FlowPiece[] = [];
  const flush = () => {
    out.push(...coalesceSteps(ctx, steps));
    steps = [];
  };
  for (const segment of segments) {
    if (segment.kind === 'row' && segment.items.length >= 2) {
      const piece = piecesFromRow(ctx, segment.items);
      if (piece.step) {
        steps.push(piece);
        continue;
      }
      flush();
      out.push(...piece.nodes);
      continue;
    }
    flush();
    if (segment.kind === 'row') {
      const only = segment.items[0];
      if (only) out.push(...emitItem(ctx, only));
    } else {
      out.push(...layoutBand(ctx, segment.items, panels));
    }
  }
  flush();
  return out;
}

function layoutBand(
  ctx: SlideContext,
  band: readonly RawItem[],
  panels: readonly RawItem[],
): LoomaNode[] {
  const slide = ctx.slide;
  const active = panels.filter((panel) => band.some((item) => centerInside(panel.box, item.box)));
  if (active.length >= 2 && active.length <= 4) {
    const columns = active.map((panel) => band.filter((item) => centerInside(panel.box, item.box)));
    const claimed = new Set(columns.flat());
    const leftovers = band.filter((item) => !claimed.has(item));
    const panelTop = Math.min(...active.map((panel) => panel.box.y));
    const panelBottom = Math.max(...active.map((panel) => panel.box.y + panel.box.cy));
    const above: RawItem[] = [];
    const below: RawItem[] = [];
    for (const item of leftovers) {
      if (item.box.y + item.box.cy <= panelTop + slide.cy * 0.02) above.push(item);
      else if (item.box.y >= panelBottom - slide.cy * 0.02) below.push(item);
      else {
        const center = item.box.x + item.box.cx / 2;
        let best = 0;
        let distance = Number.POSITIVE_INFINITY;
        active.forEach((panel, index) => {
          const delta = Math.abs(center - (panel.box.x + panel.box.cx / 2));
          if (delta < distance) {
            distance = delta;
            best = index;
          }
        });
        columns[best]?.push(item);
      }
    }
    const paired = active
      .map((panel, index) => ({ panel, items: columns[index] ?? [] }))
      .filter((pair) => pair.items.length > 0);
    if (paired.length >= 2) {
      return [
        ...renderItems(ctx, above),
        columnsNode(
          ctx,
          paired.map((pair) => pair.items),
          paired.map((pair) => pair.panel.box.cx),
        ),
        ...renderItems(ctx, below),
      ];
    }
  }
  const zones = splitByXGaps(band, slide);
  if (zones) {
    return [
      columnsNode(
        ctx,
        zones,
        zones.map((column) => unionBox(column).cx),
      ),
    ];
  }
  return renderItems(ctx, band);
}

function columnsNode(ctx: SlideContext, columns: RawItem[][], widths: number[]): LoomaNode {
  return {
    id: ctx.ids('container'),
    type: 'columns',
    widths: proportionalWidths(widths),
    children: columns.map((column) => renderItems(ctx, column)),
  };
}

function renderItems(ctx: SlideContext, items: readonly RawItem[]): LoomaNode[] {
  const sorted = [...items].sort(
    (left, right) => left.box.y - right.box.y || left.box.x - right.box.x,
  );
  const consumed = new Set<RawItem>();
  const pieces: FlowPiece[] = [];
  for (const item of sorted) {
    if (consumed.has(item)) continue;
    if (!isSimpleText(item) || item.callout) {
      consumed.add(item);
      const nodes = emitItem(ctx, item);
      pieces.push({ y: item.box.y, nodes, fallback: nodes });
      continue;
    }
    const row = sorted.filter(
      (other) =>
        !consumed.has(other) &&
        isSimpleText(other) &&
        !other.callout &&
        sameLine(item.box, other.box, ctx.slide),
    );
    if (row.length < 2) {
      consumed.add(item);
      const nodes = emitItem(ctx, item);
      pieces.push({ y: item.box.y, nodes, fallback: nodes });
      continue;
    }
    for (const member of row) consumed.add(member);
    pieces.push(piecesFromRow(ctx, row));
  }
  return coalesceSteps(ctx, pieces);
}

function piecesFromRow(ctx: SlideContext, row: readonly RawItem[]): FlowPiece {
  const sorted = [...row].sort((left, right) => left.box.x - right.box.x);
  const y = Math.min(...sorted.map((item) => item.box.y));
  const first = sorted[0];
  const badge = first ? (first.paragraphs[0]?.plain.trim() ?? '') : '';
  if (sorted.length >= 2 && /^[1-9]$/.test(badge)) {
    const text = joined(sorted.slice(1), '   ');
    const nodes = text ? [paragraphNode(ctx, text)] : [];
    const fallback = text ? [paragraphNode(ctx, `${badge}   ${text}`)] : [];
    return { y, step: Number(badge), nodes, fallback };
  }
  if (isHeaderStyle(sorted, ctx.slide)) {
    const nodes = [headingNode(ctx, mergedHeadingLevel(sorted), joined(sorted, ' '))];
    return { y, nodes, fallback: nodes };
  }
  if (sorted.length >= 2) {
    const nodes = [paragraphNode(ctx, joined(sorted, '   '))];
    return { y, nodes, fallback: nodes };
  }
  const nodes = sorted.flatMap((item) => emitItem(ctx, item));
  return { y, nodes, fallback: nodes };
}

function coalesceSteps(ctx: SlideContext, pieces: readonly FlowPiece[]): LoomaNode[] {
  const out: LoomaNode[] = [];
  let steps: FlowPiece[] = [];
  const flush = () => {
    const ready = steps.length >= 2 && steps.every((piece, index) => piece.step === index + 1);
    if (ready) {
      out.push({
        id: ctx.ids('container'),
        type: 'steps',
        direction: 'vertical',
        children: steps.flatMap((piece) => piece.nodes),
      });
    } else {
      for (const piece of steps) out.push(...piece.fallback);
    }
    steps = [];
  };
  for (const piece of pieces) {
    if (piece.step) steps.push(piece);
    else {
      flush();
      out.push(...piece.nodes);
    }
  }
  flush();
  return out;
}

function emitItem(ctx: SlideContext, item: RawItem): LoomaNode[] {
  if (item.kind === 'image' || item.kind === 'table') return item.blocks;
  if (item.kind !== 'text') return [];
  const paragraphs = decoratedParagraphs(item);
  if (item.callout) {
    const text = paragraphs
      .map((paragraph) => paragraph.text.trim())
      .filter((paragraph) => paragraph.length > 0)
      .join('\n');
    if (!text) return [];
    return [{ id: ctx.ids('block'), type: 'callout', tone: item.callout, text }];
  }
  return paragraphsToBlocks(ctx, paragraphs, headingFor(textRole(item), paragraphs, ctx.index));
}

function decoratedParagraphs(item: RawItem): RichParagraph[] {
  if (!item.highlight) return item.paragraphs;
  const highlight = item.highlight;
  return item.paragraphs.map((paragraph) => ({
    ...paragraph,
    text: paragraph.text.trim()
      ? normalizeInline(`{highlight:${highlight}}${paragraph.text}{/highlight}`)
      : paragraph.text,
  }));
}

function paragraphNode(ctx: SlideContext, text: string): LoomaNode {
  return { id: ctx.ids('block'), type: 'paragraph', text: normalizeInline(text) };
}

function headingNode(ctx: SlideContext, level: 1 | 2 | 3, text: string): LoomaNode {
  return { id: ctx.ids('block'), type: 'heading', level, text: normalizeInline(text) };
}

function joined(items: readonly RawItem[], separator: string): string {
  return items
    .map((item) => itemInline(item))
    .filter((text) => text.trim().length > 0)
    .join(separator);
}

function itemInline(item: RawItem): string {
  const paragraph = item.paragraphs[0];
  if (!paragraph) return '';
  const text = item.highlight
    ? `{highlight:${item.highlight}}${paragraph.text}{/highlight}`
    : paragraph.text;
  return normalizeInline(text);
}

function deckTheme(
  cards: readonly LoomaCard[],
  preset: ThemePreset | undefined,
): { preset: ThemePreset; overrides?: { cardBackground: string } } {
  if (preset) return { preset };
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (card.background?.kind !== 'color') continue;
    const value = card.background.value.toLowerCase();
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  if (!best || bestCount * 2 <= cards.length) return { preset: 'clean' };
  if (isWarmCream(best)) return { preset: 'warm' };
  return { preset: 'clean', overrides: { cardBackground: best } };
}

function readThemeColors(files: Map<string, Uint8Array>): Map<string, string> {
  const colors = new Map<string, string>();
  const paths = [...files.keys()]
    .filter((path) => /^ppt\/theme\/theme\d+\.xml$/i.test(path))
    .sort();
  for (const path of paths) {
    const xml = readXml(files, path);
    const scheme = xml ? descendants(xml, 'clrScheme')[0] : undefined;
    if (!scheme) continue;
    for (const node of scheme.children) {
      if (typeof node === 'string') continue;
      const name = localName(node.name);
      if (colors.has(name)) continue;
      const srgb = child(node, 'srgbClr');
      const sys = child(node, 'sysClr');
      const value = cssHex(srgb ? attr(srgb, 'val') : sys ? attr(sys, 'lastClr') : undefined);
      if (value) colors.set(name, value);
    }
  }
  return colors;
}

function promoteShapeBackground(
  items: readonly RawItem[],
  slide: Box,
  background: CardBackground | undefined,
): { background: CardBackground | undefined; items: RawItem[] } {
  const shapes = items.filter(
    (item) =>
      item.kind === 'shape' &&
      item.fill &&
      areaRatio(item.box, slide) >= SHAPE_BACKDROP_AREA &&
      insideRatio(item.box, slide) >= 0.85,
  );
  const winner = shapes[shapes.length - 1];
  if (!winner) return { background, items: [...items] };
  return {
    background: fillToBackground(winner.fill) ?? background,
    items: items.filter((item) => item !== winner),
  };
}

function findPanels(items: readonly RawItem[], slide: Box): RawItem[] {
  const candidates = items.filter((item) => {
    if (item.kind !== 'shape' || !item.fill) return false;
    if (slide.cy <= 0 || item.box.cy < slide.cy * PANEL_MIN_HEIGHT) return false;
    const width = slide.cx > 0 ? item.box.cx / slide.cx : 0;
    if (width < PANEL_MIN_WIDTH || width > PANEL_MAX_WIDTH) return false;
    return insideRatio(item.box, slide) >= 0.85;
  });
  let best: RawItem[] = [];
  for (const seed of candidates) {
    const group = [seed];
    for (const other of candidates) {
      if (other === seed || group.length >= 4) continue;
      const aligned = group.every((member) => yOverlapRatio(member.box, other.box) >= 0.55);
      const separated = group.every((member) => xOverlapRatio(member.box, other.box) <= 0.1);
      if (aligned && separated) group.push(other);
    }
    if (group.length >= 2 && group.length > best.length) best = group;
  }
  return best.sort((left, right) => left.box.x - right.box.x);
}

function applyPills(items: readonly RawItem[], slide: Box): void {
  const pills = items.filter(
    (item) =>
      item.kind === 'shape' &&
      item.fill?.kind === 'color' &&
      slide.cx > 0 &&
      slide.cy > 0 &&
      item.box.cx < slide.cx * PILL_MAX_WIDTH &&
      item.box.cy < slide.cy * PILL_MAX_HEIGHT,
  );
  const slack = Math.min(slide.cx, slide.cy) * 0.01;
  for (const text of items) {
    if (text.kind !== 'text') continue;
    const matches = pills.filter((pill) => containsBox(pill.box, text.box, slack));
    const innermost = matches.sort((left, right) => area(left.box) - area(right.box))[0];
    if (innermost?.fill?.kind !== 'color') continue;
    const highlight = highlightFor(innermost.fill.value);
    if (highlight) text.highlight = highlight;
  }
}

function applyCallouts(items: readonly RawItem[], slide: Box): void {
  const banners = items.filter(
    (item) =>
      item.kind === 'shape' &&
      item.fill?.kind === 'color' &&
      slide.cx > 0 &&
      slide.cy > 0 &&
      item.box.cx >= slide.cx * 0.7 &&
      item.box.cy <= slide.cy * 0.18 &&
      bannerTone(item.fill.value),
  );
  const slack = Math.min(slide.cx, slide.cy) * 0.015;
  for (const text of items) {
    if (text.kind !== 'text') continue;
    const banner = banners.find((shape) => containsBox(shape.box, text.box, slack));
    if (banner?.fill?.kind === 'color') {
      const tone = bannerTone(banner.fill.value);
      if (tone) {
        text.callout = tone;
        continue;
      }
    }
    const keyword = keywordTone(text);
    if (keyword) text.callout = keyword;
  }
}

function takeHeaderRow(
  items: readonly RawItem[],
  slide: Box,
): { header: RawItem[]; rest: RawItem[] } {
  const candidates = items.filter((item) => {
    if (!isSimpleText(item) || item.callout) return false;
    if (slide.cx <= 0 || item.box.cx >= slide.cx * 0.7) return false;
    const center = item.box.y + item.box.cy / 2;
    return slide.cy > 0 && center < slide.cy * HEADER_BAND;
  });
  if (candidates.length === 0) return { header: [], rest: [...items] };
  const anchor = candidates.reduce((best, item) => (item.box.y < best.box.y ? item : best));
  const row = candidates.filter((item) => sameLine(anchor.box, item.box, slide));
  const titleLike = row.some((item) => {
    const size = item.paragraphs[0]?.size ?? 0;
    return size >= 2000 || item.placeholder === 'title' || item.placeholder === 'ctrTitle';
  });
  if (!titleLike) return { header: [], rest: [...items] };
  const chosen = new Set(row);
  return { header: row, rest: items.filter((item) => !chosen.has(item)) };
}

function peelFullRows(
  items: readonly RawItem[],
  slide: Box,
): { rows: RawItem[][]; rest: RawItem[] } {
  const pool = items.filter((item) => isSimpleText(item) && !item.callout);
  const consumed = new Set<RawItem>();
  const rows: RawItem[][] = [];
  const seeds = [...pool].sort(
    (left, right) => left.box.y - right.box.y || left.box.x - right.box.x,
  );
  for (const seed of seeds) {
    if (consumed.has(seed)) continue;
    const row = tightRow(
      seed,
      pool.filter((item) => !consumed.has(item)),
      slide,
    );
    if (row.length >= 2 && unionBox(row).cx >= slide.cx * FULL_WIDTH_RATIO) {
      for (const item of row) consumed.add(item);
      rows.push([...row].sort((left, right) => left.box.x - right.box.x));
    }
  }
  return { rows, rest: items.filter((item) => !consumed.has(item)) };
}

function tightRow(seed: RawItem, pool: readonly RawItem[], slide: Box): RawItem[] {
  const row = [seed];
  let grew = true;
  while (grew) {
    grew = false;
    for (const other of pool) {
      if (row.includes(other)) continue;
      if (!sameLine(seed.box, other.box, slide)) continue;
      if (xGap(unionBox(row), other.box) > slide.cx * ROW_GAP) continue;
      row.push(other);
      grew = true;
    }
  }
  return row;
}

function isSeparator(item: RawItem, mates: readonly RawItem[], slide: Box): boolean {
  if (item.kind !== 'text' && item.kind !== 'table') return false;
  if (!isFullWidth(item, slide)) return false;
  return !mates.some(
    (other) =>
      other !== item &&
      isSimpleText(other) &&
      !other.callout &&
      sameLine(item.box, other.box, slide),
  );
}

function splitByXGaps(items: readonly RawItem[], slide: Box): RawItem[][] | null {
  if (items.length < 2 || slide.cx <= 0) return null;
  const groups = linkRows(items, slide);
  const grouped = new Set(groups.flat());
  const spans: { start: number; end: number; members: RawItem[] }[] = [];
  for (const group of groups) {
    const box = unionBox(group);
    spans.push({ start: box.x, end: box.x + box.cx, members: group });
  }
  for (const item of items) {
    if (grouped.has(item)) continue;
    spans.push({ start: item.box.x, end: item.box.x + item.box.cx, members: [item] });
  }
  spans.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: { start: number; end: number; members: RawItem[] }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end + slide.cx * COLUMN_GAP_BRIDGE) {
      last.end = Math.max(last.end, span.end);
      last.members.push(...span.members);
    } else {
      merged.push({ start: span.start, end: span.end, members: [...span.members] });
    }
  }
  if (merged.length < 2 || merged.length > 4) return null;
  const columns = merged.map((span) => span.members);
  for (let index = 0; index < columns.length - 1; index += 1) {
    const left = columns[index];
    const right = columns[index + 1];
    if (!left || !right || xOverlapRatio(unionBox(left), unionBox(right)) > 0.1) return null;
  }
  return columns;
}

function linkRows(items: readonly RawItem[], slide: Box): RawItem[][] {
  const pool = items.filter((item) => isSimpleText(item) && !item.callout);
  const groups: RawItem[][] = [];
  const consumed = new Set<RawItem>();
  for (const seed of pool) {
    if (consumed.has(seed)) continue;
    const group = [seed];
    let grew = true;
    while (grew) {
      grew = false;
      for (const other of pool) {
        if (consumed.has(other) || group.includes(other)) continue;
        const near = group.some(
          (member) =>
            sameLine(member.box, other.box, slide) &&
            xGap(member.box, other.box) <= slide.cx * ROW_LINK,
        );
        if (!near) continue;
        group.push(other);
        grew = true;
      }
    }
    if (group.length < 2 || unionBox(group).cx >= slide.cx * FULL_WIDTH_RATIO) continue;
    for (const member of group) consumed.add(member);
    groups.push(group);
  }
  return groups;
}

function isSimpleText(item: RawItem): boolean {
  const paragraph = item.paragraphs[0];
  return (
    item.kind === 'text' &&
    item.paragraphs.length === 1 &&
    !paragraph?.list &&
    (paragraph?.plain.trim().length ?? 0) > 0
  );
}

function isHeaderStyle(row: readonly RawItem[], slide: Box): boolean {
  if (row.length < 2 || slide.cy <= 0) return false;
  const box = unionBox(row);
  if (box.y + box.cy / 2 >= slide.cy * HEADER_BAND) return false;
  const sizes = row.map((item) => item.paragraphs[0]?.size ?? 0);
  const largest = Math.max(...sizes);
  return largest >= 2000 && Math.min(...sizes) < largest;
}

function mergedHeadingLevel(row: readonly RawItem[]): 1 | 2 | 3 {
  if (row.some((item) => item.placeholder === 'ctrTitle')) return 1;
  const size = Math.max(...row.map((item) => item.paragraphs[0]?.size ?? 0));
  if (size >= 3600) return 1;
  if (row.some((item) => item.placeholder === 'title') || size >= 2400) return 2;
  return 3;
}

function textRole(item: RawItem): 'title' | 'ctrTitle' | 'subTitle' | 'other' | 'body' {
  if (
    item.placeholder === 'title' ||
    item.placeholder === 'ctrTitle' ||
    item.placeholder === 'subTitle'
  ) {
    return item.placeholder;
  }
  return item.placeholder === null ? 'other' : 'body';
}

function isRunningFooter(item: RawItem, slide: Box): boolean {
  if (item.kind !== 'text' || slide.cy <= 0 || item.box.y < slide.cy * FOOTER_BAND) return false;
  const plain = plainText(item).replace(/\s+/g, ' ').trim();
  if (/^\d+\s*\/\s*\d+$/.test(plain)) return true;
  const size = Math.max(0, ...item.paragraphs.map((paragraph) => paragraph.size ?? 0));
  return size > 0 && size <= 1150;
}

function isCornerBadge(item: RawItem, slide: Box): boolean {
  if (item.kind !== 'text' || slide.cx <= 0 || slide.cy <= 0) return false;
  if (item.box.x < slide.cx * BADGE_X || item.box.y > slide.cy * BADGE_Y) return false;
  return /^\d{1,2}$/.test(plainText(item).trim());
}

function isTinyIcon(box: Box, slide: Box): boolean {
  return (
    slide.cx > 0 &&
    slide.cy > 0 &&
    box.cx < slide.cx * TINY_WIDTH &&
    box.cy < slide.cy * TINY_HEIGHT
  );
}

function plainText(item: RawItem): string {
  return item.paragraphs
    .map((paragraph) => paragraph.plain)
    .join('\n')
    .trim();
}

function sameLine(left: Box, right: Box, slide: Box): boolean {
  if (slide.cy > 0 && (left.cy > slide.cy * 0.22 || right.cy > slide.cy * 0.22)) return false;
  const leftCenter = left.y + left.cy / 2;
  const rightCenter = right.y + right.cy / 2;
  const centerClose = Math.abs(leftCenter - rightCenter) <= 0.6 * Math.max(left.cy, right.cy);
  return centerClose || yOverlapRatio(left, right) >= 0.55;
}

function keywordTone(item: RawItem): CalloutTone | null {
  if (!isSimpleText(item)) return null;
  const paragraph = item.paragraphs[0];
  if (!paragraph?.bold) return null;
  const plain = paragraph.plain.trim();
  if (plain.startsWith('易錯')) return 'danger';
  if (plain.startsWith('口訣')) return 'success';
  if (plain.startsWith('示範答案')) return 'info';
  if (plain.startsWith('本課重點：') || plain.startsWith('本課重點:')) {
    return paragraph.color === 'danger' ? 'danger' : 'note';
  }
  return null;
}

function bannerTone(hex: string): CalloutTone | null {
  const known: Record<string, CalloutTone> = {
    '#e3f0ff': 'info',
    '#e8f5ff': 'info',
    '#fff4d9': 'warning',
    '#fff0f0': 'danger',
    '#eafbf4': 'success',
  };
  const value = cssHex(hex);
  if (!value) return null;
  if (known[value]) return known[value];
  const rgb = rgbOf(value);
  if (!rgb) return null;
  if (luminance(rgb.r, rgb.g, rgb.b) < 0.7) return null;
  const { h, s } = hsl(rgb.r, rgb.g, rgb.b);
  if (s < 0.12) return null;
  if (h < 15 || h >= 345) return 'danger';
  if (h < 70) return 'warning';
  if (h < 170) return 'success';
  if (h < 260) return 'info';
  return null;
}

function highlightFor(hex: string): HighlightColor | null {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) return 'gray';
  const { h } = hsl(r, g, b);
  if (h < 15 || h >= 345) return 'red';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  if (h < 330) return 'purple';
  return 'red';
}

function semanticTextColor(hex: string): InlineColor | null {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const lum = luminance(r, g, b);
  if (lum < 0.08 || lum > 0.92) return null;
  const { h, s } = hsl(r, g, b);
  if (s < 0.28) return 'muted';
  if (h < 15 || h >= 345) return 'danger';
  if (h < 70) return 'warning';
  if (h < 170) return 'success';
  if (h < 260) return 'primary';
  if (h < 330) return 'accent';
  return 'danger';
}

function isWarmCream(hex: string): boolean {
  const rgb = rgbOf(hex);
  if (!rgb) return false;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 220 || min < 190) return false;
  if (r + g + b >= 750) return false;
  return r + 2 >= g && g + 2 >= b && r - b >= 8;
}

function rgbOf(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function hsl(r: number, g: number, b: number): { h: number; s: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation };
}

function readFill(element: XmlElement | undefined, theme: Map<string, string>): Fill | undefined {
  if (!element) return undefined;
  const solid = findFill(element, 'solidFill');
  if (solid) {
    const value = readSolidColor(solid, theme);
    if (value) return { kind: 'color', value };
  }
  const gradient = findFill(element, 'gradFill');
  if (!gradient) return undefined;
  const stops = descendants(gradient, 'gs')
    .map((stop) => ({
      pos: Number(attr(stop, 'pos') ?? '0'),
      color: readSolidColor(stop, theme),
    }))
    .filter((stop): stop is { pos: number; color: string } => Boolean(stop.color))
    .sort((left, right) => left.pos - right.pos);
  const from = stops[0]?.color;
  const to = stops[stops.length - 1]?.color;
  if (!from || !to) return undefined;
  const linear = child(gradient, 'lin') ?? descendants(gradient, 'lin')[0];
  return { kind: 'gradient', from, to, angle: gradientAngle(linear) };
}

function findFill(element: XmlElement, tag: 'solidFill' | 'gradFill'): XmlElement | undefined {
  const direct = child(element, tag);
  if (direct) return direct;
  for (const node of element.children) {
    if (typeof node === 'string') continue;
    const name = localName(node.name);
    if (name === 'ln' || name === 'effectLst') continue;
    if (name === tag) return node;
    const nested = findFill(node, tag);
    if (nested) return nested;
  }
  return undefined;
}

function readSolidColor(
  element: XmlElement | undefined,
  theme: Map<string, string>,
): string | undefined {
  if (!element) return undefined;
  const srgb = child(element, 'srgbClr');
  const fromSrgb = cssHex(srgb ? attr(srgb, 'val') : undefined);
  if (fromSrgb) return fromSrgb;
  const scheme = child(element, 'schemeClr');
  const name = scheme ? attr(scheme, 'val') : undefined;
  return name ? theme.get(name) : undefined;
}

function fillToBackground(fill: Fill | undefined): CardBackground | undefined {
  if (!fill) return undefined;
  if (fill.kind === 'color') return { kind: 'color', value: fill.value };
  return { kind: 'gradient', from: fill.from, to: fill.to, angle: fill.angle };
}

function gradientAngle(linear: XmlElement | undefined): number {
  const raw = Number(linear ? attr(linear, 'ang') : undefined);
  if (!Number.isFinite(raw)) return 135;
  const degrees = (((raw / 60000) % 360) + 360) % 360;
  const angle = Math.round((degrees + 90) % 360);
  return angle >= 360 ? 0 : angle;
}

function centerInside(outer: Box, inner: Box): boolean {
  const x = inner.x + inner.cx / 2;
  const y = inner.y + inner.cy / 2;
  return x >= outer.x && x <= outer.x + outer.cx && y >= outer.y && y <= outer.y + outer.cy;
}

function containsBox(outer: Box, inner: Box, slack: number): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.cx <= outer.x + outer.cx + slack &&
    inner.y + inner.cy <= outer.y + outer.cy + slack
  );
}

function insideRatio(box: Box, slide: Box): number {
  const width = Math.max(0, Math.min(box.x + box.cx, slide.cx) - Math.max(box.x, slide.x));
  const height = Math.max(0, Math.min(box.y + box.cy, slide.cy) - Math.max(box.y, slide.y));
  const shape = area(box);
  return shape > 0 ? (width * height) / shape : 0;
}

function xGap(left: Box, right: Box): number {
  const leftEnd = left.x + left.cx;
  const rightEnd = right.x + right.cx;
  if (leftEnd >= right.x && rightEnd >= left.x) return 0;
  return leftEnd < right.x ? right.x - leftEnd : left.x - rightEnd;
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

function isFullWidth(item: RawItem, slide: Box): boolean {
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

function unionBox(items: readonly RawItem[]): Box {
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
