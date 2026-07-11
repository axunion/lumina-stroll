import { onCleanup, onMount } from "solid-js";
import styles from "./Game.module.css";
import {
  biomeBlendAt,
  biomeIdAt,
  clampDelta,
  isWithinRadius,
  lerpColor,
} from "./gameLogic";
import type { Rgb } from "./gameStore";
import {
  BIOMES,
  collectCrystal,
  gameState,
  lightBrazier,
  setCurrentBiome,
} from "./gameStore";

// GameCanvas.tsx-local, non-reactive types (spec/03-reference.md §1.2).
interface Crystal {
  id: number;
  x: number;
  y: number;
  collected: boolean;
  phase: number; // radians; per-crystal bob offset
}

interface Brazier {
  id: number;
  x: number;
  y: number;
  lit: boolean;
  litAt: number; // ms timestamp (performance.now clock); 0 while unlit
}

interface Particle {
  x: number;
  y: number;
  vx: number; // px/s
  vy: number; // px/s
  bornAt: number;
  lifetimeMs: number;
  size: number; // radius in px
  color: Rgb;
  kind: "footprint" | "burst" | "flame" | "ambient";
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  bornAt: number;
}

function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbaCss([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Shared radial-gradient fill: solid core fading to transparent at `radius`.
// Used by the player, crystals, and lit braziers (spec/03-reference.md §3 entity colors).
function fillGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: Rgb,
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgbCss(color));
  gradient.addColorStop(1, rgbaCss(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Shared destination-out hole punch for a single light source (spec/02-game-design.md §4):
// opaque at the center, fully transparent at `outerRadius`, opaque up to `coreRadius`.
function punchLightHole(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  coreRadius: number,
  outerRadius: number,
) {
  const gradient = ctx.createRadialGradient(
    screenX,
    screenY,
    0,
    screenX,
    screenY,
    outerRadius,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(coreRadius / outerRadius, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(screenX, screenY, outerRadius, 0, Math.PI * 2);
  ctx.fill();
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

// World data (spec/03-reference.md §4). Hardcoded literal placement — decided against
// procedural/seeded placement for full determinism and per-entity tuning.
const CRYSTALS: Crystal[] = [
  // Enchanted Forest (x < 2400)
  { id: 1, x: 420, y: 380, collected: false, phase: 0.0 },
  { id: 2, x: 700, y: 820, collected: false, phase: 0.9 },
  { id: 3, x: 1050, y: 300, collected: false, phase: 1.8 },
  { id: 4, x: 1300, y: 640, collected: false, phase: 2.7 },
  { id: 5, x: 1620, y: 950, collected: false, phase: 3.6 },
  { id: 6, x: 1900, y: 420, collected: false, phase: 4.5 },
  { id: 7, x: 2150, y: 760, collected: false, phase: 5.4 },
  { id: 8, x: 2350, y: 260, collected: false, phase: 0.4 },
  // Crystal Cave (x >= 2400)
  { id: 9, x: 2650, y: 540, collected: false, phase: 1.3 },
  { id: 10, x: 2980, y: 900, collected: false, phase: 2.2 },
  { id: 11, x: 3300, y: 350, collected: false, phase: 3.1 },
  { id: 12, x: 3700, y: 700, collected: false, phase: 4.0 },
  { id: 13, x: 4100, y: 980, collected: false, phase: 4.9 },
  { id: 14, x: 4500, y: 480, collected: false, phase: 5.8 },
];

const BRAZIERS: Brazier[] = [
  // Enchanted Forest
  { id: 1, x: 600, y: 600, lit: false, litAt: 0 },
  { id: 2, x: 1400, y: 350, lit: false, litAt: 0 },
  { id: 3, x: 2150, y: 850, lit: false, litAt: 0 },
  // Crystal Cave (id 4 stands at the biome boundary as a landmark)
  { id: 4, x: 2450, y: 600, lit: false, litAt: 0 },
  { id: 5, x: 3300, y: 450, lit: false, litAt: 0 },
  { id: 6, x: 4150, y: 800, lit: false, litAt: 0 },
];

// Entity colors (spec/03-reference.md §3).
const CRYSTAL_COLOR: Rgb = [140, 235, 255];
const FLAME_CORE_COLOR: Rgb = [150, 170, 255];
const FLAME_TIP_COLOR: Rgb = [190, 120, 255];
// Player's own glow and the footprint particle share this color ("same family" per spec).
const PLAYER_COLOR: Rgb = [255, 240, 200];
const FOOTPRINT_COLOR: Rgb = PLAYER_COLOR;
const BURST_COLOR: Rgb = CRYSTAL_COLOR;
const FLOATING_TEXT_COLOR: Rgb = [220, 245, 255];

// Implementation choice: spec/02-game-design.md §4 only specifies "sine, ±4%, slow" for
// the player light pulse — no period is given in spec/03-reference.md.
const LIGHT_PULSE_PERIOD_MS = 3000;
const LIGHT_PULSE_AMPLITUDE = 0.04;

// Implementation choices below: spec/02-game-design.md §6-7 and §5 describe crystal bob,
// brazier ease-in, and per-kind particle motion only qualitatively (shape/direction/fade),
// so the exact sizes/speeds/timings are not present in the spec/03-reference.md CONFIG
// table and are chosen here.
const CRYSTAL_RADIUS = 10; // px — crystal glow radius
const CRYSTAL_BOB_AMPLITUDE = 8; // px
const CRYSTAL_BOB_PERIOD_MS = 2200; // ms per full bob cycle

// ~600ms is given in spec/02-game-design.md §7 prose (not in the CONFIG table).
const BRAZIER_LIGHT_EASE_MS = 600; // ms — ease-in duration for a brazier's light radius
const BRAZIER_EMBER_RADIUS = 4; // px — unlit brazier dim ember dot
const EMBER_COLOR: Rgb = [120, 70, 40];
const EMBER_ALPHA = 0.6;
const BRAZIER_GLOW_RADIUS = 20; // px — lit brazier core glow circle

const FOOTPRINT_PARTICLE_SIZE = 4; // px
const FOOTPRINT_RISE_SPEED = 14; // px/s — upward drift while fading

const BURST_PARTICLE_SIZE = 5; // px
const BURST_LIFETIME_MS = 700; // ms
const BURST_SPEED_MIN = 60; // px/s
const BURST_SPEED_MAX = 160; // px/s
const BURST_DRAG_RATE = 2.5; // 1/s — exponential velocity decay while fading

const FLAME_SPAWN_INTERVAL_MS = 130; // ms between flame particles per lit brazier
const FLAME_PARTICLE_SIZE = 4; // px
const FLAME_LIFETIME_MS = 650; // ms
const FLAME_RISE_SPEED = 45; // px/s
const FLAME_SWAY_SPEED = 8; // px/s — horizontal flicker

const AMBIENT_PARTICLE_SIZE = 3; // px
const AMBIENT_LIFETIME_MS = 9000; // ms
const AMBIENT_DRIFT_SPEED = 12; // px/s

const FLOATING_TEXT_RISE_PX = 40; // px risen over CONFIG.floatingTextDurationMs

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

    const lightCanvas = document.createElement("canvas");
    const lightCtx = lightCanvas.getContext("2d");
    if (!lightCtx) return;

    const player = { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y };
    const camera = { x: 0, y: 0 };
    const keys = new Set<string>();
    const particles: Particle[] = [];
    const floatingTexts: FloatingText[] = [];
    const lastFlameSpawnAt = new Map<number, number>();
    let lastFootprintSpawnAt = 0;
    let viewWidth = 0;
    let viewHeight = 0;
    let lastTime = 0;
    let rafId = 0;
    let previousBiome = biomeIdAt(PLAYER_SPAWN.x, CONFIG.biomeBoundaryX);

    function handleResize() {
      if (!wrapper || !canvas || !ctx || !lightCtx) return;
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = wrapper;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lightCanvas.width = clientWidth * dpr;
      lightCanvas.height = clientHeight * dpr;
      lightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewWidth = clientWidth;
      viewHeight = clientHeight;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (gameState.isMenuOpen) return;
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

    function canSpawnParticle() {
      return particles.length < CONFIG.maxParticles;
    }

    function spawnFootprintParticle(now: number, isMoving: boolean) {
      if (!isMoving) return;
      if (now - lastFootprintSpawnAt < CONFIG.particleSpawnInterval) return;
      lastFootprintSpawnAt = now;
      if (!canSpawnParticle()) return;
      particles.push({
        x: player.x,
        y: player.y + CONFIG.playerRadius * 0.6,
        vx: 0,
        vy: -FOOTPRINT_RISE_SPEED,
        bornAt: now,
        lifetimeMs: CONFIG.particleLifetimeMs,
        size: FOOTPRINT_PARTICLE_SIZE,
        color: FOOTPRINT_COLOR,
        kind: "footprint",
      });
    }

    function spawnBurst(x: number, y: number, now: number) {
      for (let i = 0; i < CONFIG.burstParticleCount; i++) {
        if (!canSpawnParticle()) break;
        const angle = Math.random() * Math.PI * 2;
        const speed =
          BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          bornAt: now,
          lifetimeMs: BURST_LIFETIME_MS,
          size: BURST_PARTICLE_SIZE,
          color: BURST_COLOR,
          kind: "burst",
        });
      }
    }

    function spawnFlameParticles(now: number) {
      for (const brazier of BRAZIERS) {
        if (!brazier.lit) continue;
        const last = lastFlameSpawnAt.get(brazier.id) ?? 0;
        if (now - last < FLAME_SPAWN_INTERVAL_MS) continue;
        lastFlameSpawnAt.set(brazier.id, now);
        if (!canSpawnParticle()) continue;
        particles.push({
          x: brazier.x,
          y: brazier.y,
          vx: (Math.random() - 0.5) * FLAME_SWAY_SPEED,
          vy: -FLAME_RISE_SPEED,
          bornAt: now,
          lifetimeMs: FLAME_LIFETIME_MS,
          size: FLAME_PARTICLE_SIZE,
          color: FLAME_CORE_COLOR,
          kind: "flame",
        });
      }
    }

    function createAmbientParticle(now: number): Particle {
      const blend = biomeBlendAt(
        player.x,
        CONFIG.biomeBoundaryX,
        CONFIG.biomeBlendWidth,
      );
      return {
        x: camera.x + Math.random() * viewWidth,
        y: camera.y + Math.random() * viewHeight,
        vx: (Math.random() - 0.5) * AMBIENT_DRIFT_SPEED,
        vy: (Math.random() - 0.5) * AMBIENT_DRIFT_SPEED,
        bornAt: now,
        lifetimeMs: AMBIENT_LIFETIME_MS,
        size: AMBIENT_PARTICLE_SIZE,
        color: lerpColor(
          BIOMES[0].ambientParticle,
          BIOMES[1].ambientParticle,
          blend,
        ),
        kind: "ambient",
      };
    }

    function updateParticles(dt: number, now: number) {
      const seconds = dt / 1000;
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        const age = now - particle.bornAt;
        if (age >= particle.lifetimeMs) {
          if (particle.kind === "ambient") {
            particles[i] = createAmbientParticle(now);
          } else {
            particles.splice(i, 1);
          }
          continue;
        }
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
        if (particle.kind === "burst") {
          const decay = Math.exp(-BURST_DRAG_RATE * seconds);
          particle.vx *= decay;
          particle.vy *= decay;
        }
      }
    }

    function updateFloatingTexts(now: number) {
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        if (now - floatingTexts[i].bornAt >= CONFIG.floatingTextDurationMs) {
          floatingTexts.splice(i, 1);
        }
      }
    }

    function updateCrystals(now: number) {
      for (const crystal of CRYSTALS) {
        if (crystal.collected) continue;
        if (
          isWithinRadius(
            player.x,
            player.y,
            crystal.x,
            crystal.y,
            CONFIG.crystalPickupRadius,
          )
        ) {
          crystal.collected = true;
          spawnBurst(crystal.x, crystal.y, now);
          floatingTexts.push({
            x: crystal.x,
            y: crystal.y,
            text: "+1",
            bornAt: now,
          });
          collectCrystal();
        }
      }
    }

    function updateBraziers(now: number) {
      for (const brazier of BRAZIERS) {
        if (brazier.lit) continue;
        if (
          isWithinRadius(
            player.x,
            player.y,
            brazier.x,
            brazier.y,
            CONFIG.brazierProximity,
          )
        ) {
          brazier.lit = true;
          brazier.litAt = now;
          lightBrazier();
        }
      }
    }

    function update(dt: number, now: number) {
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;

      const isMoving = dx !== 0 || dy !== 0;
      if (isMoving) {
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

      const nextBiome = biomeIdAt(player.x, CONFIG.biomeBoundaryX);
      if (nextBiome !== previousBiome) {
        previousBiome = nextBiome;
        setCurrentBiome(nextBiome);
      }

      updateCrystals(now);
      updateBraziers(now);
      spawnFootprintParticle(now, isMoving);
      spawnFlameParticles(now);
      updateParticles(dt, now);
      updateFloatingTexts(now);
    }

    function renderTiles(backgroundColor: string, tileAccentColor: string) {
      if (!ctx) return;
      const startCol = Math.floor(camera.x / CONFIG.tileSize);
      const endCol = Math.ceil((camera.x + viewWidth) / CONFIG.tileSize);
      const startRow = Math.floor(camera.y / CONFIG.tileSize);
      const endRow = Math.ceil((camera.y + viewHeight) / CONFIG.tileSize);

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          ctx.fillStyle =
            (col + row) % 2 === 0 ? backgroundColor : tileAccentColor;
          ctx.fillRect(
            col * CONFIG.tileSize,
            row * CONFIG.tileSize,
            CONFIG.tileSize,
            CONFIG.tileSize,
          );
        }
      }
    }

    function renderBraziers() {
      if (!ctx) return;
      for (const brazier of BRAZIERS) {
        if (!brazier.lit) {
          ctx.fillStyle = rgbaCss(EMBER_COLOR, EMBER_ALPHA);
          ctx.beginPath();
          ctx.arc(brazier.x, brazier.y, BRAZIER_EMBER_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        fillGlow(
          ctx,
          brazier.x,
          brazier.y,
          BRAZIER_GLOW_RADIUS,
          FLAME_CORE_COLOR,
        );
      }
    }

    function renderCrystals(now: number) {
      if (!ctx) return;
      for (const crystal of CRYSTALS) {
        if (crystal.collected) continue;
        const bobOffset =
          Math.sin(
            (now / CRYSTAL_BOB_PERIOD_MS) * Math.PI * 2 + crystal.phase,
          ) * CRYSTAL_BOB_AMPLITUDE;
        const y = crystal.y + bobOffset;
        fillGlow(ctx, crystal.x, y, CRYSTAL_RADIUS, CRYSTAL_COLOR);
      }
    }

    function renderParticles(now: number) {
      if (!ctx) return;
      for (const particle of particles) {
        const age = now - particle.bornAt;
        const lifeFraction = Math.min(1, age / particle.lifetimeMs);
        const color =
          particle.kind === "flame"
            ? lerpColor(FLAME_CORE_COLOR, FLAME_TIP_COLOR, lifeFraction)
            : particle.color;
        ctx.globalAlpha = Math.max(0, 1 - lifeFraction);
        ctx.fillStyle = rgbCss(color);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function renderFloatingTexts(now: number) {
      if (!ctx || floatingTexts.length === 0) return;
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = rgbCss(FLOATING_TEXT_COLOR);
      for (const text of floatingTexts) {
        const t = Math.min(
          1,
          (now - text.bornAt) / CONFIG.floatingTextDurationMs,
        );
        ctx.globalAlpha = 1 - t;
        ctx.fillText(text.text, text.x, text.y - FLOATING_TEXT_RISE_PX * t);
      }
      ctx.globalAlpha = 1;
    }

    function renderPlayer() {
      if (!ctx) return;
      fillGlow(ctx, player.x, player.y, CONFIG.playerRadius, PLAYER_COLOR);
    }

    // Darkens the screen and punches soft holes around light sources (spec/02-game-design.md §4).
    function renderLighting(now: number) {
      if (!lightCtx) return;
      lightCtx.clearRect(0, 0, viewWidth, viewHeight);
      lightCtx.globalCompositeOperation = "source-over";
      lightCtx.fillStyle = `rgba(0, 0, 0, ${CONFIG.darknessAlpha})`;
      lightCtx.fillRect(0, 0, viewWidth, viewHeight);

      lightCtx.globalCompositeOperation = "destination-out";

      const pulse =
        1 +
        LIGHT_PULSE_AMPLITUDE *
          Math.sin((now / LIGHT_PULSE_PERIOD_MS) * Math.PI * 2);
      const coreRadius = CONFIG.lightRadius * pulse;
      const outerRadius = coreRadius + CONFIG.lightSoftness;
      punchLightHole(
        lightCtx,
        player.x - camera.x,
        player.y - camera.y,
        coreRadius,
        outerRadius,
      );

      for (const brazier of BRAZIERS) {
        if (!brazier.lit) continue;
        const easeT = Math.min(
          1,
          (now - brazier.litAt) / BRAZIER_LIGHT_EASE_MS,
        );
        const eased = 1 - (1 - easeT) * (1 - easeT); // ease-out quad
        const brazierCoreRadius = CONFIG.brazierLightRadius * eased;
        if (brazierCoreRadius <= 0) continue;
        const brazierScreenX = brazier.x - camera.x;
        const brazierScreenY = brazier.y - camera.y;
        const brazierOuterRadius = brazierCoreRadius + CONFIG.lightSoftness;
        if (
          brazierScreenX + brazierOuterRadius < 0 ||
          brazierScreenX - brazierOuterRadius > viewWidth ||
          brazierScreenY + brazierOuterRadius < 0 ||
          brazierScreenY - brazierOuterRadius > viewHeight
        ) {
          continue;
        }
        punchLightHole(
          lightCtx,
          brazierScreenX,
          brazierScreenY,
          brazierCoreRadius,
          brazierOuterRadius,
        );
      }

      lightCtx.globalCompositeOperation = "source-over";
    }

    function render(now: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, viewWidth, viewHeight);

      const blend = biomeBlendAt(
        player.x,
        CONFIG.biomeBoundaryX,
        CONFIG.biomeBlendWidth,
      );
      const backgroundColor = rgbCss(
        lerpColor(BIOMES[0].background, BIOMES[1].background, blend),
      );
      const tileAccentColor = rgbCss(
        lerpColor(BIOMES[0].tileAccent, BIOMES[1].tileAccent, blend),
      );

      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      renderTiles(backgroundColor, tileAccentColor);
      renderParticles(now);
      renderBraziers();
      renderCrystals(now);
      renderPlayer();
      renderFloatingTexts(now);
      ctx.restore();

      renderLighting(now);
      ctx.drawImage(lightCanvas, 0, 0, viewWidth, viewHeight);
    }

    function loop(now: number) {
      rafId = requestAnimationFrame(loop);
      const dt = clampDelta(now - lastTime, CONFIG.maxDeltaMs);
      lastTime = now;
      const menuOpen = gameState.isMenuOpen;
      // Clear held keys while the menu is open so the Dialog's focus trap
      // can never leave a stuck key that resumes movement once it closes.
      if (menuOpen) keys.clear();
      else update(dt, now);
      render(now);
    }

    handleResize();
    camera.x = updateCameraAxis(player.x, viewWidth, CONFIG.worldWidth);
    camera.y = updateCameraAxis(player.y, viewHeight, CONFIG.worldHeight);
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    lastTime = performance.now();
    for (let i = 0; i < CONFIG.ambientParticleCount; i++) {
      particles.push(createAmbientParticle(lastTime));
    }
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
