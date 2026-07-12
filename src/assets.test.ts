import { describe, expect, it } from "vitest";
import { type SpriteDef, spriteDrawOrigin } from "./assets";

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

describe("spriteDrawOrigin", () => {
  it("center: returns (x - drawWidth/2, y - drawHeight/2)", () => {
    const def = makeDef("center", 40, 40);
    expect(spriteDrawOrigin(def, 100, 200)).toEqual({ dx: 80, dy: 180 });
  });

  it("topLeft: returns (x, y)", () => {
    const def = makeDef("topLeft", 64, 64);
    expect(spriteDrawOrigin(def, 100, 200)).toEqual({ dx: 100, dy: 200 });
  });

  it("bottomCenter: returns (x - drawWidth/2, y - drawHeight)", () => {
    const def = makeDef("bottomCenter", 48, 48);
    expect(spriteDrawOrigin(def, 100, 200)).toEqual({ dx: 76, dy: 152 });
  });
});
