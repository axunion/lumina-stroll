// Pure procedural renderer for the two seamless floor tiles
// (spec/asset-guide.md §5.5/5.6). Seamless by construction: value noise on a
// torus lattice plus speckles that wrap at the edges. No I/O here.

import { lerpColor, type Rgb, smoothstep01 } from "./pixels.ts";

export type TileKind = "forest" | "cave";

export const TILE_SIZE = 128;

export interface TilePalette {
  base: Rgb; // biome background (spec §4.2)
  accent: Rgb; // biome tile accent
  speckle: Rgb; // moss dots / crystal glints
}

// Exported so check-assets.ts validates against the same palette (spec §4.2).
export const PALETTES: Record<TileKind, TilePalette> = {
  forest: {
    base: [18, 38, 32],
    accent: [24, 48, 40],
    speckle: [180, 230, 160],
  },
  cave: { base: [22, 20, 44], accent: [30, 28, 58], speckle: [150, 210, 255] },
};

const COARSE_GRID = 8; // 16px noise cells
const FINE_GRID = 16; // 8px noise cells
const COARSE_WEIGHT = 0.65;
const SPECKLE_COUNT = 24;
const SPECKLE_MIX = 0.3; // keeps speckle peaks dim under the darkness overlay

// Deterministic 32-bit PRNG so tiles regenerate byte-identically from a seed.
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLattice(rand: () => number, gridN: number): Float64Array {
  const values = new Float64Array(gridN * gridN);
  for (let i = 0; i < values.length; i++) {
    values[i] = rand();
  }
  return values;
}

// Bilinear value noise; lattice indices wrap (torus), so opposite tile edges
// interpolate toward the same lattice values and repeat without a seam.
function sampleLattice(
  lattice: Float64Array,
  gridN: number,
  x: number,
  y: number,
): number {
  const cell = TILE_SIZE / gridN;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = (x0 + 1) % gridN;
  const y1 = (y0 + 1) % gridN;
  const fx = smoothstep01(gx - x0);
  const fy = smoothstep01(gy - y0);
  const v00 = lattice[y0 * gridN + x0];
  const v10 = lattice[y0 * gridN + x1];
  const v01 = lattice[y1 * gridN + x0];
  const v11 = lattice[y1 * gridN + x1];
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

// Renders one tile as straight RGBA (TILE_SIZE² × 4), fully opaque.
export function renderTile(kind: TileKind, seed: number): Buffer {
  const palette = PALETTES[kind];
  const rand = mulberry32(seed);
  const coarse = makeLattice(rand, COARSE_GRID);
  const fine = makeLattice(rand, FINE_GRID);
  const data = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const n =
        COARSE_WEIGHT * sampleLattice(coarse, COARSE_GRID, x, y) +
        (1 - COARSE_WEIGHT) * sampleLattice(fine, FINE_GRID, x, y);
      const offset = (y * TILE_SIZE + x) * 4;
      const [r, g, b] = lerpColor(palette.base, palette.accent, n);
      data[offset] = Math.round(r);
      data[offset + 1] = Math.round(g);
      data[offset + 2] = Math.round(b);
      data[offset + 3] = 255;
    }
  }

  for (let i = 0; i < SPECKLE_COUNT; i++) {
    const sx = Math.floor(rand() * TILE_SIZE);
    const sy = Math.floor(rand() * TILE_SIZE);
    const radius = rand() < 0.5 ? 1 : 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const px = (sx + dx + TILE_SIZE) % TILE_SIZE;
        const py = (sy + dy + TILE_SIZE) % TILE_SIZE;
        const offset = (py * TILE_SIZE + px) * 4;
        const current: Rgb = [data[offset], data[offset + 1], data[offset + 2]];
        const [r, g, b] = lerpColor(current, palette.speckle, SPECKLE_MIX);
        data[offset] = Math.round(r);
        data[offset + 1] = Math.round(g);
        data[offset + 2] = Math.round(b);
      }
    }
  }

  return data;
}
