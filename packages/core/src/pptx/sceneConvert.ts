import type { IdKind } from '../ids';
import { isSafeHref } from '../inline';
import type { CardBackground, LoomaCard } from '../schema/card';
import type {
  LoomaScene,
  LoomaSceneElement,
  SceneBox,
  SceneBullet,
  SceneCropRect,
  SceneFill,
  SceneImageElement,
  SceneLineSpacing,
  SceneParagraph,
  SceneShapeElement,
  SceneShapeGeometry,
  SceneStroke,
  SceneTextElement,
  SceneTextPadding,
  SceneTextRun,
} from '../schema/scene';
import { attr, child, children, descendants, localName, textContent } from './xml';
import type { XmlElement } from './xml';

/** 1 inch = 914400 EMU = 96 CSS px -> 1 px = 9525 EMU. */
export const EMU_PER_PX = 9525;

export interface PptxDiagnostic {
  slideIndex: number;
  elementName?: string;
  kind:
    | 'unsupported-graphic'
    | 'unsupported-media'
    | 'unsupported-geometry'
    | 'missing-relationship'
    | 'custom-geometry-fallback'
    | 'effect-ignored';
  message: string;
  fallback?: string;
}

export interface SceneSlideInput {
  index: number;
  slide: { x: number; y: number; cx: number; cy: number };
  themeColors: Map<string, string>;
  themeFonts: { major?: string; minor?: string };
  rels: { id: string; type: string; target: string; external: boolean }[];
  ids: (kind: IdKind) => string;
  warnings: string[];
  diagnostics: PptxDiagnostic[];
  resolveAssetForRel: (rel: {
    id: string;
    type: string;
    target: string;
    external: boolean;
  }) => Promise<string | null>;
  inheritedBackground?: CardBackground;
  notes?: string;
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

export function readThemeFonts(
  files: Map<string, Uint8Array>,
  readXmlFn: (files: Map<string, Uint8Array>, path: string) => XmlElement | null | undefined,
): { major?: string; minor?: string } {
  const paths = [...files.keys()]
    .filter((path) => /^ppt\/theme\/theme\d+\.xml$/i.test(path))
    .sort();
  for (const path of paths) {
    const xml = readXmlFn(files, path);
    const fontScheme = xml ? descendants(xml, 'fontScheme')[0] : undefined;
    if (!fontScheme) continue;
    const major = child(fontScheme, 'majorFont');
    const minor = child(fontScheme, 'minorFont');
    const majorLatin = major ? attr(child(major, 'latin') ?? major, 'typeface') : undefined;
    const minorLatin = minor ? attr(child(minor, 'latin') ?? minor, 'typeface') : undefined;
    return { major: majorLatin, minor: minorLatin };
  }
  return {};
}

export async function convertSlideToScene(
  ctx: SceneSlideInput,
  xml: XmlElement,
): Promise<LoomaCard> {
  const width = Math.max(64, Math.round(ctx.slide.cx / EMU_PER_PX));
  const height = Math.max(64, Math.round(ctx.slide.cy / EMU_PER_PX));

  const elements: LoomaSceneElement[] = [];
  const surface = child(xml, 'cSld') ?? xml;
  const tree = child(surface, 'spTree');

  if (tree) {
    const rootTransform = groupTransform(tree, {
      offX: 0,
      offY: 0,
      extX: ctx.slide.cx,
      extY: ctx.slide.cy,
      chOffX: 0,
      chOffY: 0,
      chExtX: ctx.slide.cx,
      chExtY: ctx.slide.cy,
    });
    await walkSceneTree(ctx, tree, rootTransform, elements);
  }

  let background = ctx.inheritedBackground;
  const first = elements[0];
  if (
    !background &&
    first?.type === 'shape' &&
    first.fill?.kind === 'color' &&
    Math.abs(first.box.x) <= 2 &&
    Math.abs(first.box.y) <= 2 &&
    Math.abs(first.box.width - width) <= 4 &&
    Math.abs(first.box.height - height) <= 4
  ) {
    background = { kind: 'color', value: first.fill.color };
  }

  const scene: LoomaScene = {
    width,
    height,
    elements,
  };

  const card: LoomaCard = {
    id: ctx.ids('card'),
    layout: 'scene',
    scene,
    body: [],
  };
  if (background) card.background = background;
  if (ctx.notes) card.notes = ctx.notes;
  return card;
}

async function walkSceneTree(
  ctx: SceneSlideInput,
  container: XmlElement,
  parent: Transform,
  elements: LoomaSceneElement[],
): Promise<void> {
  for (const node of container.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);
    if (tag === 'sp' || tag === 'cxnSp') {
      const converted = convertShapeOrText(ctx, node, parent, elements.length);
      if (converted) elements.push(converted);
      continue;
    }
    if (tag === 'pic') {
      const converted = await convertScenePicture(ctx, node, parent, elements.length);
      if (converted) elements.push(converted);
      continue;
    }
    if (tag === 'graphicFrame') {
      const name = elementNameOf(node);
      recordDiagnostic(ctx, {
        slideIndex: ctx.index,
        elementName: name,
        kind: 'unsupported-graphic',
        message: `Skipped unsupported graphicFrame${name ? ` "${name}"` : ''} on slide ${ctx.index + 1}.`,
      });
      continue;
    }
    if (tag === 'grpSp') {
      await walkSceneTree(ctx, node, groupTransform(node, parent), elements);
    }
  }
}

