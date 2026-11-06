import { MAX_LIST_DEPTH } from '../constants';
import type { CalloutTone, HighlightColor, InlineColor, ThemePreset } from '../constants';
import { createId } from '../ids';
import type { IdKind } from '../ids';
import { inlineToPlainText, isSafeHref, normalizeInline, serializeInline } from '../inline';
import type { InlineNode } from '../inline';
import { parseDocument } from '../parse';
import type { ImageAsset } from '../schema/asset';
import type { ListItem } from '../schema/blocks';
import type { LoomaCard } from '../schema/card';
import type { LoomaDocument } from '../schema/document';
import type { LoomaNode } from '../schema/nodes';
import { isImageSrc } from '../schema/primitives';
import { attr, child, children, descendants, localName, parseXml, textContent } from '../pptx/xml';
import type { XmlElement } from '../pptx/xml';
import { unzipPptx } from '../pptx/zip';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export interface DocxDiagnostic {
  kind:
    'unsupported-media' | 'missing-relationship' | 'merged-table-cell' | 'nested-table-flattened';
  message: string;
}

export interface ImportDocxOptions {
  /** Fallback document title (e.g. filename without .docx) when docProps/core.xml has no title. */
  title?: string;
  /** Target Looma document format. Defaults to 'document'. */
  format?: 'document' | 'presentation';
  /** Initial theme preset. Defaults to 'warm' when warm shading is detected, otherwise 'clean'. */
  themePreset?: ThemePreset;
  /** How to split the Word document into cards. Defaults to 'section'. */
  splitBy?: 'section' | 'page' | 'single';
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

export type ImportDocxResult =
  | { ok: true; doc: LoomaDocument; warnings: string[]; diagnostics: DocxDiagnostic[] }
  | { ok: false; error: string };

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

interface StyleInfo {
  id: string;
  name: string;
  basedOn?: string;
  headingLevel?: 1 | 2 | 3 | 4;
  numId?: string;
  ilvl?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

interface DocxState {
  files: Map<string, Uint8Array>;
  rels: Relationship[];
  styles: Map<string, StyleInfo>;
  numFormats: Map<string, Map<number, 'bullet' | 'number'>>;
  warnings: string[];
  diagnostics: DocxDiagnostic[];
  assets: Record<string, ImageAsset>;
  assetByPath: Map<string, string>;
  ids: (kind: IdKind) => string;
  uploadAsset?: ImportDocxOptions['uploadAsset'];
  hasWarmShading: boolean;
}

interface PendingListItem {
  style: 'bullet' | 'number';
  level: number;
  text: string;
}

/** Converts a `.docx` package into a validated `.looma` document. */
export async function importDocx(
  input: ArrayBuffer | Uint8Array,
  options?: ImportDocxOptions,
): Promise<ImportDocxResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return {
      ok: false,
      error: 'Legacy binary .doc format is not supported directly; please save as .docx.',
    };
  }

  const archive = await unzipPptx(input);
  if (!archive.ok) return archive;

  const docXml = readXml(archive.files, 'word/document.xml');
  if (!docXml) {
    return { ok: false, error: 'No word/document.xml found in the Word file.' };
  }

  const body = child(docXml, 'body') ?? descendants(docXml, 'body')[0];
  if (!body) {
    return { ok: false, error: 'No document body found in word/document.xml.' };
  }

  const warnings: string[] = [];
  const diagnostics: DocxDiagnostic[] = [];
  const taken = new Set<string>();
  const state: DocxState = {
    files: archive.files,
    rels: readRelationships(archive.files, 'word/document.xml'),
    styles: readStyles(archive.files),
    numFormats: readNumbering(archive.files),
    warnings,
    diagnostics,
    assets: {},
    assetByPath: new Map(),
    ids: (kind) => {
      const id = createId(kind, taken);
      taken.add(id);
      return id;
    },
    uploadAsset: options?.uploadAsset,
    hasWarmShading: false,
  };

  const format = options?.format ?? 'document';
  const splitBy = options?.splitBy ?? 'section';

  const cards = await convertBodyToCards(state, body, format, splitBy);
  if (cards.length === 0) {
    return { ok: false, error: 'No readable content found in the Word file.' };
  }

  const preset: ThemePreset = options?.themePreset ?? (state.hasWarmShading ? 'warm' : 'clean');

