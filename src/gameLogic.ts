// Pure, DOM-independent functions (spec/03-reference.md §6).
// Testable in the Vitest node environment without any mocking framework.
import type { BiomeId, Rgb } from "./gameStore";

export function lerp(a: number, b: number, t: number): number {
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

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

// Inclusive: dist === radius counts as within.
export function isWithinRadius(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
): boolean {
  return distSq(ax, ay, bx, by) <= radius * radius;
}

export function clampDelta(deltaMs: number, maxMs: number): number {
  return Math.min(deltaMs, maxMs);
}

// 0 left of the blend band, 1 right of it, smooth in between; 0.5 at boundaryX.
export function biomeBlendAt(
  x: number,
  boundaryX: number,
  blendWidth: number,
): number {
  return smoothstep01((x - (boundaryX - blendWidth / 2)) / blendWidth);
}

export function biomeIdAt(x: number, boundaryX: number): BiomeId {
  return x < boundaryX ? "enchantedForest" : "crystalCave";
}

// matchMedia-compatible function is injected so tests need no DOM mock; undefined -> false.
export function detectReducedMotion(
  matchMediaLike: ((query: string) => { matches: boolean }) | undefined,
): boolean {
  if (!matchMediaLike) {
    return false;
  }
  return matchMediaLike("(prefers-reduced-motion: reduce)").matches;
}