function convertShapeOrText(
  ctx: SceneSlideInput,
  shape: XmlElement,
  parent: Transform,
  zIndex: number,
): SceneShapeElement | SceneTextElement | null {
  const spPr = child(shape, 'spPr');
  const xfrm = shapeTransform(shape);
  const name = elementNameOf(shape);
  const geometry = readGeometry(ctx, spPr, name, xfrm);
  const fill = readSceneFill(spPr, ctx.themeColors);
  const stroke = readSceneStroke(spPr, ctx.themeColors);
  const isLine = geometry?.preset === 'line' || localName(shape.name) === 'cxnSp';
  const box = readLogicalBox(xfrm, parent, isLine, stroke?.width ?? 1);
  if (!box) return null;

  const txBody = child(shape, 'txBody');
  const paragraphs = txBody ? children(txBody, 'p').map((p) => readSceneParagraph(ctx, p)) : [];
  const hasVisibleText = paragraphs.some((p) => p.runs.some((r) => r.text.length > 0));

  if (hasVisibleText) {
    const bodyPr = txBody ? child(txBody, 'bodyPr') : undefined;
    const padding = readTextPadding(bodyPr);
    const verticalAlign = readVerticalAlign(bodyPr);
    const wordWrap = readWordWrap(bodyPr);

    const textEl: SceneTextElement = {
      id: ctx.ids('element'),
      type: 'text',
      box,
      zIndex,
      paragraphs,
    };
    if (padding) textEl.padding = padding;
    if (verticalAlign) textEl.verticalAlign = verticalAlign;
    if (wordWrap !== undefined) textEl.wordWrap = wordWrap;
    if (geometry) textEl.geometry = geometry;
    if (fill && fill.kind !== 'none') textEl.fill = fill;
    if (stroke) textEl.stroke = stroke;
    return textEl;
  }

  // Empty-text shape: preserve if it has visible fill or stroke
  if ((!fill || fill.kind === 'none') && !stroke) {
    return null;
  }

  const shapeEl: SceneShapeElement = {
    id: ctx.ids('element'),
    type: 'shape',
    box,
    zIndex,
    geometry: geometry ?? { preset: 'rect' },
  };
  if (fill && fill.kind !== 'none') shapeEl.fill = fill;
  if (stroke) shapeEl.stroke = stroke;
  return shapeEl;
}

