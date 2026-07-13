import { describe, expect, it } from "vitest";
import {
  biomeBlendAt,
  biomeIdAt,
  clampDelta,
  detectReducedMotion,
  distSq,
  equalPowerGains,
  isWithinRadius,
  lerp,
  lerpColor,
  smoothstep01,
} from "./gameLogic";
import type { Rgb } from "./gameStore";

describe("lerp", () => {
  it("returns a at t=0 and b at t=1", () => {
    expect(lerp(3, 7, 0)).toBe(3);
    expect(lerp(3, 7, 1)).toBe(7);
  });

  it("returns the midpoint at t=0.5", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe("lerpColor", () => {
  it("interpolates each channel independently at endpoints and midpoint", () => {
    const a: Rgb = [0, 100, 200];
    const b: Rgb = [100, 200, 0];
    expect(lerpColor(a, b, 0)).toEqual([0, 100, 200]);
    expect(lerpColor(a, b, 1)).toEqual([100, 200, 0]);
    expect(lerpColor(a, b, 0.5)).toEqual([50, 150, 100]);
  });
});

describe("smoothstep01", () => {
  it("clamps to 0 for t <= 0 and to 1 for t >= 1", () => {
    expect(smoothstep01(-0.5)).toBe(0);
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(1.5)).toBe(1);
  });

  it("returns 0.5 at t=0.5 (symmetry)", () => {
    expect(smoothstep01(0.5)).toBe(0.5);
  });
});

describe("distSq", () => {
  it("returns the squared distance (3-4-5 triangle)", () => {
    expect(distSq(0, 0, 3, 4)).toBe(25);
    expect(distSq(1, 1, 4, 5)).toBe(25);
  });
});

describe("isWithinRadius", () => {
  it("returns true exactly at the boundary (hit test is inclusive)", () => {
    expect(isWithinRadius(0, 0, 3, 4, 5)).toBe(true);
  });

  it("returns false beyond the radius", () => {
    expect(isWithinRadius(0, 0, 3, 4, 4.99)).toBe(false);
  });
});

describe("clampDelta", () => {
  it("returns values at or below maxMs unchanged", () => {
    expect(clampDelta(16, 50)).toBe(16);
    expect(clampDelta(50, 50)).toBe(50);
  });

  it("clamps values above maxMs to maxMs", () => {
    expect(clampDelta(1000, 50)).toBe(50);
  });
});

describe("biomeBlendAt", () => {
  it("returns 0 left of the blend band and 1 right of it", () => {
    // Band spans [boundaryX - blendWidth/2, boundaryX + blendWidth/2] = [80, 120].
    expect(biomeBlendAt(79, 100, 40)).toBe(0);
    expect(biomeBlendAt(121, 100, 40)).toBe(1);
  });

  it("returns 0.5 at the boundary center", () => {
    expect(biomeBlendAt(100, 100, 40)).toBe(0.5);
  });
});

describe("biomeIdAt", () => {
  it("returns enchantedForest below the boundary and crystalCave at or above it", () => {
    expect(biomeIdAt(99, 100)).toBe("enchantedForest");
    expect(biomeIdAt(100, 100)).toBe("crystalCave");
    expect(biomeIdAt(101, 100)).toBe("crystalCave");
  });
});

describe("detectReducedMotion", () => {
  it("returns true when the injected matchMedia reports matches: true", () => {
    expect(detectReducedMotion(() => ({ matches: true }))).toBe(true);
  });

  it("returns false when the injected matchMedia reports matches: false", () => {
    expect(detectReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it("returns false when matchMedia is unavailable (SSR / unsupported)", () => {
    expect(detectReducedMotion(undefined)).toBe(false);
  });
});

describe("equalPowerGains", () => {
  it("returns {a: 1, b: 0} at t=0 and {a: 0, b: 1} at t=1", () => {
    const at0 = equalPowerGains(0);
    expect(at0.a).toBeCloseTo(1);
    expect(at0.b).toBeCloseTo(0);
    const at1 = equalPowerGains(1);
    expect(at1.a).toBeCloseTo(0);
    expect(at1.b).toBeCloseTo(1);
  });

  it("keeps a^2 + b^2 === 1 for arbitrary t", () => {
    for (const t of [0.25, 0.5, 0.75]) {
      const { a, b } = equalPowerGains(t);
      expect(a * a + b * b).toBeCloseTo(1);
    }
  });

  it("clamps out-of-range t to [0,1]", () => {
    expect(equalPowerGains(-1)).toEqual(equalPowerGains(0));
    expect(equalPowerGains(2)).toEqual(equalPowerGains(1));
  });
});