  const candidate = {
    looma: 2 as const,
    id: state.ids('document'),
    title: resolveDocxTitle(archive.files, cards, options?.title),
    format,
    theme: { preset },
    assets: state.assets,
    cards,
  };

  const parsed = parseDocument(candidate, { repair: true });
  if (!parsed.ok) {
    const detail = parsed.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    return { ok: false, error: `Word import failed validation: ${detail}` };
  }
  for (const issue of parsed.warnings) warn(warnings, issue.message);
  return { ok: true, doc: parsed.doc, warnings, diagnostics };
}

async function convertBodyToCards(
  state: DocxState,
  body: XmlElement,
  format: 'document' | 'presentation',
  splitBy: 'section' | 'page' | 'single',
): Promise<LoomaCard[]> {
  const cards: LoomaCard[] = [];
  let currentNodes: LoomaNode[] = [];
  let pendingList: PendingListItem[] = [];
  let seenH2InCurrentCard = false;
  let seenH3InCurrentCard = false;

  const flushList = () => {
    if (pendingList.length === 0) return;
    const style = pendingList[0]?.style ?? 'bullet';
    currentNodes.push({
      id: state.ids('block'),
      type: 'list',
      style,
      items: nestListItems(pendingList),
    });
    pendingList = [];
  };

  const flushCard = () => {
    flushList();
    if (currentNodes.length === 0) return;
    cards.push({
      id: state.ids('card'),
      body: currentNodes,
    });
    currentNodes = [];
    seenH2InCurrentCard = false;
    seenH3InCurrentCard = false;
  };

  for (const node of body.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);

    if (tag === 'p') {
      const pPr = child(node, 'pPr');
      const hasPageBreak =
        Boolean(pPr && child(pPr, 'pageBreakBefore')) ||
        Boolean(pPr && child(pPr, 'sectPr')) ||
        descendants(node, 'br').some((br) => attrValue(br, 'type') === 'page');

      if (
        hasPageBreak &&
        splitBy !== 'single' &&
        (currentNodes.length > 0 || pendingList.length > 0)
      ) {
        flushCard();
      }

      const styleId = pPr ? attrValue(child(pPr, 'pStyle'), 'val') : undefined;
      const styleInfo = resolveStyleInfo(state.styles, styleId);
      const headingLevel = detectHeadingLevel(pPr, styleInfo);

      // Check for section card split
      if (splitBy === 'section') {
        if (headingLevel === 2) {
          if (seenH2InCurrentCard && (currentNodes.length > 0 || pendingList.length > 0)) {
            flushCard();
          }
          seenH2InCurrentCard = true;
          seenH3InCurrentCard = false;
        } else if (headingLevel === 3 && format === 'presentation') {
          if (seenH3InCurrentCard && (currentNodes.length > 0 || pendingList.length > 0)) {
            flushCard();
          }
          seenH3InCurrentCard = true;
        }
      }

      // Extract embedded drawings/pictures inside paragraph
      const imageAssetIds = await extractParagraphImages(state, node);

      // Check list item
      const listMeta = detectListMeta(state, pPr, styleInfo);
      if (listMeta && headingLevel === undefined) {
        const inline = serializeDocxParagraph(state, node, styleInfo, false);
        if (inline.trim()) {
          if (
            pendingList.length > 0 &&
            pendingList[0]!.style !== listMeta.style &&
            listMeta.level === 0
          ) {
            flushList();
          }
          pendingList.push({
            style: listMeta.style,
            level: listMeta.level,
            text: inline.trim(),
          });
        }
        for (const assetId of imageAssetIds) {
          flushList();
          currentNodes.push({ id: state.ids('block'), type: 'image', assetId });
        }
        continue;
      }

      flushList();

      // Check top/bottom divider rule on paragraph borders
      const pBdr = pPr ? child(pPr, 'pBdr') : undefined;
      const hasTopBorder = Boolean(
        pBdr && child(pBdr, 'top') && attrValue(child(pBdr, 'top'), 'val') !== 'none',
      );
      const hasLeftBorder = Boolean(
        pBdr && child(pBdr, 'left') && attrValue(child(pBdr, 'left'), 'val') !== 'none',
      );
      const shdFill = readShadingFill(pPr ? child(pPr, 'shd') : undefined);
      if (shdFill && isWarmHex(shdFill)) state.hasWarmShading = true;

      if (hasTopBorder && !shdFill && !hasLeftBorder) {
        currentNodes.push({ id: state.ids('block'), type: 'divider' });
      }

      // Callout detection: paragraph with shading or left border
      if ((shdFill || hasLeftBorder) && headingLevel === undefined) {
        const plain = plainParagraphText(node).trim();
        // Skip standalone 1-2 char numbered badges like "1", "2", "3" or merge with next if needed
        const isDarkFill = shdFill ? isDarkHex(shdFill) : false;
        const inline = serializeDocxParagraph(state, node, styleInfo, isDarkFill);
        if (inline.trim()) {
          if (/^\d{1,2}$/.test(plain) && shdFill) {
            const hl = highlightFromHex(shdFill) ?? 'pink';
            currentNodes.push({
              id: state.ids('block'),
              type: 'paragraph',
              text: normalizeInline(`{highlight:${hl}}**${plain}**{/highlight}`),
            });
          } else {
            const leftColor = pBdr ? attrValue(child(pBdr, 'left'), 'color') : undefined;
            const tone = calloutToneFromHex(leftColor ?? shdFill);
            currentNodes.push({
              id: state.ids('block'),
              type: 'callout',
              tone,
              text: inline.trim(),
            });
          }
        }
        for (const assetId of imageAssetIds) {
          currentNodes.push({ id: state.ids('block'), type: 'image', assetId });
        }
        continue;
      }

      const inline = serializeDocxParagraph(state, node, styleInfo, false).trim();
      if (inline) {
        if (headingLevel !== undefined) {
          const mappedLevel: 1 | 2 | 3 = headingLevel === 1 ? 1 : headingLevel === 2 ? 2 : 3;
          currentNodes.push({
            id: state.ids('block'),
            type: 'heading',
            level: mappedLevel,
            text: inline,
          });
        } else {
          const align = readAlignment(pPr) ?? styleInfo?.align;
          currentNodes.push(
            align && align !== 'left'
              ? { id: state.ids('block'), type: 'paragraph', text: inline, align }
              : { id: state.ids('block'), type: 'paragraph', text: inline },
          );
        }
      }

      for (const assetId of imageAssetIds) {
        currentNodes.push({ id: state.ids('block'), type: 'image', assetId });
      }
      continue;
    }

    if (tag === 'tbl') {
      flushList();
      const tableNode = convertDocxTable(state, node);
      if (tableNode) currentNodes.push(tableNode);
    }
  }

  flushCard();
  return cards;
}

