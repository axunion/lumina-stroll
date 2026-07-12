// Sprite manifest, load lifecycle, and anchor math (spec/03-reference.md §6.3, §7).

export type SpriteKey =
  | "player"
  | "crystal"
  | "brazierUnlit"
  | "brazierLit"
  | "tileForest"
  | "tileCave"
  | "plantForest"
  | "plantCave"
  | "inscription";

export interface SpriteDef {
  key: SpriteKey;
  path: string; // e.g. '/assets/player.png' (served from public/)
  drawWidth: number; // CSS px on canvas
  drawHeight: number; // CSS px on canvas
  anchor: "center" | "topLeft" | "bottomCenter";
}

export type SpriteMap = Partial<Record<SpriteKey, HTMLImageElement>>;

// Manifest of all swappable sprites (spec/03-reference.md §7 is authoritative).
export const SPRITE_DEFS: readonly SpriteDef[] = [
  {
    key: "player",
    path: "/assets/player.png",
    drawWidth: 40,
    drawHeight: 40,
    anchor: "center",
  },
  {
    key: "crystal",
    path: "/assets/crystal.png",
    drawWidth: 32,
    drawHeight: 32,
    anchor: "center",
  },
  {
    key: "brazierUnlit",
    path: "/assets/brazier-unlit.png",
    drawWidth: 48,
    drawHeight: 48,
    anchor: "bottomCenter",
  },
  {
    key: "brazierLit",
    path: "/assets/brazier-lit.png",
    drawWidth: 48,
    drawHeight: 48,
    anchor: "bottomCenter",
  },
  {
    key: "tileForest",
    path: "/assets/tile-forest.png",
    drawWidth: 64,
    drawHeight: 64,
    anchor: "topLeft",
  },
  {
    key: "tileCave",
    path: "/assets/tile-cave.png",
    drawWidth: 64,
    drawHeight: 64,
    anchor: "topLeft",
  },
  {
    key: "plantForest",
    path: "/assets/plant-forest.png",
    drawWidth: 32,
    drawHeight: 32,
    anchor: "bottomCenter",
  },
  {
    key: "plantCave",
    path: "/assets/plant-cave.png",
    drawWidth: 32,
    drawHeight: 32,
    anchor: "bottomCenter",
  },
  {
    key: "inscription",
    path: "/assets/inscription.png",
    drawWidth: 32,
    drawHeight: 48,
    anchor: "bottomCenter",
  },
];

// Pure: anchor-adjusted top-left origin for drawImage (spec/03-reference.md §6.3).
export function spriteDrawOrigin(
  def: SpriteDef,
  x: number,
  y: number,
): { dx: number; dy: number } {
  switch (def.anchor) {
    case "center":
      return { dx: x - def.drawWidth / 2, dy: y - def.drawHeight / 2 };
    case "topLeft":
      return { dx: x, dy: y };
    case "bottomCenter":
      return { dx: x - def.drawWidth / 2, dy: y - def.drawHeight };
  }
}

// Shared drawImage call for any loaded sprite, anchor-adjusted via spriteDrawOrigin.
// Used by every render call site that dispatches a sprite over its procedural fallback.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  def: SpriteDef,
  x: number,
  y: number,
): void {
  const { dx, dy } = spriteDrawOrigin(def, x, y);
  ctx.drawImage(sprite, dx, dy, def.drawWidth, def.drawHeight);
}

// Fire-and-forget: loads each sprite and registers it on success. 404 / decode failure
// is swallowed so the caller keeps using the procedural fallback (spec/01-architecture.md §8).
export function loadSprites(target: SpriteMap): void {
  for (const def of SPRITE_DEFS) {
    const img = new Image();
    img.src = def.path;
    img
      .decode()
      .then(() => {
        target[def.key] = img;
      })
      .catch(() => {});
  }
}
