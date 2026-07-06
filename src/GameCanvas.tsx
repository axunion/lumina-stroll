import { onCleanup, onMount } from "solid-js";
import styles from "./Game.module.css";
import { clampDelta } from "./gameLogic";
import type { Rgb } from "./gameStore";
import { BIOMES, gameState } from "./gameStore";

function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

// CONFIG values and meanings copied verbatim from spec/03-reference.md §2.
const CONFIG = {
  playerSpeed: 220, // px/s — player movement speed
  playerRadius: 12, // px — player circle radius
  lightRadius: 180, // px — player sight light opaque core radius
  lightSoftness: 120, // px — light edge fade width (added to core radius)
  darknessAlpha: 0.82, // 0-1 — darkness overlay opacity
  brazierLightRadius: 150, // px — lit brazier permanent light radius
  brazierProximity: 70, // px — brazier auto-light distance
  crystalPickupRadius: 28, // px — crystal pickup detection distance
  particleLifetimeMs: 1400, // ms — footprint particle lifetime
  particleSpawnInterval: 90, // ms — footprint spawn interval (while moving)
  burstParticleCount: 18, // count — crystal pickup burst particle count
  ambientParticleCount: 60, // count — resident ambient particle count
  maxParticles: 400, // count — total particle cap (suppress spawn when exceeded)
  floatingTextDurationMs: 900, // ms — "+1" text display duration
  biomeBoundaryX: 2400, // px — biome switch x threshold
  biomeBlendWidth: 400, // px — width of the blend band across the boundary
  worldWidth: 4800, // px — world width
  worldHeight: 1200, // px — world height
  tileSize: 64, // px — background tile edge length
  maxDeltaMs: 50, // ms — delta time clamp ceiling
} as const;

const PLAYER_SPAWN = { x: 240, y: 600 };

// Player's own glow, same family as the footprint particle color (spec/03-reference.md §3).
const PLAYER_COLOR = "rgb(255, 240, 200)";
const FOREST_BACKGROUND = rgbCss(BIOMES[0].background);
const FOREST_TILE_ACCENT = rgbCss(BIOMES[0].tileAccent);

const MOVE_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
]);

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function GameCanvas() {
  let wrapper: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;

  onMount(() => {
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const player = { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y };
    const camera = { x: 0, y: 0 };
    const keys = new Set<string>();
    let viewWidth = 0;
    let viewHeight = 0;
    let lastTime = 0;
    let rafId = 0;

    function handleResize() {
      if (!wrapper || !canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = wrapper;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewWidth = clientWidth;
      viewHeight = clientHeight;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!MOVE_KEYS.has(e.code)) return;
      if (ARROW_KEYS.has(e.code)) e.preventDefault();
      keys.add(e.code);
    }

    function handleKeyUp(e: KeyboardEvent) {
      keys.delete(e.code);
    }

    function handleBlur() {
      keys.clear();
    }

    function updateCameraAxis(pos: number, view: number, worldSize: number) {
      if (worldSize <= view) return (worldSize - view) / 2;
      return Math.min(Math.max(pos - view / 2, 0), worldSize - view);
    }

    function update(dt: number) {
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        const seconds = dt / 1000;
        player.x += (dx / length) * CONFIG.playerSpeed * seconds;
        player.y += (dy / length) * CONFIG.playerSpeed * seconds;
      }

      player.x = Math.min(
        Math.max(player.x, CONFIG.playerRadius),
        CONFIG.worldWidth - CONFIG.playerRadius,
      );
      player.y = Math.min(
        Math.max(player.y, CONFIG.playerRadius),
        CONFIG.worldHeight - CONFIG.playerRadius,
      );

      camera.x = updateCameraAxis(player.x, viewWidth, CONFIG.worldWidth);
      camera.y = updateCameraAxis(player.y, viewHeight, CONFIG.worldHeight);
    }

    function renderTiles() {
      if (!ctx) return;
      const startCol = Math.floor(camera.x / CONFIG.tileSize);
      const endCol = Math.ceil((camera.x + viewWidth) / CONFIG.tileSize);
      const startRow = Math.floor(camera.y / CONFIG.tileSize);
      const endRow = Math.ceil((camera.y + viewHeight) / CONFIG.tileSize);

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          ctx.fillStyle =
            (col + row) % 2 === 0 ? FOREST_BACKGROUND : FOREST_TILE_ACCENT;
          ctx.fillRect(
            col * CONFIG.tileSize,
            row * CONFIG.tileSize,
            CONFIG.tileSize,
            CONFIG.tileSize,
          );
        }
      }
    }

    function renderPlayer() {
      if (!ctx) return;
      const gradient = ctx.createRadialGradient(
        player.x,
        player.y,
        0,
        player.x,
        player.y,
        CONFIG.playerRadius,
      );
      gradient.addColorStop(0, PLAYER_COLOR);
      gradient.addColorStop(1, "rgba(255, 240, 200, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(player.x, player.y, CONFIG.playerRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    function render() {
      if (!ctx) return;
      ctx.clearRect(0, 0, viewWidth, viewHeight);
      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      renderTiles();
      renderPlayer();
      ctx.restore();
    }

    function loop(now: number) {
      rafId = requestAnimationFrame(loop);
      const dt = clampDelta(now - lastTime, CONFIG.maxDeltaMs);
      lastTime = now;
      if (!gameState.isMenuOpen) update(dt);
      render();
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);

    onCleanup(() => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    });
  });

  return (
    <div class={styles.canvasWrapper} ref={wrapper}>
      <canvas
        class={styles.gameCanvas}
        ref={canvas}
        role="img"
        aria-label="A glowing dungeon world. Use arrow keys or WASD to stroll."
      />
    </div>
  );
}

export default GameCanvas;
