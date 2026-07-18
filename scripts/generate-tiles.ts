// CLI: render both procedural floor tiles into public/assets/
// (docs/asset-pipeline.md). Usage: node scripts/generate-tiles.ts [seed]

import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { ASSETS_DIR } from "./pixels.ts";
import { renderTile, TILE_SIZE } from "./tile-texture.ts";

const seed = Number(process.argv[2] ?? "1");
if (!Number.isInteger(seed)) {
  console.error(
    "Usage: node scripts/generate-tiles.ts [seed]  (seed: integer, default 1)",
  );
  process.exit(1);
}

await mkdir(ASSETS_DIR, { recursive: true });
for (const [kind, kindSeed] of [
  ["forest", seed],
  ["cave", seed + 1],
] as const) {
  const outPath = `${ASSETS_DIR}tile-${kind}.png`;
  await sharp(renderTile(kind, kindSeed), {
    raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
  })
    .png()
    .toFile(outPath);
  console.log(`Wrote ${outPath} (seed ${kindSeed})`);
}