function convertDocxTable(state: DocxState, tbl: XmlElement): LoomaNode | null {
  const trs = children(tbl, 'tr');
  if (trs.length === 0) return null;

  let reportedMerge = false;
  const rawRows: string[][] = [];

  for (const tr of trs) {
    const rowCells: string[] = [];
    for (const tc of children(tr, 'tc')) {
      const tcPr = child(tc, 'tcPr');
      const shdFill = readShadingFill(tcPr ? child(tcPr, 'shd') : undefined);
      if (shdFill && isWarmHex(shdFill)) state.hasWarmShading = true;
      const isDarkCell = shdFill ? isDarkHex(shdFill) : false;

      const gridSpan = Number(attrValue(tcPr ? child(tcPr, 'gridSpan') : undefined, 'val') ?? '1');
      const vMerge = tcPr ? child(tcPr, 'vMerge') : undefined;
      if ((gridSpan > 1 || vMerge) && !reportedMerge) {
        reportedMerge = true;
        recordDiagnostic(state, {
          kind: 'merged-table-cell',
          message:
            'Table contains merged cells (gridSpan/vMerge) which were normalized into a rectangular grid.',
        });
      }

      if (
        vMerge &&
        attrValue(vMerge, 'val') !== 'restart' &&
        plainParagraphText(tc).trim() === ''
      ) {
        rowCells.push('');
        continue;
      }

      const cellParagraphs = children(tc, 'p')
        .map((p) => {
          const pPr = child(p, 'pPr');
          const styleId = pPr ? attrValue(child(pPr, 'pStyle'), 'val') : undefined;
          const styleInfo = resolveStyleInfo(state.styles, styleId);
          return serializeDocxParagraph(state, p, styleInfo, isDarkCell).trim();
        })
        .filter((line) => line.length > 0);

      for (const nestedTbl of children(tc, 'tbl')) {
        recordDiagnostic(state, {
          kind: 'nested-table-flattened',
          message: 'Nested table inside a table cell was flattened into cell text.',
        });
        const nestedText = plainParagraphText(nestedTbl).trim();
        if (nestedText) cellParagraphs.push(nestedText);
      }

      const cellText = cellParagraphs.join('\n');
      rowCells.push(cellText);
      for (let s = 1; s < gridSpan; s += 1) {
        rowCells.push('');
      }
    }
    if (rowCells.length > 0) rawRows.push(rowCells);
  }

  if (rawRows.length === 0) return null;
  const width = Math.max(1, ...rawRows.map((r) => r.length));
  const rectangular = rawRows.map((row) => {
    const copy = row.slice();
    while (copy.length < width) copy.push('');
    return copy;
  });

  const tblPr = child(tbl, 'tblPr');
  const tblLook = tblPr ? child(tblPr, 'tblLook') : undefined;
  const firstRowAttr = tblLook ? attrValue(tblLook, 'firstRow') : undefined;
  const firstRowTrPr = children(trs[0]!, 'trPr')[0];
  const tblHeader = firstRowTrPr ? Boolean(child(firstRowTrPr, 'tblHeader')) : false;
  const header =
    tblHeader ||
    firstRowAttr === '1' ||
    firstRowAttr === 'true' ||
    (firstRowAttr !== '0' && firstRowAttr !== 'false' && rectangular.length > 1);

  return {
    id: state.ids('block'),
    type: 'table',
    header,
    rows: rectangular,
  };
}