async function convertScenePicture(
  ctx: SceneSlideInput,
  picture: XmlElement,
  parent: Transform,
  zIndex: number,
): Promise<SceneImageElement | null> {
  const name = elementNameOf(picture);
  if (
    descendants(picture, 'videoFile').length > 0 ||
    descendants(picture, 'audioFile').length > 0
  ) {
    recordDiagnostic(ctx, {
      slideIndex: ctx.index,
      elementName: name,
      kind: 'unsupported-media',
      message: `Skipped video or audio${name ? ` "${name}"` : ''} on slide ${ctx.index + 1}.`,
    });
    return null;
  }

  const box = readLogicalBox(shapeTransform(picture), parent, false, 1);
  if (!box) return null;

  const relId = pictureRelId(picture);
  if (!relId) return null;
  const rel = ctx.rels.find((item) => item.id === relId);
  if (!rel) {
    recordDiagnostic(ctx, {
      slideIndex: ctx.index,
      elementName: name,
      kind: 'missing-relationship',
      message: `Missing relationship "${relId}" on slide ${ctx.index + 1}.`,
    });
    return null;
  }

  const assetId = await ctx.resolveAssetForRel(rel);
  if (!assetId) return null;

  const spPr = child(picture, 'spPr');
  const geometry = readGeometry(ctx, spPr, name, shapeTransform(picture));
  const stroke = readSceneStroke(spPr, ctx.themeColors);
  const crop = readCropRect(picture);
  const cNvPr = descendants(picture, 'cNvPr')[0];
  const descr = cNvPr ? attr(cNvPr, 'descr') : undefined;

  const imageEl: SceneImageElement = {
    id: ctx.ids('element'),
    type: 'image',
    box,
    zIndex,
    assetId,
  };
  if (crop) imageEl.crop = crop;
  if (geometry) imageEl.geometry = geometry;
  if (stroke) imageEl.stroke = stroke;
  if (descr) imageEl.alt = descr.slice(0, 1000);
  return imageEl;
}

function pictureRelId(picture: XmlElement): string | undefined {
  const blip = descendants(picture, 'blip')[0];
  const svg = descendants(picture, 'svgBlip')[0];
  if (svg) {
    const svgEmbed = attr(svg, 'embed');
    if (svgEmbed) return svgEmbed;
  }
  const embed = blip ? attr(blip, 'embed') : undefined;
  return embed;
}

function readCropRect(picture: XmlElement): SceneCropRect | undefined {
  const blipFill = child(picture, 'blipFill');
  const srcRect = blipFill ? child(blipFill, 'srcRect') : undefined;
  if (!srcRect) return undefined;
  const left = clampCrop(Number(attr(srcRect, 'l') ?? '0') / 100_000);
  const top = clampCrop(Number(attr(srcRect, 't') ?? '0') / 100_000);
  const right = clampCrop(Number(attr(srcRect, 'r') ?? '0') / 100_000);
  const bottom = clampCrop(Number(attr(srcRect, 'b') ?? '0') / 100_000);
  if (left === 0 && top === 0 && right === 0 && bottom === 0) return undefined;
  if (left + right >= 0.99 || top + bottom >= 0.99) return undefined;
  return { left, top, right, bottom };
}

function clampCrop(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(0.95, Math.round(value * 100_000) / 100_000);
}

function readGeometry(
  ctx: SceneSlideInput,
  spPr: XmlElement | undefined,
  elementName: string | undefined,
  xfrm?: XmlElement,
): SceneShapeGeometry | undefined {
  if (!spPr) return undefined;
  const flipH = xfrm && boolAttr(xfrm, 'flipH') ? true : undefined;
  const flipV = xfrm && boolAttr(xfrm, 'flipV') ? true : undefined;
  const withFlips = (base: SceneShapeGeometry): SceneShapeGeometry => ({
    ...base,
    ...(flipH ? { flipH: true } : null),
    ...(flipV ? { flipV: true } : null),
  });
  if (child(spPr, 'custGeom')) {
    recordDiagnostic(ctx, {
      slideIndex: ctx.index,
      elementName,
      kind: 'custom-geometry-fallback',
      message: `Custom geometry${elementName ? ` on "${elementName}"` : ''} on slide ${ctx.index + 1} was approximated as a rectangle.`,
      fallback: 'rect',
    });
    return withFlips({ preset: 'rect' });
  }
  const prstGeom = child(spPr, 'prstGeom');
  const prst = prstGeom ? attr(prstGeom, 'prst') : undefined;
  if (!prst || prst === 'rect') return withFlips({ preset: 'rect' });
  if (prst === 'ellipse') return withFlips({ preset: 'ellipse' });
  if (prst === 'line' || prst === 'straightConnector1') return withFlips({ preset: 'line' });
  if (prst === 'roundRect') {
    const ratio = readRoundRectAdj(prstGeom);
    return withFlips(
      ratio !== undefined
        ? { preset: 'roundRect', cornerRadiusRatio: ratio }
        : { preset: 'roundRect' },
    );
  }
  recordDiagnostic(ctx, {
    slideIndex: ctx.index,
    elementName,
    kind: 'unsupported-geometry',
    message: `Unsupported preset geometry "${prst}"${elementName ? ` on "${elementName}"` : ''} on slide ${ctx.index + 1} was approximated as a rectangle.`,
    fallback: 'rect',
  });
  return withFlips({ preset: 'rect' });
}

