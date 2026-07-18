import { describe, expect, it } from "vitest";
import { alphaBbox, type RawImage } from "./pixels.ts";

function makeRaw(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
): RawImage {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[(y * width + x) * 4 + 3] = alphaAt(x, y);
    }
  }
  return { data, width, height };
}

describe("alphaBbox", () => {
  it("returns the bounding box of pixels above the threshold", () => {
    const raw = makeRaw(8, 8, (x, y) =>
      x >= 2 && x <= 5 && y >= 3 && y <= 6 ? 255 : 0,
    );
    expect(alphaBbox(raw)).toEqual({ left: 2, top: 3, width: 4, height: 4 });
  });

  it("ignores faint pixels at or below the threshold", () => {
    const raw = makeRaw(4, 4, (x, y) => (x === 1 && y === 1 ? 255 : 8));
    expect(alphaBbox(raw)).toEqual({ left: 1, top: 1, width: 1, height: 1 });
  });

  it("returns null for a fully transparent image", () => {
    const raw = makeRaw(4, 4, () => 0);
    expect(alphaBbox(raw)).toBeNull();
  });

  it("spans the full image when every pixel is opaque", () => {
    const raw = makeRaw(3, 2, () => 255);
    expect(alphaBbox(raw)).toEqual({ left: 0, top: 0, width: 3, height: 2 });
  });
});
