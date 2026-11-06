import type {
  LoomaAsset,
  LoomaCard,
  LoomaDocument,
  LoomaScene,
  LoomaSceneElement,
  SceneFill,
  SceneImageElement,
  SceneParagraph,
  SceneShapeGeometry,
  SceneStroke,
  SceneTextElement,
  SceneTextRun,
} from '@lor-looma/core';
import type { CSSProperties, ReactNode } from 'react';
import { LOGICAL_SIZE } from '../constants';
import styles from './SceneView.module.css';

export interface RenderSceneElementInfo {
  cardId: string;
  index: number;
}

export type RenderSceneElement = (
  element: LoomaSceneElement,
  renderDefault: () => ReactNode,
  info: RenderSceneElementInfo,
) => ReactNode;

export function cardLogicalSize(
  card: LoomaCard | undefined,
  format: LoomaDocument['format'],
): { width: number; height: number | undefined } {
  if (card?.scene) {
    return {
      width: card.scene.width,
      height: card.scene.height,
    };
  }
  if (format === 'presentation') {
    return {
      width: LOGICAL_SIZE.presentation.width,
      height: LOGICAL_SIZE.presentation.height,
    };
  }
  return {
    width: LOGICAL_SIZE.document.width,
    height: undefined,
  };
}

export function geometryRadiusPx(
  geometry: SceneShapeGeometry | undefined,
  width: number,
  height: number,
): string | undefined {
  if (!geometry) return undefined;
  if (geometry.preset === 'ellipse') return '50%';
  if (geometry.preset === 'roundRect') {
    const ratio = geometry.cornerRadiusRatio ?? 1 / 6;
    const radius =
      Math.round(Math.min(width, height) * Math.max(0, Math.min(0.5, ratio)) * 100) / 100;
    return `${radius}px`;
  }
  return undefined;
}

export function colorWithOpacity(color: string, opacity: number | undefined): string {
  if (opacity === undefined || opacity >= 1) return color;
  const alpha = Math.max(0, Math.min(1, Math.round(opacity * 1000) / 1000));
  const raw = color.trim();
  const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw);
  if (hexMatch) {
    const hex = hexMatch[1]!;
    const full = hex.length === 3 ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : hex;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgbMatch = /^[rR][gG][bB]\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(raw);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  const hslMatch = /^[hH][sS][lL]\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/.exec(raw);
  if (hslMatch) {
    return `hsla(${hslMatch[1]?.trim()}, ${hslMatch[2]?.trim()}, ${hslMatch[3]?.trim()}, ${alpha})`;
  }
  return color;
}

export function fillStyles(fill: SceneFill | undefined): CSSProperties {
  if (!fill || fill.kind === 'none') return {};
  if (fill.kind === 'color') {
    return {
      backgroundColor: colorWithOpacity(fill.color, fill.opacity),
    };
  }
  const from = colorWithOpacity(fill.from, fill.opacity);
  const to = colorWithOpacity(fill.to, fill.opacity);
  return {
    backgroundImage: `linear-gradient(${fill.angle ?? 135}deg, ${from}, ${to})`,
  };
}

export function strokeStyles(stroke: SceneStroke | undefined): CSSProperties {
  if (!stroke || stroke.width <= 0) return {};
  const style = stroke.dash === 'dash' ? 'dashed' : stroke.dash === 'dot' ? 'dotted' : 'solid';
  const color = colorWithOpacity(stroke.color, stroke.opacity);
  return {
    border: `${stroke.width}px ${style} ${color}`,
  };
}