function readRoundRectAdj(prstGeom: XmlElement | undefined): number | undefined {
  if (!prstGeom) return undefined;
  const avLst = child(prstGeom, 'avLst');
  if (!avLst) return undefined;
  for (const gd of children(avLst, 'gd')) {
    if (attr(gd, 'name') !== 'adj') continue;
    const fmla = attr(gd, 'fmla') ?? '';
    const match = /val\s+(-?\d+)/.exec(fmla);
    if (!match) continue;
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;
    return Math.max(0, Math.min(0.5, Math.round((raw / 100_000) * 100_000) / 100_000));
  }
  return undefined;
}

function readSceneFill(
  spPr: XmlElement | undefined,
  themeColors: Map<string, string>,
): SceneFill | undefined {
  if (!spPr) return undefined;
  if (child(spPr, 'noFill')) return { kind: 'none' };
  const solid = child(spPr, 'solidFill');
  if (solid) {
    const parsed = readColorAndAlpha(solid, themeColors);
    if (!parsed) return undefined;
    return parsed.opacity !== undefined && parsed.opacity < 1
      ? { kind: 'color', color: parsed.color, opacity: parsed.opacity }
      : { kind: 'color', color: parsed.color };
  }
  const grad = child(spPr, 'gradFill');
  if (grad) {
    const stops = descendants(grad, 'gs')
      .map((stop) => readColorAndAlpha(stop, themeColors))
      .filter((item): item is { color: string; opacity?: number } => Boolean(item));
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (first && last) {
      const linear = child(grad, 'lin');
      const rawAng = Number(linear ? attr(linear, 'ang') : undefined);
      const angle = Number.isFinite(rawAng)
        ? Math.round((((((rawAng / 60_000) % 360) + 360) % 360) + 90) % 360)
        : 135;
      return {
        kind: 'gradient',
        from: first.color,
        to: last.color,
        angle,
      };
    }
  }
  return undefined;
}

function readSceneStroke(
  spPr: XmlElement | undefined,
  themeColors: Map<string, string>,
): SceneStroke | undefined {
  if (!spPr) return undefined;
  const ln = child(spPr, 'ln');
  if (!ln || child(ln, 'noFill')) return undefined;
  const solid = child(ln, 'solidFill');
  const parsed = readColorAndAlpha(solid, themeColors);
  if (!parsed) return undefined;
  const wEmu = Number(attr(ln, 'w') ?? '12700');
  const width = Math.max(0.5, Math.round((wEmu / EMU_PER_PX) * 100) / 100);
  const prstDash = child(ln, 'prstDash');
  const dashVal = prstDash ? attr(prstDash, 'val') : undefined;
  const dash: 'solid' | 'dash' | 'dot' | undefined =
    dashVal === 'dash' || dashVal === 'lgDash'
      ? 'dash'
      : dashVal === 'dot' || dashVal === 'sysDot'
        ? 'dot'
        : undefined;
  const stroke: SceneStroke = { color: parsed.color, width };
  if (parsed.opacity !== undefined && parsed.opacity < 1) stroke.opacity = parsed.opacity;
  if (dash) stroke.dash = dash;
  return stroke;
}

