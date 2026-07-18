import { describe, expect, it } from "vitest";
import { baseline, maskIoU, seamScore } from "./check-assets.ts";
import type { RawImage } from "./pixels.ts";

function makeRaw(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => [number, number, number, number],
): RawImage {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { data, width, height };
}

describe("seamScore", () => {
  it("flags a hard seam (linear gradient wraps with a jump)", () => {
    const raw = makeRaw(8, 8, (x) => [x * 30, x * 30, x * 30, 255]);
    expect(seamScore(raw)).toBeGreaterThan(3);
  });

  it("passes a wrap-symmetric texture", () => {
    // Checkerboard: every adjacent pair differs equally, including the wrap edge.
    const raw = makeRaw(8, 8, (x, y) => {
      const v = (x + y) % 2 === 0 ? 40 : 60;
      return [v, v, v, 255];
    });
    expect(seamScore(raw)).toBeCloseTo(1, 5);
  });

  it("returns 1 for a completely flat texture", () => {
    const raw = makeRaw(4, 4, () => [30, 30, 30, 255]);
    expect(seamScore(raw)).toBe(1);
  });
});

describe("maskIoU", () => {
  const square = (left: number) =>
    makeRaw(8, 8, (x, y) =>
      x >= left && x < left + 4 && y >= 2 && y < 6
        ? [255, 255, 255, 255]
        : [0, 0, 0, 0],
    );

  it("is 1 for identical silhouettes", () => {
    expect(maskIoU(square(2), square(2))).toBe(1);
  });

  it("drops when one silhouette shifts", () => {
    // 4x4 squares shifted by 2px: overlap 8, union 24.
    expect(maskIoU(square(2), square(4))).toBeCloseTo(8 / 24, 5);
  });
});

describe("baseline", () => {
  it("reports the lowest opaque row and horizontal center offset", () => {
    const raw = makeRaw(10, 10, (x, y) =>
      x >= 3 && x <= 6 && y >= 4 && y <= 7
        ? [255, 255, 255, 255]
        : [0, 0, 0, 0],
    );
    expect(baseline(raw)).toEqual({ bottomRow: 7, centerOffset: 0 });
  });

  it("returns null for a fully transparent image", () => {
    expect(baseline(makeRaw(4, 4, () => [0, 0, 0, 0]))).toBeNull();
  });
});