interface RunPiece {
  break?: boolean;
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  color?: InlineColor;
  highlight?: HighlightColor;
  href?: string;
}

function serializeDocxParagraph(
  state: DocxState,
  paragraph: XmlElement,
  styleInfo: StyleInfo | undefined,
  insideDarkBackground: boolean,
): string {
  const pieces: RunPiece[] = [];
  const headingLike = styleInfo?.headingLevel !== undefined;

  const collectFromContainer = (container: XmlElement, linkHref?: string) => {
    for (const node of container.children) {
      if (typeof node === 'string') continue;
      const tag = localName(node.name);
      if (tag === 'hyperlink') {
        const relId = attrValue(node, 'id');
        const rel = relId ? state.rels.find((item) => item.id === relId) : undefined;
        const href = rel?.target && isSafeHref(rel.target) ? rel.target : undefined;
        collectFromContainer(node, href);
        continue;
      }
      if (tag === 'r') {
        extractRunPieces(
          state,
          node,
          styleInfo,
          insideDarkBackground,
          headingLike,
          linkHref,
          pieces,
        );
      } else if (tag === 'br') {
        if (attrValue(node, 'type') !== 'page') {
          pieces.push({ break: true, text: '', bold: false, italic: false, strike: false });
        }
      }
    }
  };

  collectFromContainer(paragraph);

  // Clean up redundant spaces around full-width punctuation inside mixed runs
  const merged: RunPiece[] = [];
  for (const piece of pieces) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !prev.break &&
      !piece.break &&
      prev.bold === piece.bold &&
      prev.italic === piece.italic &&
      prev.strike === piece.strike &&
      prev.color === piece.color &&
      prev.highlight === piece.highlight &&
      prev.href === piece.href
    ) {
      prev.text += piece.text;
    } else {
      merged.push({ ...piece });
    }
  }

  const inlineNodes: InlineNode[] = [];
  for (const piece of merged) {
    if (piece.break) {
      inlineNodes.push({ type: 'break' });
      continue;
    }
    if (!piece.text) continue;
    let node: InlineNode = { type: 'text', value: piece.text };
    if (piece.strike) node = { type: 'strike', children: [node] };
    if (piece.italic) node = { type: 'italic', children: [node] };
    if (piece.bold) node = { type: 'bold', children: [node] };
    if (piece.color) node = { type: 'color', color: piece.color, children: [node] };
    if (piece.highlight) node = { type: 'highlight', color: piece.highlight, children: [node] };
    if (piece.href) node = { type: 'link', href: piece.href, children: [node] };
    inlineNodes.push(node);
  }

  return inlineNodes.length > 0 ? normalizeInline(serializeInline(inlineNodes)) : '';
}