function readColorAndAlpha(
  container: XmlElement | undefined,
  themeColors: Map<string, string>,
): { color: string; opacity?: number } | undefined {
  if (!container) return undefined;
  const srgb = child(container, 'srgbClr');
  if (srgb) {
    const color = cssHex(attr(srgb, 'val'));
    if (!color) return undefined;
    const opacity = readAlphaAttr(srgb);
    return opacity !== undefined ? { color, opacity } : { color };
  }
  const scheme = child(container, 'schemeClr');
  if (scheme) {
    const name = attr(scheme, 'val');
    const color = name ? themeColors.get(name) : undefined;
    if (!color) return undefined;
    const opacity = readAlphaAttr(scheme);
    return opacity !== undefined ? { color, opacity } : { color };
  }
  return undefined;
}

function readAlphaAttr(colorNode: XmlElement): number | undefined {
  const alphaNode = child(colorNode, 'alpha');
  if (!alphaNode) return undefined;
  const raw = Number(attr(alphaNode, 'val'));
  if (!Number.isFinite(raw)) return undefined;
  const ratio = Math.max(0, Math.min(1, Math.round((raw / 100_000) * 1000) / 1000));
  return ratio < 1 ? ratio : undefined;
}

function readTextPadding(bodyPr: XmlElement | undefined): SceneTextPadding {
  const toPx = (raw: string | undefined, fallbackEmu: number) => {
    const num = raw !== undefined ? Number(raw) : fallbackEmu;
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.round((num / EMU_PER_PX) * 100) / 100;
  };
  return {
    left: toPx(bodyPr ? attr(bodyPr, 'lIns') : undefined, 91_440),
    top: toPx(bodyPr ? attr(bodyPr, 'tIns') : undefined, 45_720),
    right: toPx(bodyPr ? attr(bodyPr, 'rIns') : undefined, 91_440),
    bottom: toPx(bodyPr ? attr(bodyPr, 'bIns') : undefined, 45_720),
  };
}

function readVerticalAlign(
  bodyPr: XmlElement | undefined,
): 'top' | 'middle' | 'bottom' | undefined {
  if (!bodyPr) return undefined;
  const anchor = attr(bodyPr, 'anchor');
  if (anchor === 'ctr') return 'middle';
  if (anchor === 'b') return 'bottom';
  if (anchor === 't') return 'top';
  return undefined;
}

function readWordWrap(bodyPr: XmlElement | undefined): boolean | undefined {
  if (!bodyPr) return undefined;
  const wrap = attr(bodyPr, 'wrap');
  if (wrap === 'none') return false;
  if (wrap) return true;
  return undefined;
}

function readSceneParagraph(ctx: SceneSlideInput, paragraph: XmlElement): SceneParagraph {
  const pPr = child(paragraph, 'pPr');
  const defRPr = pPr ? child(pPr, 'defRPr') : undefined;
  const align = readSceneAlign(pPr);
  const lineSpacing = readSceneLineSpacing(pPr);
  const spaceBefore = readSpacingPx(pPr ? child(pPr, 'spcBef') : undefined);
  const spaceAfter = readSpacingPx(pPr ? child(pPr, 'spcAft') : undefined);
  const marginLeft = readPositiveAttrPx(pPr, 'marL');
  const indent = readSignedAttrPx(pPr, 'indent');
  const bullet = readSceneBullet(pPr, ctx.themeColors);

  const runs: SceneTextRun[] = [];
  for (const node of paragraph.children) {
    if (typeof node === 'string') continue;
    const tag = localName(node.name);
    if (tag === 'br') {
      runs.push({ text: '\n' });
    } else if (tag === 'r' || tag === 'fld') {
      const run = readSceneRun(ctx, node, defRPr);
      if (run) runs.push(run);
    }
  }

  const out: SceneParagraph = { runs };
  if (align) out.align = align;
  if (lineSpacing) out.lineSpacing = lineSpacing;
  if (spaceBefore !== undefined) out.spaceBefore = spaceBefore;
  if (spaceAfter !== undefined) out.spaceAfter = spaceAfter;
  if (marginLeft !== undefined) out.marginLeft = marginLeft;
  if (indent !== undefined) out.indent = indent;
  if (bullet) out.bullet = bullet;
  return out;
}

function resolveTriStateBool(
  primary: XmlElement | undefined,
  fallback: XmlElement | undefined,
  name: string,
): boolean {
  const raw =
    (primary ? attr(primary, name) : undefined) ?? (fallback ? attr(fallback, name) : undefined);
  if (raw === undefined) return false;
  return raw === '1' || raw === 'true';
}

