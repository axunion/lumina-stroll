import { describe, expect, it } from "vitest";
import type { SpriteDef } from "../src/assets.ts";
import { placement } from "./normalize-sprite.ts";

function makeDef(
  anchor: SpriteDef["anchor"],
  drawWidth: number,
  drawHeight: number,
): SpriteDef {
  return {
    key: "player",
    path: "/assets/player.png",
    drawWidth,
    drawHeight,
    anchor,
  };
}

describe("placement", () => {
  it("center: fills the canvas minus a ~10% margin and stays centered", () => {
    // player: 80x80 canvas, margin 8 → 64x64 artwork at (8, 8)
    const p = placement(500, 500, makeDef("center", 40, 40));
    expect(p).toEqual({ width: 64, height: 64, left: 8, top: 8 });
  });

  it("bottomCenter: base lands 2px above the bottom edge, centered", () => {
    const def = makeDef("bottomCenter", 48, 48); // 96x96 canvas
    const p = placement(400, 200, def);
    expect(p.top + p.height).toBe(96 - 2);
    expect(Math.abs(p.left + p.width / 2 - 48)).toBeLessThanOrEqual(1);
    expect(p.left).toBeGreaterThanOrEqual(1); // top/left/right edges stay transparent
    expect(p.top).toBeGreaterThanOrEqual(1);
  });

  it("preserves aspect ratio (never stretches)", () => {
    const p = placement(300, 600, makeDef("bottomCenter", 32, 48)); // inscription 64x96
    expect(p.width / p.height).toBeCloseTo(300 / 600, 1);
    expect(p.top + p.height).toBe(96 - 2);
    expect(p.width).toBeLessThanOrEqual(64);
  });

  it("handles a wide bbox by fitting to width", () => {
    const p = placement(1000, 100, makeDef("center", 32, 32)); // 64x64 canvas
    expect(p.width).toBe(64 - 2 * 6); // margin round(64*0.1)=6
    expect(p.height).toBe(Math.round(100 * (52 / 1000)));
  });
});