function extractRunPieces(
  state: DocxState,
  run: XmlElement,
  styleInfo: StyleInfo | undefined,
  insideDarkBackground: boolean,
  headingLike: boolean,
  linkHref: string | undefined,
  out: RunPiece[],
): void {
  const rPr = child(run, 'rPr');
  const boldAttr = rPr ? child(rPr, 'b') : undefined;
  const bold =
    boldAttr !== undefined
      ? attrValue(boldAttr, 'val') !== '0' && attrValue(boldAttr, 'val') !== 'false'
      : false;
  const italicAttr = rPr ? child(rPr, 'i') : undefined;
  const italic =
    italicAttr !== undefined
      ? attrValue(italicAttr, 'val') !== '0' && attrValue(italicAttr, 'val') !== 'false'
      : false;
  const strikeAttr = rPr ? (child(rPr, 'strike') ?? child(rPr, 'dstrike')) : undefined;
  const strike =
    strikeAttr !== undefined
      ? attrValue(strikeAttr, 'val') !== '0' && attrValue(strikeAttr, 'val') !== 'false'
      : false;

  const colorHex = rPr ? attrValue(child(rPr, 'color'), 'val') : undefined;
  const shdFill = readShadingFill(rPr ? child(rPr, 'shd') : undefined);
  const wHighlight = rPr ? attrValue(child(rPr, 'highlight'), 'val') : undefined;

  let color: InlineColor | undefined;
  let highlight: HighlightColor | undefined;

  if (shdFill) {
    highlight = highlightFromHex(shdFill);
  } else if (wHighlight && wHighlight !== 'none') {
    highlight = mapWordHighlightName(wHighlight);
  }

  const isWhiteText = colorHex ? /^f{6}$/i.test(colorHex.replace(/^#/, '')) : false;

  if (isWhiteText) {
    if (!insideDarkBackground && !highlight) {
      // White text in a Word paragraph without cell/run shading comes from VML/drawing badges (e.g. "① 情境导入 5′").
      // Render as a visible highlighted pill instead of invisible text!
      if (!headingLike) {
        highlight = 'blue';
        color = 'primary';
      }
    }
  } else if (colorHex && colorHex.toLowerCase() !== 'auto') {
    const mapped = semanticColorFromHex(colorHex);
    // Avoid冗余 primary color on plain H1/H2 unless it's a mixed-run heading or non-primary accent
    if (mapped && (!headingLike || mapped !== 'primary' || bold)) {
      color = mapped;
    }
  }

  for (const childNode of run.children) {
    if (typeof childNode === 'string') continue;
    const tag = localName(childNode.name);
    if (tag === 't') {
      const value = textContent(childNode);
      if (!value) continue;
      if (isWhiteText && !insideDarkBackground && !headingLike && value.trim().length > 0) {
        out.push({
          text: value.trim(),
          bold: true,
          italic,
          strike,
          color: 'primary',
          highlight: 'blue',
          href: linkHref,
        });
        out.push({
          text: '   ',
          bold: false,
          italic: false,
          strike: false,
        });
      } else {
        out.push({
          text: value,
          bold,
          italic,
          strike,
          color,
          highlight,
          href: linkHref,
        });
      }
    } else if (tag === 'tab') {
      out.push({ text: '   ', bold: false, italic: false, strike: false });
    } else if (tag === 'br') {
      if (attrValue(childNode, 'type') !== 'page') {
        out.push({ break: true, text: '', bold: false, italic: false, strike: false });
      }
    }
  }
}

async function extractParagraphImages(state: DocxState, paragraph: XmlElement): Promise<string[]> {
  const assetIds: string[] = [];
  const blips = [...descendants(paragraph, 'blip'), ...descendants(paragraph, 'imagedata')];
  for (const blip of blips) {
    const relId =
      attrValue(blip, 'embed') ??
      attrValue(blip, 'id') ??
      attr(blip, 'r:embed') ??
      attr(blip, 'r:id');
    if (!relId) continue;
    const rel = state.rels.find((item) => item.id === relId);
    if (!rel) {
      recordDiagnostic(state, {
        kind: 'missing-relationship',
        message: `Missing image relationship "${relId}" in word/document.xml.`,
      });
      continue;
    }
    const assetId = await resolveDocxAsset(state, rel);
    if (assetId) assetIds.push(assetId);
  }
  return assetIds;
}

async function resolveDocxAsset(state: DocxState, rel: Relationship): Promise<string | null> {
  if (rel.external) {
    if (!isImageSrc(rel.target)) {
      recordDiagnostic(state, {
        kind: 'unsupported-media',
        message: `Skipped unsupported external media "${rel.target}".`,
      });
      return null;
    }
    const existing = state.assetByPath.get(rel.target);
    if (existing) return existing;
    const id = state.ids('asset');
    state.assetByPath.set(rel.target, id);
    state.assets[id] = { kind: 'image', src: rel.target, alt: '' };
    return id;
  }

  const part = canonicalPath(state.files, resolvePart('word/document.xml', rel.target));
  const cached = state.assetByPath.get(part);
  if (cached) return cached;

  const bytes = fileBytes(state.files, part);
  if (!bytes) {
    recordDiagnostic(state, {
      kind: 'missing-relationship',
      message: `Missing media file "${part}" in Word archive.`,
    });
    return null;
  }

  const ext = fileExtension(part);
  const mimeType = IMAGE_TYPES[ext];
  if (!mimeType) {
    recordDiagnostic(state, {
      kind: 'unsupported-media',
      message: `Skipped unsupported media "${part}".`,
    });
    return null;
  }

  if (state.uploadAsset) {
    const filename = part.split('/').pop() ?? part;
    const uploaded = await state.uploadAsset({ filename, mimeType, bytes });
    const id = state.ids('asset');
    state.assetByPath.set(part, id);
    state.assets[id] = {
      kind: 'image',
      src: uploaded.src,
      alt: uploaded.alt ?? '',
      ...(uploaded.width ? { width: uploaded.width } : {}),
      ...(uploaded.height ? { height: uploaded.height } : {}),
    };
    return id;
  }

  const src = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  const id = state.ids('asset');
  state.assetByPath.set(part, id);
  state.assets[id] = { kind: 'image', src, alt: '' };
  return id;
}

function readStyles(files: Map<string, Uint8Array>): Map<string, StyleInfo> {
  const map = new Map<string, StyleInfo>();
  const xml = readXml(files, 'word/styles.xml');
  if (!xml) return map;

  for (const style of children(xml, 'style')) {
    const id = attrValue(style, 'styleId');
    if (!id) continue;
    const nameEl = child(style, 'name');
    const name = (attrValue(nameEl, 'val') ?? id).trim();
    const basedOn = attrValue(child(style, 'basedOn'), 'val');
    const pPr = child(style, 'pPr');
    const rPr = child(style, 'rPr');

    let headingLevel = matchHeadingLevel(id) ?? matchHeadingLevel(name);
    const outlineLvl = pPr ? Number(attrValue(child(pPr, 'outlineLvl'), 'val')) : NaN;
    if (!headingLevel && Number.isInteger(outlineLvl) && outlineLvl >= 0 && outlineLvl <= 3) {
      headingLevel = (outlineLvl + 1) as 1 | 2 | 3 | 4;
    }

    const numPr = pPr ? child(pPr, 'numPr') : undefined;
    const numId = numPr ? attrValue(child(numPr, 'numId'), 'val') : undefined;
    const ilvlRaw = numPr ? Number(attrValue(child(numPr, 'ilvl'), 'val') ?? '0') : undefined;

    const info: StyleInfo = { id, name };
    if (basedOn) info.basedOn = basedOn;
    if (headingLevel) info.headingLevel = headingLevel;
    if (numId) info.numId = numId;
    if (ilvlRaw !== undefined && Number.isFinite(ilvlRaw)) info.ilvl = ilvlRaw;
    const align = readAlignment(pPr);
    if (align) info.align = align;
    if (rPr && child(rPr, 'b')) info.bold = true;
    if (rPr && child(rPr, 'i')) info.italic = true;
    const color = rPr ? attrValue(child(rPr, 'color'), 'val') : undefined;
    if (color) info.color = color;
    map.set(id, info);
  }
  return map;
}

function resolveStyleInfo(
  styles: Map<string, StyleInfo>,
  styleId: string | undefined,
): StyleInfo | undefined {
  if (!styleId) return undefined;
  const direct = styles.get(styleId);
  if (!direct) {
    const level = matchHeadingLevel(styleId);
    return level ? { id: styleId, name: styleId, headingLevel: level } : undefined;
  }
  return direct;
}

function matchHeadingLevel(value: string): 1 | 2 | 3 | 4 | undefined {
  const lower = value.toLowerCase().replace(/\s+/g, '');
  if (lower === 'title' || lower === 'heading1' || lower === '标题1') return 1;
  if (lower === 'heading2' || lower === '标题2') return 2;
  if (lower === 'heading3' || lower === '标题3') return 3;
  if (lower === 'heading4' || lower === '标题4') return 4;
  return undefined;
}

function detectHeadingLevel(
  pPr: XmlElement | undefined,
  styleInfo: StyleInfo | undefined,
): 1 | 2 | 3 | 4 | undefined {
  if (styleInfo?.headingLevel) return styleInfo.headingLevel;
  const outlineLvl = pPr ? Number(attrValue(child(pPr, 'outlineLvl'), 'val')) : NaN;
  if (Number.isInteger(outlineLvl) && outlineLvl >= 0 && outlineLvl <= 3) {
    return (outlineLvl + 1) as 1 | 2 | 3 | 4;
  }
  return undefined;
}

function readNumbering(
  files: Map<string, Uint8Array>,
): Map<string, Map<number, 'bullet' | 'number'>> {
  const out = new Map<string, Map<number, 'bullet' | 'number'>>();
  const xml = readXml(files, 'word/numbering.xml');
  if (!xml) return out;

  const abstractMap = new Map<string, Map<number, 'bullet' | 'number'>>();
  for (const abs of children(xml, 'abstractNum')) {
    const absId = attrValue(abs, 'abstractNumId');
    if (!absId) continue;
    const levels = new Map<number, 'bullet' | 'number'>();
    for (const lvl of children(abs, 'lvl')) {
      const ilvl = Number(attrValue(lvl, 'ilvl') ?? '0');
      const numFmt = attrValue(child(lvl, 'numFmt'), 'val') ?? 'bullet';
      levels.set(ilvl, numFmt === 'bullet' ? 'bullet' : 'number');
    }
    abstractMap.set(absId, levels);
  }

  for (const num of children(xml, 'num')) {
    const numId = attrValue(num, 'numId');
    const absId = attrValue(child(num, 'abstractNumId'), 'val');
    if (!numId || !absId) continue;
    const levels = abstractMap.get(absId);
    if (levels) out.set(numId, levels);
  }
  return out;
}

function detectListMeta(
  state: DocxState,
  pPr: XmlElement | undefined,
  styleInfo: StyleInfo | undefined,
): { style: 'bullet' | 'number'; level: number } | null {
  const numPr = pPr ? child(pPr, 'numPr') : undefined;
  const numId = (numPr ? attrValue(child(numPr, 'numId'), 'val') : undefined) ?? styleInfo?.numId;
  const ilvlRaw = numPr ? Number(attrValue(child(numPr, 'ilvl'), 'val')) : NaN;
  const level = Number.isFinite(ilvlRaw)
    ? Math.max(0, Math.min(MAX_LIST_DEPTH - 1, Math.floor(ilvlRaw)))
    : (styleInfo?.ilvl ?? 0);

  if (numId && numId !== '0') {
    const fmt = state.numFormats.get(numId)?.get(level);
    if (fmt) return { style: fmt, level };
    const nameLower = (styleInfo?.name ?? styleInfo?.id ?? '').toLowerCase();
    return { style: nameLower.includes('number') ? 'number' : 'bullet', level };
  }

  const styleName = (styleInfo?.name ?? styleInfo?.id ?? '').toLowerCase();
  if (styleName.includes('listbullet') || styleName.includes('list bullet')) {
    return { style: 'bullet', level };
  }
  if (styleName.includes('listnumber') || styleName.includes('list number')) {
    return { style: 'number', level };
  }
  return null;
}

function nestListItems(items: readonly PendingListItem[]): ListItem[] {
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
  return root.map((item) => (item.children ? item : item.text));
}

function resolveDocxTitle(
  files: Map<string, Uint8Array>,
  cards: readonly LoomaCard[],
  fallback: string | undefined,
): string {
  const core = readXml(files, 'docProps/core.xml');
  const coreTitleNode = core ? descendants(core, 'title')[0] : undefined;
  const fromCore = coreTitleNode ? textContent(coreTitleNode).trim() : '';
  if (fromCore) return fromCore;
  if (fallback?.trim()) return fallback.trim();
  for (const card of cards) {
    for (const node of card.body) {
      if (node.type === 'heading' && node.text.trim()) {
        return inlineToPlainText(node.text).trim();
      }
    }
  }
  return 'UntitledDocument';
}

function readAlignment(pPr: XmlElement | undefined): 'left' | 'center' | 'right' | undefined {
  const jc = pPr ? child(pPr, 'jc') : undefined;
  const val = attrValue(jc, 'val');
  if (val === 'center') return 'center';
  if (val === 'right' || val === 'end') return 'right';
  if (val === 'left' || val === 'start') return 'left';
  return undefined;
}

function readShadingFill(shd: XmlElement | undefined): string | undefined {
  if (!shd) return undefined;
  const fill = attrValue(shd, 'fill');
  if (!fill || fill.toLowerCase() === 'auto' || /^f{6}$/i.test(fill)) return undefined;
  return fill;
}

function semanticColorFromHex(hex: string): InlineColor | undefined {
  const rgb = parseHexRgb(hex);
  if (!rgb) return undefined;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  // Dark charcoal body text (#2E2A26, #333333, etc.) -> default foreground
  if (max < 75 && chroma < 30) return undefined;
  // Muted brown/gray (#8B8178, #6B7280, etc.)
  if (chroma < 45 && max >= 75 && max <= 185) return 'muted';
  // Blue (#3B82F6, #2563EB, #1D4ED8)
  if (b > r + 40 && b > g + 15) return 'primary';
  // Green (#15803D, #059669)
  if (g > r + 25 && g >= b) return 'success';
  // Red / Pink / Rose (#BE123C, #FB7185, #EC4899)
  if (r > g + 45 && r > b + 15) return 'danger';
  // Amber / Orange / Brown-Gold (#B45309, #D97706, #F59E0B)
  if (r > b + 50 && g > b + 20) return 'warning';
  return undefined;
}

function calloutToneFromHex(hex: string | undefined): CalloutTone {
  if (!hex) return 'note';
  const rgb = parseHexRgb(hex);
  if (!rgb) return 'note';
  const { r, g, b } = rgb;
  if (r > 200 && g > 140 && b < 120) return 'warning';
  if (r > 235 && g > 225 && b < 235 && r > b) return 'warning';
  if (b > r + 20 && b >= g) return 'info';
  if (g > r + 10 && g >= b) return 'success';
  if (r > g + 25) return 'danger';
  return 'note';
}

function highlightFromHex(hex: string): HighlightColor | undefined {
  const rgb = parseHexRgb(hex);
  if (!rgb) return undefined;
  const { r, g, b } = rgb;
  if (r > g + 30 && b > g + 10) return 'pink';
  if (b > r + 20 && b >= g) return 'blue';
  if (g > r + 15 && g >= b) return 'green';
  if (r > b + 30 && g > b + 15) return 'yellow';
  return 'gray';
}

function mapWordHighlightName(name: string): HighlightColor | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('yellow')) return 'yellow';
  if (lower.includes('green')) return 'green';
  if (lower.includes('cyan') || lower.includes('blue')) return 'blue';
  if (lower.includes('magenta') || lower.includes('pink')) return 'pink';
  if (lower.includes('red')) return 'red';
  return 'gray';
}

