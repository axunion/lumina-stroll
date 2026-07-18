// CLI: derive public/assets/brazier-lit.png from brazier-unlit.png by
// compositing an ember pool inside the bowl (docs/asset-pipeline.md). The pool
// is masked by the bowl's own alpha, so the pair's silhouettes stay identical
// and no glow can leak outside (spec/asset-guide.md §5.4).
// Usage: node scripts/compose-brazier-lit.ts

import sharp from "sharp";
import {
  ASSETS_DIR,
  alphaBbox,
  lerpColor,
  type Rgb,
  readRaw,
  smoothstep01,
} from "./pixels.ts";

// Ember pool tuning, as fractions of the bowl's alpha bbox. Edit and re-run.
const POOL_CENTER_Y = 0.18; // pool center this far below the bbox top (shallow, near the rim)
const POOL_RX = 0.3; // horizontal radius
const POOL_RY_RATIO = 0.5; // vertical radius = POOL_RY_RATIO * rx
const EMBER_CORE_RADIUS = 0.15; // 1 (full core color) inside this distance fraction
const EMBER_MAX_ALPHA = 0.9;
const EMBER_CORE: Rgb = [150, 170, 255]; // #96AAFF (spec §4.2 flame core)
const EMBER_EDGE: Rgb = [190, 120, 255]; // #BE78FF (flame tip)

const unlitPath = `${ASSETS_DIR}brazier-unlit.png`;

const raw = await readRaw(unlitPath).catch(() => {
  console.error(`Cannot read ${unlitPath}.`);
  console.error(
    "Normalize the unlit brazier first: node scripts/normalize-sprite.ts <input.png> brazierUnlit",
  );
  process.exit(1);
});
const bbox = alphaBbox(raw);
if (!bbox) {
  console.error("brazier-unlit.png is fully transparent — nothing to light.");
  process.exit(1);
}

const cx = bbox.left + bbox.width / 2;
const cy = bbox.top + POOL_CENTER_Y * bbox.height;
const rx = POOL_RX * bbox.width;
const ry = POOL_RY_RATIO * rx;

const ember = Buffer.alloc(raw.width * raw.height * 4);
for (let y = 0; y < raw.height; y++) {
  for (let x = 0; x < raw.width; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    // 1 inside the core (d ≤ EMBER_CORE_RADIUS), fading to 0 at the pool edge (d ≥ 1).
    const fade = smoothstep01((1 - d) / (1 - EMBER_CORE_RADIUS));
    if (fade === 0) continue;
    const offset = (y * raw.width + x) * 4;
    const bowlAlpha = raw.data[offset + 3] / 255;
    const mix = Math.min(1, d);
    const [r, g, b] = lerpColor(EMBER_CORE, EMBER_EDGE, mix);
    ember[offset] = Math.round(r);
    ember[offset + 1] = Math.round(g);
    ember[offset + 2] = Math.round(b);
    ember[offset + 3] = Math.round(fade * EMBER_MAX_ALPHA * bowlAlpha * 255);
  }
}

const litPath = `${ASSETS_DIR}brazier-lit.png`;
await sharp(raw.data, {
  raw: { width: raw.width, height: raw.height, channels: 4 },
})
  .composite([
    {
      input: ember,
      raw: { width: raw.width, height: raw.height, channels: 4 },
    },
  ])
  .png()
  .toFile(litPath);
console.log(`Wrote ${litPath}`);