function readSceneRun(
  ctx: SceneSlideInput,
  runNode: XmlElement,
  defRPr: XmlElement | undefined,
): SceneTextRun | null {
  const text = children(runNode, 't')
    .map((node) => textContent(node))
    .join('');
  if (text.length === 0) return null;

  const rPr = child(runNode, 'rPr');
  const run: SceneTextRun = { text };
  if (!rPr && !defRPr) return run;

  const szRaw = (rPr ? attr(rPr, 'sz') : undefined) ?? (defRPr ? attr(defRPr, 'sz') : undefined);
  if (szRaw) {
    const hundredthsPt = Number(szRaw);
    if (Number.isFinite(hundredthsPt) && hundredthsPt > 0) {
      run.fontSize = Math.round((hundredthsPt / 100) * (96 / 72) * 100) / 100;
    }
  }

  const typeface = readRunTypeface(rPr, defRPr, ctx.themeFonts);
  if (typeface) run.fontFamily = typeface;

  const hasRunNoFill = rPr ? Boolean(child(rPr, 'noFill')) : false;
  const solid = hasRunNoFill
    ? undefined
    : ((rPr ? child(rPr, 'solidFill') : undefined) ??
      (defRPr ? child(defRPr, 'solidFill') : undefined));
  const colorInfo = readColorAndAlpha(solid, ctx.themeColors);
  if (colorInfo) {
    run.color = colorInfo.color;
    if (colorInfo.opacity !== undefined) run.opacity = colorInfo.opacity;
  }

  if (resolveTriStateBool(rPr, defRPr, 'b')) run.bold = true;
  if (resolveTriStateBool(rPr, defRPr, 'i')) run.italic = true;

  const u = (rPr ? attr(rPr, 'u') : undefined) ?? (defRPr ? attr(defRPr, 'u') : undefined);
  if (u && u !== 'none') run.underline = true;

  const strike =
    (rPr ? attr(rPr, 'strike') : undefined) ?? (defRPr ? attr(defRPr, 'strike') : undefined);
  if (strike && strike !== 'noStrike') run.strike = true;

  const baselineRaw =
    (rPr ? attr(rPr, 'baseline') : undefined) ?? (defRPr ? attr(defRPr, 'baseline') : undefined);
  if (baselineRaw !== undefined) {
    const baseline = Number(baselineRaw);
    if (Number.isFinite(baseline) && baseline > 0) run.baseline = 'super';
    else if (Number.isFinite(baseline) && baseline < 0) run.baseline = 'sub';
  }

  const spcRaw = (rPr ? attr(rPr, 'spc') : undefined) ?? (defRPr ? attr(defRPr, 'spc') : undefined);
  if (spcRaw !== undefined) {
    const spc = Number(spcRaw);
    if (Number.isFinite(spc) && spc !== 0) {
      run.letterSpacing = Math.round((spc / 100) * (96 / 72) * 100) / 100;
    }
  }

  const hlink =
    (rPr ? child(rPr, 'hlinkClick') : undefined) ??
    (defRPr ? child(defRPr, 'hlinkClick') : undefined);
  const relId = hlink ? attr(hlink, 'id') : undefined;
  if (relId) {
    const rel = ctx.rels.find((item) => item.id === relId);
    if (rel?.target && isSafeHref(rel.target)) {
      run.href = rel.target;
    }
  }

  return run;
}

function readRunTypeface(
  rPr: XmlElement | undefined,
  defRPr: XmlElement | undefined,
  themeFonts: { major?: string; minor?: string },
): string | undefined {
  for (const source of [rPr, defRPr]) {
    if (!source) continue;
    for (const tag of ['latin', 'ea', 'cs']) {
      const fontEl = child(source, tag);
      const tf = fontEl ? attr(fontEl, 'typeface') : undefined;
      if (!tf) continue;
      if (tf.startsWith('+mj')) return themeFonts.major ?? undefined;
      if (tf.startsWith('+mn')) return themeFonts.minor ?? undefined;
      return tf;
    }
  }
  return undefined;
}

