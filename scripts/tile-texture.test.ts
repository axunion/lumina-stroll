import { describe, expect, it } from "vitest";
import { luminance } from "./check-assets.ts";
import { renderTile, TILE_SIZE, type TileKind } from "./tile-texture.ts";

// Mean absolute RGB difference between two columns (or rows via transpose flag).
function meanColumnDiff(data: Buffer, xa: number, xb: number): number {
  let sum = 0;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(
        data[(y * TILE_SIZE + xa) * 4 + c] - data[(y * TILE_SIZE + xb) * 4 + c],
      );
    }
  }
  return sum / (TILE_SIZE * 3);
}

describe("renderTile", () => {
  it("is deterministic: same seed produces byte-identical output", () => {
    expect(renderTile("forest", 7).equals(renderTile("forest", 7))).toBe(true);
  });

  it("differs across seeds", () => {
    expect(renderTile("cave", 1).equals(renderTile("cave", 2))).toBe(false);
  });

  it("is fully opaque", () => {
    const data = renderTile("forest", 1);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 255) throw new Error(`alpha ${data[i]} at byte ${i}`);
    }
  });

  it("wraps horizontally: the seam edge differs no more than interior columns", () => {
    const data = renderTile("cave", 3);
    const wrapDiff = meanColumnDiff(data, TILE_SIZE - 1, 0);
    let interiorSum = 0;
    for (let x = 0; x < TILE_SIZE - 1; x++) {
      interiorSum += meanColumnDiff(data, x, x + 1);
    }
    const interiorDiff = interiorSum / (TILE_SIZE - 1);
    expect(wrapDiff).toBeLessThanOrEqual(interiorDiff * 3);
  });

  it.each<[TileKind, number, number]>([
    // Bands: 0.9 × luminance(base) .. 1.1 × luminance(accent), spec §5.5/5.6.
    ["forest", 0.9 * luminance(18, 38, 32), 1.1 * luminance(24, 48, 40)],
    ["cave", 0.9 * luminance(22, 20, 44), 1.1 * luminance(30, 28, 58)],
  ])("keeps %s mean luminance inside the biome band", (kind, min, max) => {
    const data = renderTile(kind, 1);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += luminance(data[i], data[i + 1], data[i + 2]);
    }
    const mean = sum / (TILE_SIZE * TILE_SIZE);
    expect(mean).toBeGreaterThanOrEqual(min);
    expect(mean).toBeLessThanOrEqual(max);
  });
});