export function fontStackForScene(fontFamily: string | undefined): string {
  const fallback =
    "'Poppins', 'PingFang HK', 'PingFang TC', 'PingFang SC', 'Microsoft JhengHei', 'Noto Sans TC', 'Heiti TC', sans-serif";
  if (!fontFamily || fontFamily.trim().length === 0) return fallback;
  const clean = fontFamily.replace(/["']/g, '').trim();
  if (clean.toLowerCase() === 'poppins') return fallback;
  return `'${clean}', ${fallback}`;
}

export function runStyleForScene(run: SceneTextRun): CSSProperties {
  const decorations: string[] = [];
  if (run.underline) decorations.push('underline');
  if (run.strike) decorations.push('line-through');

  return {
    fontFamily: fontStackForScene(run.fontFamily),
    ...(run.fontSize !== undefined ? { fontSize: `${run.fontSize}px` } : null),
    ...(run.color ? { color: colorWithOpacity(run.color, run.opacity) } : null),
    fontWeight: run.bold ? 700 : 400,
    fontStyle: run.italic ? 'italic' : 'normal',
    ...(decorations.length > 0 ? { textDecoration: decorations.join(' ') } : null),
    ...(run.letterSpacing !== undefined ? { letterSpacing: `${run.letterSpacing}px` } : null),
    ...(run.baseline === 'super'
      ? { verticalAlign: 'super', fontSize: `${Math.round((run.fontSize ?? 16) * 0.65)}px` }
      : run.baseline === 'sub'
        ? { verticalAlign: 'sub', fontSize: `${Math.round((run.fontSize ?? 16) * 0.65)}px` }
        : null),
  };
}

export function paragraphStyleForScene(paragraph: SceneParagraph): CSSProperties {
  const lineHeight =
    paragraph.lineSpacing?.kind === 'multiple'
      ? String(paragraph.lineSpacing.value)
      : paragraph.lineSpacing?.kind === 'exact'
        ? `${paragraph.lineSpacing.px}px`
        : '1.2';

  return {
    textAlign: paragraph.align ?? 'left',
    lineHeight,
    ...(paragraph.spaceBefore ? { marginTop: `${paragraph.spaceBefore}px` } : null),
    ...(paragraph.spaceAfter ? { marginBottom: `${paragraph.spaceAfter}px` } : null),
    ...(paragraph.marginLeft ? { paddingLeft: `${paragraph.marginLeft}px` } : null),
    ...(paragraph.indent ? { textIndent: `${paragraph.indent}px` } : null),
  };
}

export function textContainerStyleForScene(element: SceneTextElement): CSSProperties {
  const radius = geometryRadiusPx(element.geometry, element.box.width, element.box.height);
  const justify =
    element.verticalAlign === 'middle'
      ? 'center'
      : element.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'flex-start';
  const padding = element.padding
    ? `${element.padding.top}px ${element.padding.right}px ${element.padding.bottom}px ${element.padding.left}px`
    : '0px';

  return {
    ...fillStyles(element.fill),
    ...strokeStyles(element.stroke),
    ...(radius ? { borderRadius: radius } : null),
    justifyContent: justify,
    padding,
    whiteSpace: element.wordWrap === false ? 'pre' : 'pre-wrap',
    wordBreak: element.wordWrap === false ? 'normal' : 'break-word',
  };
}

function renderImageElement(
  element: SceneImageElement,
  src: string | undefined,
  alt: string,
): ReactNode {
  const radius = geometryRadiusPx(element.geometry, element.box.width, element.box.height);
  const crop = element.crop;
  const hasCrop =
    crop !== undefined &&
    (crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0) &&
    crop.left + crop.right < 1 &&
    crop.top + crop.bottom < 1;

  let imgStyle: CSSProperties | undefined;
  if (hasCrop && crop) {
    const scaleX = 1 / (1 - crop.left - crop.right);
    const scaleY = 1 / (1 - crop.top - crop.bottom);
    imgStyle = {
      position: 'absolute',
      width: `${Math.round(scaleX * 10000) / 100}%`,
      height: `${Math.round(scaleY * 10000) / 100}%`,
      left: `${Math.round(-crop.left * scaleX * 10000) / 100}%`,
      top: `${Math.round(-crop.top * scaleY * 10000) / 100}%`,
    };
  }

  return (
    <div
      className={styles.imageFrame}
      style={{
        ...(radius ? { borderRadius: radius } : null),
        ...strokeStyles(element.stroke),
      }}
    >
      {src ? (
        <img
          className={styles.image}
          src={src}
          alt={element.alt ?? alt}
          style={imgStyle}
          draggable={false}
        />
      ) : null}
    </div>
  );
}

function renderTextElement(element: SceneTextElement): ReactNode {
  return (
    <div className={styles.text} style={textContainerStyleForScene(element)}>
      {element.paragraphs.map((paragraph, pIndex) => (
        <div
          key={pIndex}
          data-lm-scene-paragraph={pIndex}
          className={styles.paragraph}
          style={paragraphStyleForScene(paragraph)}
        >
          {paragraph.bullet?.kind === 'char' ? (
            <span
              className={styles.bullet}
              style={{
                ...(paragraph.bullet.color ? { color: paragraph.bullet.color } : null),
                ...(paragraph.bullet.fontFamily
                  ? { fontFamily: fontStackForScene(paragraph.bullet.fontFamily) }
                  : null),
              }}
            >
              {paragraph.bullet.char}
            </span>
          ) : paragraph.bullet?.kind === 'number' ? (
            <span className={styles.bullet}>{(paragraph.bullet.startAt ?? 1) + pIndex}.</span>
          ) : null}
          {paragraph.runs.map((run, rIndex) => {
            const content = (
              <span
                key={rIndex}
                data-lm-scene-run={`${pIndex}:${rIndex}`}
                style={runStyleForScene(run)}
              >
                {run.text}
              </span>
            );
            return run.href ? (
              <a
                key={rIndex}
                href={run.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {content}
              </a>
            ) : (
              content
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SceneView({
  cardId,
  scene,
  assets,
  resolveAsset,
  renderSceneElement,
}: {
  cardId: string;
  scene: LoomaScene;
  assets: LoomaDocument['assets'];
  resolveAsset?: (asset: LoomaAsset, id: string) => string;
  renderSceneElement?: RenderSceneElement;
}) {
  const ordered = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      data-lm-scene=""
      data-lm-card-content=""
      className={styles.scene}
      style={{ width: `${scene.width}px`, height: `${scene.height}px` }}
    >
      {ordered.map((element, index) => {
        const boxStyle: CSSProperties = {
          left: `${element.box.x}px`,
          top: `${element.box.y}px`,
          width: `${element.box.width}px`,
          height: `${element.box.height}px`,
          zIndex: element.zIndex,
          ...(element.box.rotation ? { transform: `rotate(${element.box.rotation}deg)` } : null),
        };

        const renderDefault = () => {
          if (element.type === 'shape') {
            if (element.geometry.preset === 'line') {
              const sw = element.stroke?.width ?? 1;
              const strokeColor = element.stroke
                ? colorWithOpacity(element.stroke.color, element.stroke.opacity)
                : element.fill?.kind === 'color'
                  ? colorWithOpacity(element.fill.color, element.fill.opacity)
                  : '#000000';
              const dashArray =
                element.stroke?.dash === 'dash'
                  ? `${sw * 4} ${sw * 2}`
                  : element.stroke?.dash === 'dot'
                    ? `${sw} ${sw * 2}`
                    : undefined;
              const isHoriz = element.box.height <= Math.max(2, sw * 1.5);
              const isVert = element.box.width <= Math.max(2, sw * 1.5);
              const x1 = element.geometry.flipH ? element.box.width : 0;
              const x2 = element.geometry.flipH ? 0 : element.box.width;
              const y1 = isHoriz
                ? element.box.height / 2
                : element.geometry.flipV
                  ? element.box.height
                  : 0;
              const y2 = isHoriz
                ? element.box.height / 2
                : element.geometry.flipV
                  ? 0
                  : element.box.height;
              return (
                <svg
                  data-lm-scene-element={element.id}
                  data-lm-scene-type="shape"
                  data-lm-scene-preset="line"
                  className={styles.element}
                  width={element.box.width}
                  height={element.box.height}
                  viewBox={`0 0 ${element.box.width} ${element.box.height}`}
                  style={{
                    ...boxStyle,
                    overflow: 'visible',
                    pointerEvents: 'none',
                  }}
                >
                  <line
                    x1={isVert ? element.box.width / 2 : x1}
                    y1={y1}
                    x2={isVert ? element.box.width / 2 : x2}
                    y2={y2}
                    stroke={strokeColor}
                    strokeWidth={sw}
                    strokeDasharray={dashArray}
                    strokeLinecap="round"
                  />
                </svg>
              );
            }
            const radius = geometryRadiusPx(
              element.geometry,
              element.box.width,
              element.box.height,
            );
            return (
              <div
                data-lm-scene-element={element.id}
                data-lm-scene-type="shape"
                className={styles.element}
                style={{
                  ...boxStyle,
                  ...fillStyles(element.fill),
                  ...strokeStyles(element.stroke),
                  ...(radius ? { borderRadius: radius } : null),
                  pointerEvents: 'none',
                }}
              />
            );
          }

          if (element.type === 'image') {
            const asset = assets[element.assetId];
            const src = asset ? (resolveAsset?.(asset, element.assetId) ?? asset.src) : undefined;
            return (
              <div
                data-lm-scene-element={element.id}
                data-lm-scene-type="image"
                className={styles.element}
                style={boxStyle}
              >
                {renderImageElement(element, src, asset?.alt ?? '')}
              </div>
            );
          }

          return (
            <div
              data-lm-scene-element={element.id}
              data-lm-scene-type="text"
              className={styles.element}
              style={boxStyle}
            >
              {renderTextElement(element)}
            </div>
          );
        };

        return (
          <div key={element.id} style={{ display: 'contents' }}>
            {renderSceneElement
              ? renderSceneElement(element, renderDefault, { cardId, index })
              : renderDefault()}
          </div>
        );
      })}
    </div>
  );
}
