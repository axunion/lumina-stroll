// CLI: normalize a raw AI-generated image into a spec-compliant sprite PNG
// (docs/asset-pipeline.md): trim to the alpha bounding box, downscale, place
// per the sprite's anchor, and write to public/assets/.
// Usage: node scripts/normalize-sprite.ts <input.png> <spriteKey>

import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { SPRITE_DEFS, type SpriteDef } from "../src/assets.ts";
import { ALPHA_THRESHOLD, ASSETS_DIR, alphaBbox, readRaw } from "./pixels.ts";

// Fraction of pixels that may be opaque before we assume a baked-in background.
const MAX_OPAQUE_RATIO = 0.99;
// Transparent margin around center-anchored artwork (~8px on the 80px player, §5.1).
const CENTER_MARGIN_RATIO = 0.1;
// Side/top margin for bottomCenter artwork.
const EDGE_MARGIN_RATIO = 0.05;
// bottomCenter base sits this many px above the bottom edge (spec allows ≤4).
const BOTTOM_INSET = 2;

export interface Placement {
  width: number; // scaled artwork size
  height: number;
  left: number; // artwork offset inside the target canvas
  top: number;
}

// Scales the bbox to fit within (canvasWidth - 2*marginX) horizontally and
// verticalBudget vertically, aspect-preserved, then centers it horizontally.
function fitCentered(
  bboxWidth: number,
  bboxHeight: number,
  canvasWidth: number,
  marginX: number,
  verticalBudget: number,
): { width: number; height: number; left: number } {
  const scale = Math.min(
    (canvasWidth - 2 * marginX) / bboxWidth,
    verticalBudget / bboxHeight,
  );
  const width = Math.max(1, Math.round(bboxWidth * scale));
  const height = Math.max(1, Math.round(bboxHeight * scale));
  return { width, height, left: Math.round((canvasWidth - width) / 2) };
}

// Pure: where the trimmed artwork lands inside the target canvas. Aspect ratio
// is preserved; the artwork is scaled to fill the margin-adjusted area.
export function placement(
  bboxWidth: number,
  bboxHeight: number,
  def: SpriteDef,
): Placement {
  const canvasWidth = def.drawWidth * 2;
  const canvasHeight = def.drawHeight * 2;
  if (def.anchor === "center") {
    const marginX = Math.round(canvasWidth * CENTER_MARGIN_RATIO);
    const marginY = Math.round(canvasHeight * CENTER_MARGIN_RATIO);
    const { width, height, left } = fitCentered(
      bboxWidth,
      bboxHeight,
      canvasWidth,
      marginX,
      canvasHeight - 2 * marginY,
    );
    return {
      width,
      height,
      left,
      top: Math.round((canvasHeight - height) / 2),
    };
  }
  // bottomCenter: base on the bottom edge (minus inset), horizontally centered.
  const marginX = Math.round(canvasWidth * EDGE_MARGIN_RATIO);
  const marginTop = Math.round(canvasHeight * EDGE_MARGIN_RATIO);
  const { width, height, left } = fitCentered(
    bboxWidth,
    bboxHeight,
    canvasWidth,
    marginX,
    canvasHeight - BOTTOM_INSET - marginTop,
  );
  return { width, height, left, top: canvasHeight - BOTTOM_INSET - height };
}

async function main(): Promise<void> {
  const [inputPath, key] = process.argv.slice(2);
  if (!inputPath || !key) {
    console.error(
      "Usage: node scripts/normalize-sprite.ts <input.png> <spriteKey>",
    );
    console.error(`Sprite keys: ${SPRITE_DEFS.map((d) => d.key).join(", ")}`);
    process.exit(1);
  }
  const def = SPRITE_DEFS.find((d) => d.key === key);
  if (!def) {
    console.error(`Unknown sprite key "${key}".`);
    console.error(`Sprite keys: ${SPRITE_DEFS.map((d) => d.key).join(", ")}`);
    process.exit(1);
  }
  if (def.anchor === "topLeft") {
    console.error(
      `"${key}" is a floor tile — use "node scripts/generate-tiles.ts" instead.`,
    );
    process.exit(1);
  }

  const raw = await readRaw(inputPath);
  let opaque = 0;
  for (let i = 3; i < raw.data.length; i += 4) {
    if (raw.data[i] > ALPHA_THRESHOLD) opaque++;
  }
  if (opaque / (raw.width * raw.height) > MAX_OPAQUE_RATIO) {
    console.error(
      "Input has (almost) no transparency — the background is baked in.",
    );
    console.error(
      "Regenerate with a transparent background (chroma-keying is out of scope).",
    );
    process.exit(1);
  }
  const bbox = alphaBbox(raw);
  if (!bbox) {
    console.error("Input is fully transparent — nothing to normalize.");
    process.exit(1);
  }

  const p = placement(bbox.width, bbox.height, def);
  const artwork = await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })
    .extract(bbox)
    .resize(p.width, p.height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  await mkdir(ASSETS_DIR, { recursive: true });
  const outPath = `${ASSETS_DIR}${def.path.split("/").pop()}`;
  await sharp({
    create: {
      width: def.drawWidth * 2,
      height: def.drawHeight * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: artwork, left: p.left, top: p.top }])
    .png()
    .toFile(outPath);
  console.log(`Wrote ${outPath} (${def.drawWidth * 2}x${def.drawHeight * 2})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
