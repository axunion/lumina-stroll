// CLI: mechanized QA for sprite PNGs in public/assets/ (spec/asset-guide.md §6
// steps 1–3 plus the tile seam check; steps 4–5 remain visual). Exits 1 on any
// FAIL. Usage: node scripts/check-assets.ts [spriteKey ...]

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { SPRITE_DEFS, type SpriteDef } from "../src/assets.ts";
import {
  ALPHA_THRESHOLD,
  type AlphaBbox,
  ASSETS_DIR,
  alphaBbox,
  type RawImage,
  readRaw,
} from "./pixels.ts";
import { PALETTES } from "./tile-texture.ts";

const SEAM_MAX_RATIO = 3; // wrap-edge diff may be at most 3× the interior diff
const LUMINANCE_BAND = 0.1; // tiles: mean within base −10% .. accent +10%
const LUMINANCE_MAX_FACTOR = 3; // tiles: no pixel brighter than 3× the accent
const BASELINE_MAX_GAP = 4; // bottomCenter: base within 4px of the bottom edge
const CENTER_TOLERANCE = 2; // bottomCenter: bbox center within ±2px of mid
const PAIR_MIN_IOU = 0.95; // brazier silhouettes must overlap almost exactly
const FRINGE_WARN_RATIO = 0.2; // soft-alpha fringe above this hints a baked glow

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Ratio of the wrap-edge RGB difference to the interior-adjacent difference.
// ≈1 for a seamless texture; hard seams score far higher. Self-calibrating, so
// it works for any texture contrast.
export function seamScore(raw: RawImage): number {
  const { data, width, height } = raw;
  const diff = (ao: number, bo: number): number =>
    Math.abs(data[ao] - data[bo]) +
    Math.abs(data[ao + 1] - data[bo + 1]) +
    Math.abs(data[ao + 2] - data[bo + 2]);
  let wrapSum = 0;
  let wrapCount = 0;
  let interiorSum = 0;
  let interiorCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const right = (y * width + ((x + 1) % width)) * 4;
      const below = (((y + 1) % height) * width + x) * 4;
      if (x === width - 1) {
        wrapSum += diff(offset, right);
        wrapCount++;
      } else {
        interiorSum += diff(offset, right);
        interiorCount++;
      }
      if (y === height - 1) {
        wrapSum += diff(offset, below);
        wrapCount++;
      } else {
        interiorSum += diff(offset, below);
        interiorCount++;
      }
    }
  }
  const wrapMean = wrapSum / wrapCount;
  const interiorMean = interiorSum / interiorCount;
  if (interiorMean === 0) return wrapMean === 0 ? 1 : Number.POSITIVE_INFINITY;
  return wrapMean / interiorMean;
}

// Intersection-over-union of the two alpha silhouettes (1 = identical).
export function maskIoU(a: RawImage, b: RawImage): number {
  let intersection = 0;
  let union = 0;
  for (let i = 3; i < a.data.length; i += 4) {
    const inA = a.data[i] > ALPHA_THRESHOLD;
    const inB = b.data[i] > ALPHA_THRESHOLD;
    if (inA && inB) intersection++;
    if (inA || inB) union++;
  }
  return union === 0 ? 1 : intersection / union;
}

export interface Baseline {
  bottomRow: number;
  centerOffset: number;
}

// Lowest opaque row and horizontal offset of the bbox center from mid-canvas.
// Accepts a precomputed bbox so callers that already have one (e.g. checkSprite)
// don't re-scan the whole image.
export function baseline(
  raw: RawImage,
  bbox: AlphaBbox | null = alphaBbox(raw),
): Baseline | null {
  if (!bbox) return null;
  return {
    bottomRow: bbox.top + bbox.height - 1,
    centerOffset: bbox.left + bbox.width / 2 - raw.width / 2,
  };
}

type Level = "PASS" | "FAIL" | "WARN";
interface Finding {
  level: Level;
  message: string;
}

function pushFinding(
  findings: Finding[],
  ok: boolean,
  message: string,
  warn = false,
): void {
  findings.push({ level: ok ? "PASS" : warn ? "WARN" : "FAIL", message });
}

