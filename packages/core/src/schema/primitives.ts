import { z } from 'zod';
import { ID_PATTERN } from '../ids';

export const IdSchema = z.string().regex(ID_PATTERN);
export const InlineTextSchema = z.string();
export const GapSchema = z.enum(['none', 'sm', 'md', 'lg']);

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const HSL_COLOR = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/i;

function channelInRange(value: string | undefined, max: number): boolean {
  if (value === undefined) return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max;
}

/** `#rgb`, `#rrggbb`, `rgb(r, g, b)`, or `hsl(h, s%, l%)`, case-insensitive, spaces allowed. */
export function isCssColor(value: string): boolean {
  if (HEX_COLOR.test(value)) return true;
  const rgb = RGB_COLOR.exec(value);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].every((part) => channelInRange(part, 255));
  const hsl = HSL_COLOR.exec(value);
  if (!hsl) return false;
  return channelInRange(hsl[1], 360) && channelInRange(hsl[2], 100) && channelInRange(hsl[3], 100);
}

export const ColorSchema = z.string().refine(isCssColor, 'must be #rgb, #rrggbb, rgb(), or hsl()');

export const IMAGE_SRC_MESSAGE = 'src must start with https://, http:// or data:image/';

export function isImageSrc(value: string): boolean {
  return /^https:\/\//i.test(value) || /^http:\/\//i.test(value) || /^data:image\//i.test(value);
}

/** Crop anchor as percentages of the image box. `(0, 0)` is the top-left and `(100, 100)` is the bottom-right. */
export const FocalPointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export type FocalPoint = z.output<typeof FocalPointSchema>;