function isWarmHex(hex: string): boolean {
  const rgb = parseHexRgb(hex);
  if (!rgb) return false;
  return rgb.r >= 245 && rgb.g >= 235 && rgb.b >= 200 && rgb.r > rgb.b;
}

function isDarkHex(hex: string): boolean {
  const rgb = parseHexRgb(hex);
  if (!rgb) return false;
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance < 165;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function plainParagraphText(el: XmlElement): string {
  return descendants(el, 't')
    .map((t) => textContent(t))
    .join('');
}

function attrValue(el: XmlElement | undefined, localKey: string): string | undefined {
  if (!el) return undefined;
  const direct = attr(el, localKey) ?? attr(el, `w:${localKey}`) ?? attr(el, `r:${localKey}`);
  if (direct !== undefined) return direct;
  for (const [k, v] of Object.entries(el.attributes)) {
    if (localName(k) === localKey) return v;
  }
  return undefined;
}

function readRelationships(files: Map<string, Uint8Array>, part: string): Relationship[] {
  const slash = part.lastIndexOf('/');
  const dir = slash === -1 ? '' : part.slice(0, slash);
  const file = slash === -1 ? part : part.slice(slash + 1);
  const relPath = `${dir}${dir ? '/' : ''}_rels/${file}.rels`;
  const xml = readXml(files, relPath);
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

function resolvePart(fromPart: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const stack = fromPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') stack.pop();
    else stack.push(segment);
  }
  return stack.join('/');
}

function readXml(files: Map<string, Uint8Array>, path: string): XmlElement | null {
  const bytes = fileBytes(files, path);
  if (!bytes) return null;
  return parseXml(new TextDecoder().decode(bytes));
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function recordDiagnostic(state: DocxState, diag: DocxDiagnostic): void {
  state.diagnostics.push(diag);
  warn(state.warnings, diag.message);
}

function warn(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}