function readSceneAlign(
  pPr: XmlElement | undefined,
): 'left' | 'center' | 'right' | 'justify' | undefined {
  if (!pPr) return undefined;
  const val = attr(pPr, 'algn');
  if (val === 'ctr' || val === 'center') return 'center';
  if (val === 'r' || val === 'right') return 'right';
  if (val === 'just' || val === 'justify') return 'justify';
  if (val === 'l' || val === 'left') return 'left';
  return undefined;
}

function readSceneLineSpacing(pPr: XmlElement | undefined): SceneLineSpacing | undefined {
  const lnSpc = pPr ? child(pPr, 'lnSpc') : undefined;
  if (!lnSpc) return undefined;
  const pct = child(lnSpc, 'spcPct');
  if (pct) {
    const val = Number(attr(pct, 'val'));
    if (Number.isFinite(val) && val > 0) {
      return { kind: 'multiple', value: Math.round((val / 100_000) * 1000) / 1000 };
    }
  }
  const pts = child(lnSpc, 'spcPts');
  if (pts) {
    const val = Number(attr(pts, 'val'));
    if (Number.isFinite(val) && val > 0) {
      return { kind: 'exact', px: Math.round((val / 100) * (96 / 72) * 100) / 100 };
    }
  }
  return undefined;
}

function readSpacingPx(spcNode: XmlElement | undefined): number | undefined {
  if (!spcNode) return undefined;
  const pts = child(spcNode, 'spcPts');
  if (pts) {
    const val = Number(attr(pts, 'val'));
    if (Number.isFinite(val) && val >= 0) {
      return Math.round((val / 100) * (96 / 72) * 100) / 100;
    }
  }
  return undefined;
}

function readPositiveAttrPx(el: XmlElement | undefined, name: string): number | undefined {
  if (!el) return undefined;
  const raw = attr(el, name);
  if (raw === undefined) return undefined;
  const val = Number(raw);
  if (!Number.isFinite(val) || val < 0) return undefined;
  return Math.round((val / EMU_PER_PX) * 100) / 100;
}

function readSignedAttrPx(el: XmlElement | undefined, name: string): number | undefined {
  if (!el) return undefined;
  const raw = attr(el, name);
  if (raw === undefined) return undefined;
  const val = Number(raw);
  if (!Number.isFinite(val)) return undefined;
  return Math.round((val / EMU_PER_PX) * 100) / 100;
}

function readSceneBullet(
  pPr: XmlElement | undefined,
  themeColors: Map<string, string>,
): SceneBullet | undefined {
  if (!pPr) return undefined;
  if (child(pPr, 'buNone')) return { kind: 'none' };
  const buChar = child(pPr, 'buChar');
  if (buChar) {
    const ch = attr(buChar, 'char') ?? '•';
    const buClr = child(pPr, 'buClr');
    const color = readColorAndAlpha(buClr, themeColors)?.color;
    const buFont = child(pPr, 'buFont');
    const fontFamily = buFont ? attr(buFont, 'typeface') : undefined;
    const bullet: Extract<SceneBullet, { kind: 'char' }> = { kind: 'char', char: ch };
    if (color) bullet.color = color;
    if (fontFamily) bullet.fontFamily = fontFamily;
    return bullet;
  }
  const buAutoNum = child(pPr, 'buAutoNum');
  if (buAutoNum) {
    const format = attr(buAutoNum, 'type');
    const startAt = Number(attr(buAutoNum, 'startAt'));
    const bullet: Extract<SceneBullet, { kind: 'number' }> = { kind: 'number' };
    if (format) bullet.format = format;
    if (Number.isInteger(startAt) && startAt >= 1) bullet.startAt = startAt;
    return bullet;
  }
  return undefined;
}