function checkSizeAndFormat(
  def: SpriteDef,
  raw: RawImage,
  format: string,
): { findings: Finding[]; sizeOk: boolean } {
  const findings: Finding[] = [];
  const add = (ok: boolean, message: string) =>
    pushFinding(findings, ok, message);
  const width = def.drawWidth * 2;
  const height = def.drawHeight * 2;

  add(format === "png", `format png (got ${format})`);
  const sizeOk = raw.width === width && raw.height === height;
  add(sizeOk, `size ${width}x${height} (got ${raw.width}x${raw.height})`);
  return { findings, sizeOk };
}

// Tile-texture QA: opacity, seam, and luminance-band checks (spec §5.5/5.6).
function checkTile(def: SpriteDef, raw: RawImage): Finding[] {
  const findings: Finding[] = [];
  const add = (ok: boolean, message: string, warn = false) =>
    pushFinding(findings, ok, message, warn);

  let transparent = 0;
  for (let i = 3; i < raw.data.length; i += 4) {
    if (raw.data[i] !== 255) transparent++;
  }
  add(transparent === 0, `fully opaque (${transparent} non-opaque px)`);
  const seam = seamScore(raw);
  add(
    seam <= SEAM_MAX_RATIO,
    `seamless (seam score ${seam.toFixed(2)} ≤ ${SEAM_MAX_RATIO})`,
  );
  const palette = PALETTES[def.key === "tileForest" ? "forest" : "cave"];
  let sum = 0;
  let max = 0;
  for (let i = 0; i < raw.data.length; i += 4) {
    const lum = luminance(raw.data[i], raw.data[i + 1], raw.data[i + 2]);
    sum += lum;
    if (lum > max) max = lum;
  }
  const mean = sum / (raw.width * raw.height);
  const bandMin = (1 - LUMINANCE_BAND) * luminance(...palette.base);
  const bandMax = (1 + LUMINANCE_BAND) * luminance(...palette.accent);
  add(
    mean >= bandMin && mean <= bandMax,
    `mean luminance ${mean.toFixed(1)} in [${bandMin.toFixed(1)}, ${bandMax.toFixed(1)}]`,
  );
  const lumCap = LUMINANCE_MAX_FACTOR * luminance(...palette.accent);
  add(
    max <= lumCap,
    `max luminance ${max.toFixed(1)} ≤ ${lumCap.toFixed(1)}`,
    true,
  );
  return findings;
}

// Sprite-silhouette QA: transparent border, baseline placement, glow fringe
// (spec §5.1-5.4). Returns the baseline so callers needing it again (the
// brazier-pair check) don't recompute the bbox.
function checkSprite(
  def: SpriteDef,
  raw: RawImage,
): { findings: Finding[]; base: Baseline | null } {
  const findings: Finding[] = [];
  const add = (ok: boolean, message: string, warn = false) =>
    pushFinding(findings, ok, message, warn);

  const bbox = alphaBbox(raw);

  // Transparent 1px border: top/left/right always; bottom only for center
  // anchor (bottomCenter artwork intentionally sits on the bottom edge). An
  // edge has an opaque pixel iff the bbox touches it.
  const checkBottomEdge = def.anchor === "center";
  const edgesTouched =
    (bbox?.left === 0 ? 1 : 0) +
    (bbox?.top === 0 ? 1 : 0) +
    (bbox && bbox.left + bbox.width === raw.width ? 1 : 0) +
    (checkBottomEdge && bbox && bbox.top + bbox.height === raw.height ? 1 : 0);
  add(
    edgesTouched === 0,
    `transparent edges (${edgesTouched} of ${checkBottomEdge ? 4 : 3} checked edges touched)`,
  );

  const base = baseline(raw, bbox);
  add(base !== null, "has opaque pixels");
  if (!base) return { findings, base: null };

  if (def.anchor === "bottomCenter") {
    add(
      base.bottomRow >= raw.height - BASELINE_MAX_GAP,
      `base near bottom edge (lowest opaque row ${base.bottomRow} ≥ ${raw.height - BASELINE_MAX_GAP})`,
    );
    add(
      Math.abs(base.centerOffset) <= CENTER_TOLERANCE,
      `horizontally centered (offset ${base.centerOffset.toFixed(1)}px ≤ ±${CENTER_TOLERANCE})`,
    );
  }

  let fringe = 0;
  let solid = 0;
  for (let i = 3; i < raw.data.length; i += 4) {
    if (raw.data[i] > ALPHA_THRESHOLD && raw.data[i] <= 64) fringe++;
    else if (raw.data[i] > 64) solid++;
  }
  const fringeRatio = solid === 0 ? 0 : fringe / solid;
  add(
    fringeRatio <= FRINGE_WARN_RATIO,
    `soft-alpha fringe ${(fringeRatio * 100).toFixed(0)}% ≤ ${FRINGE_WARN_RATIO * 100}% (higher hints a baked glow halo, spec §7)`,
    true,
  );
  return { findings, base };
}

