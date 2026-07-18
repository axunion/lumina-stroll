// Shared raw-pixel helpers for the asset pipeline scripts (docs/asset-pipeline.md).

import { fileURLToPath } from "node:url";
import sharp from "sharp";

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface AlphaBbox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Rgb = readonly [number, number, number];

// Alpha values at or below this count as transparent throughout the pipeline.
export const ALPHA_THRESHOLD = 8;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpColor(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Clamps t to [0,1], returns 3t^2 - 2t^3.
export function smoothstep01(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export const ASSETS_DIR = fileURLToPath(
  new URL("../public/assets/", import.meta.url),
);

// Decodes a PNG into straight (non-premultiplied) RGBA. ensureAlpha() matters:
// an opaque PNG would otherwise decode as 3-channel RGB. Accepts a path or an
// existing sharp instance, so callers that also need e.g. .metadata() can
// share one decode instead of reopening the file.
export async function readRaw(
  input: string | ReturnType<typeof sharp>,
): Promise<RawImage> {
  const image = typeof input === "string" ? sharp(input) : input;
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Bounding box of pixels with alpha above the threshold, or null if fully transparent.
export function alphaBbox(
  raw: RawImage,
  threshold: number = ALPHA_THRESHOLD,
): AlphaBbox | null {
  let left = raw.width;
  let top = raw.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      const alpha = raw.data[(y * raw.width + x) * 4 + 3];
      if (alpha > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