function readLogicalBox(
  xfrm: XmlElement | undefined,
  parent: Transform,
  isLine: boolean,
  strokeWidthPx: number,
): SceneBox | null {
  if (!xfrm) return null;
  const offset = child(xfrm, 'off');
  const extent = child(xfrm, 'ext');
  if (!offset || !extent) return null;

  const scaleX = parent.chExtX > 0 ? parent.extX / parent.chExtX : 1;
  const scaleY = parent.chExtY > 0 ? parent.extY / parent.chExtY : 1;

  const emuX = parent.offX + (numberAttr(offset, 'x') - parent.chOffX) * scaleX;
  const emuY = parent.offY + (numberAttr(offset, 'y') - parent.chOffY) * scaleY;
  const emuW = numberAttr(extent, 'cx') * scaleX;
  const emuH = numberAttr(extent, 'cy') * scaleY;

  let width = Math.round((emuW / EMU_PER_PX) * 100) / 100;
  let height = Math.round((emuH / EMU_PER_PX) * 100) / 100;

  if (isLine) {
    if (width <= 0 && height <= 0) return null;
    const minExtent = Math.max(1, Math.round(strokeWidthPx * 100) / 100);
    if (width <= 0) width = minExtent;
    if (height <= 0) height = minExtent;
  } else if (width <= 0 || height <= 0) {
    return null;
  }

  const x = Math.round((emuX / EMU_PER_PX) * 100) / 100;
  const y = Math.round((emuY / EMU_PER_PX) * 100) / 100;

  const rotRaw = Number(attr(xfrm, 'rot') ?? '0');
  const rotation =
    Number.isFinite(rotRaw) && rotRaw !== 0
      ? Math.round(((rotRaw / 60_000) % 360) * 100) / 100
      : undefined;

  const box: SceneBox = { x, y, width, height };
  if (rotation !== undefined && rotation !== 0) box.rotation = rotation;
  return box;
}

function groupTransform(group: XmlElement, parent: Transform): Transform {
  const xfrm = shapeTransform(group);
  const offset = xfrm ? child(xfrm, 'off') : undefined;
  const extent = xfrm ? child(xfrm, 'ext') : undefined;
  const scaleX = parent.chExtX > 0 ? parent.extX / parent.chExtX : 1;
  const scaleY = parent.chExtY > 0 ? parent.extY / parent.chExtY : 1;
  const boxX = parent.offX + (numberAttr(offset, 'x') - parent.chOffX) * scaleX;
  const boxY = parent.offY + (numberAttr(offset, 'y') - parent.chOffY) * scaleY;
  const boxW = numberAttr(extent, 'cx') * scaleX;
  const boxH = numberAttr(extent, 'cy') * scaleY;

  const childOffset = xfrm ? child(xfrm, 'chOff') : undefined;
  const childExtent = xfrm ? child(xfrm, 'chExt') : undefined;
  const chExtX = positive(childExtent ? attr(childExtent, 'cx') : undefined);
  const chExtY = positive(childExtent ? attr(childExtent, 'cy') : undefined);

  return {
    offX: boxX,
    offY: boxY,
    extX: boxW > 0 ? boxW : parent.extX,
    extY: boxH > 0 ? boxH : parent.extY,
    chOffX: numberAttr(childOffset, 'x'),
    chOffY: numberAttr(childOffset, 'y'),
    chExtX: chExtX ?? (boxW > 0 ? boxW : parent.chExtX),
    chExtY: chExtY ?? (boxH > 0 ? boxH : parent.chExtY),
  };
}

function shapeTransform(shape: XmlElement): XmlElement | undefined {
  const props = child(shape, 'spPr') ?? child(shape, 'grpSpPr');
  return (props ? child(props, 'xfrm') : undefined) ?? child(shape, 'xfrm');
}

function elementNameOf(node: XmlElement): string | undefined {
  const cNvPr = descendants(node, 'cNvPr')[0];
  const name = cNvPr ? attr(cNvPr, 'name')?.trim() : undefined;
  return name || undefined;
}

function recordDiagnostic(ctx: SceneSlideInput, diag: PptxDiagnostic): void {
  ctx.diagnostics.push(diag);
  if (!ctx.warnings.includes(diag.message)) {
    ctx.warnings.push(diag.message);
  }
}

function numberAttr(element: XmlElement | undefined, name: string): number {
  const raw = Number(element ? attr(element, name) : undefined);
  return Number.isFinite(raw) ? raw : 0;
}

function positive(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function boolAttr(element: XmlElement | undefined, name: string): boolean {
  const value = element ? attr(element, name) : undefined;
  return value === '1' || value === 'true';
}

function cssHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return `#${hex.toLowerCase()}`;
}