function checkOne(
  def: SpriteDef,
  raw: RawImage,
  format: string,
): { findings: Finding[]; base: Baseline | null } {
  const { findings, sizeOk } = checkSizeAndFormat(def, raw, format);
  if (!sizeOk) return { findings, base: null };
  if (def.anchor === "topLeft") {
    return { findings: [...findings, ...checkTile(def, raw)], base: null };
  }
  const sprite = checkSprite(def, raw);
  return { findings: [...findings, ...sprite.findings], base: sprite.base };
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const unknown = requested.filter(
    (k) => !SPRITE_DEFS.some((d) => d.key === k),
  );
  if (unknown.length > 0) {
    console.error(`Unknown sprite key(s): ${unknown.join(", ")}`);
    console.error(`Sprite keys: ${SPRITE_DEFS.map((d) => d.key).join(", ")}`);
    process.exit(1);
  }

  let failed = 0;
  let warned = 0;
  let checked = 0;
  const raws = new Map<string, RawImage>();
  const bases = new Map<string, Baseline | null>();
  for (const def of SPRITE_DEFS) {
    const fileName = def.path.split("/").pop() as string;
    const filePath = `${ASSETS_DIR}${fileName}`;
    const explicit = requested.includes(def.key);
    if (requested.length > 0 && !explicit) continue;
    if (!existsSync(filePath)) {
      if (explicit) {
        console.log(`${fileName}\n  FAIL file missing (${filePath})`);
        failed++;
      }
      continue;
    }
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const raw = await readRaw(image);
    raws.set(def.key, raw);
    const { findings, base } = checkOne(def, raw, metadata.format ?? "unknown");
    bases.set(def.key, base);
    checked++;
    console.log(fileName);
    for (const f of findings) {
      console.log(`  ${f.level} ${f.message}`);
      if (f.level === "FAIL") failed++;
      if (f.level === "WARN") warned++;
    }
  }

  const unlit = raws.get("brazierUnlit");
  const lit = raws.get("brazierLit");
  if (unlit && lit) {
    const iou = maskIoU(unlit, lit);
    const baseUnlit = bases.get("brazierUnlit") ?? null;
    const baseLit = bases.get("brazierLit") ?? null;
    const centerDelta =
      baseUnlit && baseLit
        ? Math.abs(baseUnlit.centerOffset - baseLit.centerOffset)
        : Number.POSITIVE_INFINITY;
    const bottomDelta =
      baseUnlit && baseLit
        ? Math.abs(baseUnlit.bottomRow - baseLit.bottomRow)
        : Number.POSITIVE_INFINITY;
    console.log("brazier pair");
    for (const [ok, message] of [
      [
        iou >= PAIR_MIN_IOU,
        `silhouette IoU ${iou.toFixed(3)} ≥ ${PAIR_MIN_IOU}`,
      ],
      [centerDelta <= 2, `horizontal shift ${centerDelta.toFixed(1)}px ≤ 2`],
      [bottomDelta <= 2, `vertical shift ${bottomDelta.toFixed(1)}px ≤ 2`],
    ] as const) {
      console.log(`  ${ok ? "PASS" : "FAIL"} ${message}`);
      if (!ok) failed++;
    }
  }

  console.log(
    `\nSummary: ${checked} file(s) checked, ${failed} FAIL, ${warned} WARN`,
  );
  if (failed > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
