import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronUp from "lucide-solid/icons/chevron-up";
import { onCleanup, onMount } from "solid-js";
import {
  drawSprite,
  loadSprites,
  SPRITE_DEFS,
  type SpriteDef,
  type SpriteMap,
} from "./assets";
import * as audio from "./audio";
import styles from "./Game.module.css";
import {
  biomeBlendAt,
  biomeIdAt,
  clampDelta,
  distSq,
  isWithinRadius,
  lerpColor,
  proximityGlow01,
} from "./gameLogic";
import type { Rgb } from "./gameStore";
import {
  BIOMES,
  collectCrystal,
  discoverInscription,
  gameState,
  INSCRIPTIONS,
  lightBrazier,
  setCurrentBiome,
} from "./gameStore";
import { persistence, type SaveDataV1 } from "./persistence";

// Lookup by key so render functions can fetch a sprite's draw size/anchor in O(1)
// (spec/03-reference.md §7 — SPRITE_DEFS is the single manifest, this is just an index of it).
const SPRITE_DEFS_BY_KEY = Object.fromEntries(
  SPRITE_DEFS.map((def) => [def.key, def]),
) as Record<SpriteDef["key"], SpriteDef>;

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

interface Wisp {
  x: number;
  y: number;
  heading: number; // radians; current drift direction, turns smoothly
  phase: number; // radians; per-wisp offset for drift variation
  speed: number; // px/s; current speed, eases toward wander/follow target
}

interface GlowPlant {
  id: number;
  x: number;
  y: number;
}

// reduced-motion stand-in for the crystal pickup burst (spec/02-game-design.md §9):
// a single expanding ring stroke instead of particles.
interface Ring {
  x: number;
  y: number;
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

// Shared "1 ± amplitude·sin" oscillation used by both the brazier flame flicker and the
// player light pulse — kept local to this file rather than gameLogic.ts, whose exported
// function set is fixed by spec/03-reference.md §6.
function pulseFactor(now: number, periodMs: number, amplitude: number): number {
  return 1 + amplitude * Math.sin((now / periodMs) * Math.PI * 2);
}

// Clamped 0..1 progress since `bornAt`, used by every fade/ease timer below.
function progressRatio(
  bornAt: number,
  now: number,
  durationMs: number,
): number {
  return Math.min(1, (now - bornAt) / durationMs);
}

function hasExpired(bornAt: number, now: number, durationMs: number): boolean {
  return now - bornAt >= durationMs;
}

// Shared backward-iterate-and-splice pattern for any bornAt-timed collection
// (floating texts, rings — see call sites in update()).
function removeExpired<T extends { bornAt: number }>(
  items: T[],
  now: number,
  durationMs: number,
) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (hasExpired(items[i].bornAt, now, durationMs)) {
      items.splice(i, 1);
    }
  }
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
  wispCount: 5, // count — resident wisp count
  wispNoticeRadius: 160, // px — distance at which a wisp notices the player
  wispFollowSpeed: 40, // px/s — wisp speed while following
  wispWanderSpeed: 18, // px/s — wisp speed while wandering
  plantGlowInnerRadius: 40, // px — distance within which a glow plant is at max brightness
  plantGlowOuterRadius: 140, // px — distance beyond which a glow plant's brightness bottoms out
  plantGlowFloor: 0.15, // 0-1 — glow plant's minimum brightness (never fully dark)
  inscriptionProximity: 60, // px — distance at which inscription text appears
  inscriptionTextDurationMs: 4000, // ms — inscription text display duration
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

const PLANTS: GlowPlant[] = [
  // Enchanted Forest (x < 2400)
  { id: 1, x: 520, y: 470 },
  { id: 2, x: 760, y: 700 },
  { id: 3, x: 980, y: 940 },
  { id: 4, x: 1250, y: 330 },
  { id: 5, x: 1560, y: 760 },
  { id: 6, x: 1840, y: 520 },
  { id: 7, x: 2230, y: 940 },
  // Crystal Cave (x >= 2400)
  { id: 8, x: 2550, y: 860 },
  { id: 9, x: 2900, y: 420 },
  { id: 10, x: 3450, y: 620 },
  { id: 11, x: 3900, y: 940 },
  { id: 12, x: 4380, y: 360 },
];

// Applies a loaded save's collected/lit ids to the world arrays (spec/01-architecture.md
// §10). Restored braziers skip the light-radius ease-in entirely (spec/02-game-design.md
// §11) by backdating litAt far enough that progressRatio always reads as complete.
function restoreProgress(save: SaveDataV1 | null) {
  if (!save) return;
  const collectedIds = new Set(save.collectedCrystalIds);
  const litIds = new Set(save.litBrazierIds);
  for (const crystal of CRYSTALS) {
    if (collectedIds.has(crystal.id)) {
      crystal.collected = true;
    }
  }
  for (const brazier of BRAZIERS) {
    if (litIds.has(brazier.id)) {
      brazier.lit = true;
      brazier.litAt = -Infinity;
    }
  }
}

// Wisps have no spec/03-reference.md placement list (unlike crystals/braziers/plants) —
// only CONFIG.wispCount is specified, so starting positions are randomized at mount,
// consistent with how ambient particles are spawned (spec/02-game-design.md §13.1).
function createWisps(count: number): Wisp[] {
  const wisps: Wisp[] = [];
  for (let i = 0; i < count; i++) {
    wisps.push({
      x: Math.random() * CONFIG.worldWidth,
      y: Math.random() * CONFIG.worldHeight,
      heading: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      speed: CONFIG.wispWanderSpeed,
    });
  }
  return wisps;
}

const TWO_PI = Math.PI * 2;

// Shortest-path angle difference, normalized to [-PI, PI].
function angleDiff(from: number, to: number): number {
  const wrapped = (((to - from + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI;
  return wrapped - Math.PI;
}

// Entity colors (spec/03-reference.md §3).
const CRYSTAL_COLOR: Rgb = [140, 235, 255];
const FLAME_CORE_COLOR: Rgb = [150, 170, 255];
const FLAME_TIP_COLOR: Rgb = [190, 120, 255];
// Player's own glow and the footprint particle share this color ("same family" per spec).
const PLAYER_COLOR: Rgb = [255, 240, 200];
const FOOTPRINT_COLOR: Rgb = PLAYER_COLOR;
const BURST_COLOR: Rgb = CRYSTAL_COLOR;
const FLOATING_TEXT_COLOR: Rgb = [220, 245, 255];
const PLANT_COLOR_FOREST: Rgb = [150, 230, 150];
const PLANT_COLOR_CAVE: Rgb = [180, 150, 255];
const INSCRIPTION_STONE_COLOR: Rgb = [120, 130, 160];

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
// Precomputed once: this fixed-color fillStyle would otherwise be rebuilt from the same
// constant every frame for every unlit brazier.
const EMBER_COLOR_CSS = rgbaCss(EMBER_COLOR, EMBER_ALPHA);
const BRAZIER_GLOW_RADIUS = 20; // px — lit brazier core glow circle
// Flicker on the core glow only (spec/02-game-design.md §9 row "brazier flame": normal =
// flicker, reduced-motion = steady glow). Disabled entirely under reduced motion.
const BRAZIER_FLICKER_PERIOD_MS = 220;
const BRAZIER_FLICKER_AMPLITUDE = 0.15;

// reduced-motion pickup ring (spec/02-game-design.md §9): sizes/timing not in
// spec/03-reference.md CONFIG, chosen here to read clearly as a single pulse.
const RING_DURATION_MS = 500;
const RING_START_RADIUS = CRYSTAL_RADIUS;
const RING_END_RADIUS = 48;
const RING_LINE_WIDTH = 2;
// Precomputed once: BURST_COLOR is a fixed constant, no need to re-templatize it per ring.
const RING_COLOR_CSS = rgbCss(BURST_COLOR);

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

// Implementation choices below: spec/02-game-design.md §13.1 describes wisp drift and
// follow qualitatively only ("no sudden movement") — the exact wander shape and turn
// rate are not present in spec/03-reference.md CONFIG and are chosen here.
const WISP_RADIUS = 6; // px — wisp glow radius
// Stand-off distance kept while following, so a noticed wisp hovers near the player
// instead of converging onto them (spec/02-game-design.md §13.1: "付かず離れず").
const WISP_HOVER_RADIUS = 40; // px
// Max heading change per second, applied whether wandering or following, so the
// wander-to-follow transition itself never produces a sudden turn either.
const WISP_TURN_RATE_RAD_PER_SEC = 1.2;
// While wandering, the target heading itself revolves slowly and continuously (offset
// per-wisp by `phase`) rather than jumping between random targets — this is what makes
// the drift "turn smoothly" by construction, with no discrete decision points.
const WISP_WANDER_ANGULAR_SPEED_RAD_PER_SEC = 0.5;
// Max speed change per second, mirroring the turn-rate cap above so the wander/follow
// transition eases in speed as well as heading — neither jumps ("急加速・急旋回はしない").
const WISP_ACCEL_PX_PER_SEC2 = 30;

// Procedural fallback for the inscription stone (spec/03-reference.md §7: "石碑の縦長
// ラウンド矩形"). Not in the halo-maintenance list (spec/02-game-design.md §10) — no glow.
const INSCRIPTION_STONE_WIDTH = 20; // px
const INSCRIPTION_STONE_HEIGHT = 40; // px
const INSCRIPTION_STONE_CORNER_RADIUS = 6; // px

const PLANT_GLOW_RADIUS = 8; // px — glow plant procedural glow radius

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
  // Plain mutable object, not a Signal (spec/01-architecture.md §3.1) — read by the
  // rAF loop's input merge, written by the D-pad buttons' pointer handlers below.
  const dpad = { up: false, down: false, left: false, right: false };

  function dpadHandlers(direction: keyof typeof dpad) {
    const set = (pressed: boolean) => {
      dpad[direction] = pressed;
    };
    return {
      onPointerDown: () => set(true),
      onPointerUp: () => set(false),
      onPointerCancel: () => set(false),
      onPointerLeave: () => set(false),
    };
  }

  onMount(() => {
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lightCanvas = document.createElement("canvas");
    const lightCtx = lightCanvas.getContext("2d");
    if (!lightCtx) return;

    restoreProgress(persistence.initial);

    const player = { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y };
    const camera = { x: 0, y: 0 };
    const keys = new Set<string>();
    const particles: Particle[] = [];
    // Kept in sync with the "ambient" particles in `particles` so topUpAmbientParticles
    // doesn't have to rescan the whole (up to CONFIG.maxParticles) array every frame.
    let liveAmbientCount = 0;
    const floatingTexts: FloatingText[] = [];
    const inscriptionTexts: FloatingText[] = [];
    // Edge-trigger state (spec/02-game-design.md §13.3): which inscriptions the player is
    // currently standing near, so re-entering proximity re-shows the text.
    const inscriptionsInRange = new Set<number>();
    const rings: Ring[] = [];
    const wisps = createWisps(CONFIG.wispCount);
    const lastFlameSpawnAt = new Map<number, number>();
    let lastFootprintSpawnAt = 0;
    let viewWidth = 0;
    let viewHeight = 0;
    let lastTime = 0;
    let rafId = 0;
    let previousBiome = biomeIdAt(PLAYER_SPAWN.x, CONFIG.biomeBoundaryX);
    // Computed once per frame in update() and read by both audio and render (avoids
    // calling biomeBlendAt(player.x, ...) twice for the same frame).
    let currentBiomeBlend = biomeBlendAt(
      PLAYER_SPAWN.x,
      CONFIG.biomeBoundaryX,
      CONFIG.biomeBlendWidth,
    );
    // Plain module-local object, not a Signal (spec/01-architecture.md §3.1). Populated
    // progressively as loadSprites resolves each image; render functions fall back to
    // procedural drawing until a given key's entry appears.
    const sprites: SpriteMap = {};

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

    // AudioContext creation/resume must happen inside a user-gesture handler, otherwise
    // browsers leave it suspended (spec/01-architecture.md §9).
    function handleFirstGesture() {
      audio.init();
      audio.setMuted(gameState.audioMuted);
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
      // reduced-motion (spec/02-game-design.md §9): footprint particles disabled entirely.
      if (gameState.reducedMotion) return;
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
      // reduced-motion (spec/02-game-design.md §9): flame particles disabled, steady glow only.
      if (gameState.reducedMotion) return;
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

    // reduced-motion (spec/02-game-design.md §9): ambient particles disabled. Existing ones
    // are left to expire naturally (updateParticles below) rather than force-removed.
    function topUpAmbientParticles(now: number) {
      if (gameState.reducedMotion) return;
      while (
        liveAmbientCount < CONFIG.ambientParticleCount &&
        canSpawnParticle()
      ) {
        particles.push(createAmbientParticle(now));
        liveAmbientCount++;
      }
    }

    function updateParticles(dt: number, now: number) {
      const seconds = dt / 1000;
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        const age = now - particle.bornAt;
        if (age >= particle.lifetimeMs) {
          if (particle.kind === "ambient") liveAmbientCount--;
          particles.splice(i, 1);
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
          // reduced-motion (spec/02-game-design.md §9): a single expanding ring stroke
          // replaces the burst particles, keeping the pickup feedback.
          if (gameState.reducedMotion) {
            rings.push({ x: crystal.x, y: crystal.y, bornAt: now });
          } else {
            spawnBurst(crystal.x, crystal.y, now);
          }
          floatingTexts.push({
            x: crystal.x,
            y: crystal.y,
            text: "+1",
            bornAt: now,
          });
          collectCrystal();
          persistence.markCrystalCollected(crystal.id);
          audio.playCollectChime();
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
          persistence.markBrazierLit(brazier.id);
          audio.playBrazierSwell();
        }
      }
    }

    // reduced-motion (spec/02-game-design.md §9): wisps are disabled entirely — update and
    // render both stop, same treatment as ambient particles.
    function updateWisps(dt: number, now: number) {
      if (gameState.reducedMotion) return;
      const seconds = dt / 1000;
      const maxTurn = WISP_TURN_RATE_RAD_PER_SEC * seconds;
      for (const wisp of wisps) {
        const distanceSq = distSq(player.x, player.y, wisp.x, wisp.y);
        // "付かず離れず" (spec/02-game-design.md §13.1): a noticed wisp heads straight at the
        // player only outside the hover distance; once within it, it stops closing the gap
        // and drifts locally instead of landing on the player.
        const closingIn =
          distanceSq > WISP_HOVER_RADIUS * WISP_HOVER_RADIUS &&
          distanceSq <= CONFIG.wispNoticeRadius * CONFIG.wispNoticeRadius;
        const desiredHeading = closingIn
          ? Math.atan2(player.y - wisp.y, player.x - wisp.x)
          : wisp.phase + (now / 1000) * WISP_WANDER_ANGULAR_SPEED_RAD_PER_SEC;
        const diff = angleDiff(wisp.heading, desiredHeading);
        wisp.heading +=
          Math.abs(diff) < maxTurn ? diff : Math.sign(diff) * maxTurn;
        const targetSpeed = closingIn
          ? CONFIG.wispFollowSpeed
          : CONFIG.wispWanderSpeed;
        const maxAccel = WISP_ACCEL_PX_PER_SEC2 * seconds;
        const speedDiff = targetSpeed - wisp.speed;
        wisp.speed +=
          Math.abs(speedDiff) < maxAccel
            ? speedDiff
            : Math.sign(speedDiff) * maxAccel;
        wisp.x += Math.cos(wisp.heading) * wisp.speed * seconds;
        wisp.y += Math.sin(wisp.heading) * wisp.speed * seconds;
        wisp.x = Math.min(
          Math.max(wisp.x, WISP_RADIUS),
          CONFIG.worldWidth - WISP_RADIUS,
        );
        wisp.y = Math.min(
          Math.max(wisp.y, WISP_RADIUS),
          CONFIG.worldHeight - WISP_RADIUS,
        );
      }
    }

    // Edge-triggered proximity text (spec/02-game-design.md §13.3): shows on entering
    // range, re-shows on re-entering after leaving. Discovery (store + save + bell) fires
    // only the first time a given inscription is ever entered.
    function updateInscriptions(now: number) {
      for (const inscription of INSCRIPTIONS) {
        const inRange = isWithinRadius(
          player.x,
          player.y,
          inscription.x,
          inscription.y,
          CONFIG.inscriptionProximity,
        );
        const wasInRange = inscriptionsInRange.has(inscription.id);
        if (!inRange) {
          if (wasInRange) inscriptionsInRange.delete(inscription.id);
          continue;
        }
        if (wasInRange) continue;
        inscriptionsInRange.add(inscription.id);
        inscriptionTexts.push({
          x: inscription.x,
          y: inscription.y,
          text: inscription.text,
          bornAt: now,
        });
        if (!gameState.discoveredInscriptionIds.includes(inscription.id)) {
          discoverInscription(inscription.id);
          persistence.markInscriptionDiscovered(inscription.id);
          audio.playInscriptionBell();
        }
      }
    }

    function update(dt: number, now: number) {
      let dx = 0;
      let dy = 0;
      // Keyboard and D-pad are OR-merged every frame (spec/02-game-design.md §3) so either
      // input source produces identical movement.
      if (keys.has("ArrowUp") || keys.has("KeyW") || dpad.up) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS") || dpad.down) dy += 1;
      if (keys.has("ArrowLeft") || keys.has("KeyA") || dpad.left) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD") || dpad.right) dx += 1;

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
      currentBiomeBlend = biomeBlendAt(
        player.x,
        CONFIG.biomeBoundaryX,
        CONFIG.biomeBlendWidth,
      );
      // Same coefficient as the color lerp (spec/02-game-design.md §12); the crossfade
      // throttle lives inside audio.setBiomeBlend, so calling it every frame is fine.
      audio.setBiomeBlend(currentBiomeBlend);

      updateCrystals(now);
      updateBraziers(now);
      updateWisps(dt, now);
      updateInscriptions(now);
      spawnFootprintParticle(now, isMoving);
      spawnFlameParticles(now);
      topUpAmbientParticles(now);
      updateParticles(dt, now);
      removeExpired(floatingTexts, now, CONFIG.floatingTextDurationMs);
      removeExpired(inscriptionTexts, now, CONFIG.inscriptionTextDurationMs);
      removeExpired(rings, now, RING_DURATION_MS);
    }

    function renderTiles(backgroundColor: string, tileAccentColor: string) {
      if (!ctx) return;
      const startCol = Math.floor(camera.x / CONFIG.tileSize);
      const endCol = Math.ceil((camera.x + viewWidth) / CONFIG.tileSize);
      const startRow = Math.floor(camera.y / CONFIG.tileSize);
      const endRow = Math.ceil((camera.y + viewHeight) / CONFIG.tileSize);

      // Tiles are all-or-nothing (spec/02-game-design.md §10): both textures must be
      // present, otherwise the whole grid falls back to the procedural checkerboard.
      const forestTile = sprites.tileForest;
      const caveTile = sprites.tileCave;
      if (forestTile && caveTile) {
        const forestDef = SPRITE_DEFS_BY_KEY.tileForest;
        const caveDef = SPRITE_DEFS_BY_KEY.tileCave;
        for (let row = startRow; row < endRow; row++) {
          for (let col = startCol; col < endCol; col++) {
            const tileX = col * CONFIG.tileSize;
            const tileY = row * CONFIG.tileSize;
            drawSprite(ctx, forestTile, forestDef, tileX, tileY);
            // Cross-fade band across the biome boundary, same coefficient as the color lerp.
            const blend = biomeBlendAt(
              tileX,
              CONFIG.biomeBoundaryX,
              CONFIG.biomeBlendWidth,
            );
            if (blend > 0) {
              ctx.globalAlpha = blend;
              drawSprite(ctx, caveTile, caveDef, tileX, tileY);
              ctx.globalAlpha = 1;
            }
          }
        }
        return;
      }

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

    function renderBraziers(now: number) {
      if (!ctx) return;
      const unlitSprite = sprites.brazierUnlit;
      const litSprite = sprites.brazierLit;
      for (const brazier of BRAZIERS) {
        if (!brazier.lit) {
          // Unlit is the one halo exception (spec/02-game-design.md §10): the sprite is
          // drawn as-is with no added glow, its dimness is the asset's own job.
          if (unlitSprite) {
            drawSprite(
              ctx,
              unlitSprite,
              SPRITE_DEFS_BY_KEY.brazierUnlit,
              brazier.x,
              brazier.y,
            );
          } else {
            ctx.fillStyle = EMBER_COLOR_CSS;
            ctx.beginPath();
            ctx.arc(brazier.x, brazier.y, BRAZIER_EMBER_RADIUS, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        // reduced-motion (spec/02-game-design.md §9): steady glow, no flicker. Flicker
        // applies to the glow radius only — the sprite itself never scales (§10).
        const flicker = gameState.reducedMotion
          ? 1
          : pulseFactor(
              now,
              BRAZIER_FLICKER_PERIOD_MS,
              BRAZIER_FLICKER_AMPLITUDE,
            );
        fillGlow(
          ctx,
          brazier.x,
          brazier.y,
          BRAZIER_GLOW_RADIUS * flicker,
          FLAME_CORE_COLOR,
        );
        // Halo maintained behind the sprite (spec/02-game-design.md §10).
        if (litSprite) {
          drawSprite(
            ctx,
            litSprite,
            SPRITE_DEFS_BY_KEY.brazierLit,
            brazier.x,
            brazier.y,
          );
        }
      }
    }

    function renderCrystals(now: number) {
      if (!ctx) return;
      const sprite = sprites.crystal;
      for (const crystal of CRYSTALS) {
        if (crystal.collected) continue;
        // reduced-motion (spec/02-game-design.md §9): bob frozen at its phase position.
        const bobPhase = gameState.reducedMotion
          ? crystal.phase
          : (now / CRYSTAL_BOB_PERIOD_MS) * Math.PI * 2 + crystal.phase;
        const y = crystal.y + Math.sin(bobPhase) * CRYSTAL_BOB_AMPLITUDE;
        // Halo maintained behind the sprite (spec/02-game-design.md §10).
        fillGlow(ctx, crystal.x, y, CRYSTAL_RADIUS, CRYSTAL_COLOR);
        if (sprite) {
          drawSprite(ctx, sprite, SPRITE_DEFS_BY_KEY.crystal, crystal.x, y);
        }
      }
    }

    // Brightness scales with player proximity (spec/02-game-design.md §13.2); stays fully
    // active under reduced-motion (§9 — a position-dependent state, not an animation).
    // Halo maintained behind the sprite: brightness is carried by the halo's alpha only,
    // same precedent as the brazier flicker (auxiliary property changes, sprite stays put).
    function renderPlants() {
      if (!ctx) return;
      for (const plant of PLANTS) {
        const isForest =
          biomeIdAt(plant.x, CONFIG.biomeBoundaryX) === "enchantedForest";
        const color = isForest ? PLANT_COLOR_FOREST : PLANT_COLOR_CAVE;
        const spriteKey = isForest ? "plantForest" : "plantCave";
        const brightness =
          CONFIG.plantGlowFloor +
          (1 - CONFIG.plantGlowFloor) *
            proximityGlow01(
              distSq(player.x, player.y, plant.x, plant.y),
              CONFIG.plantGlowInnerRadius,
              CONFIG.plantGlowOuterRadius,
            );
        ctx.globalAlpha = brightness;
        fillGlow(ctx, plant.x, plant.y, PLANT_GLOW_RADIUS, color);
        ctx.globalAlpha = 1;
        const sprite = sprites[spriteKey];
        if (sprite) {
          drawSprite(
            ctx,
            sprite,
            SPRITE_DEFS_BY_KEY[spriteKey],
            plant.x,
            plant.y,
          );
        }
      }
    }

    // Always procedural — wisps are sprite-exempt (spec/02-game-design.md §10). reduced-
    // motion (§9): disabled entirely, same as ambient particles (update already skipped).
    function renderWisps() {
      if (!ctx) return;
      if (gameState.reducedMotion) return;
      for (const wisp of wisps) {
        const blend = biomeBlendAt(
          wisp.x,
          CONFIG.biomeBoundaryX,
          CONFIG.biomeBlendWidth,
        );
        const color = lerpColor(
          BIOMES[0].ambientParticle,
          BIOMES[1].ambientParticle,
          blend,
        );
        fillGlow(ctx, wisp.x, wisp.y, WISP_RADIUS, color);
      }
    }

    // reduced-motion (spec/02-game-design.md §9) stand-in for the crystal pickup burst.
    function renderRings(now: number) {
      if (!ctx) return;
      for (const ring of rings) {
        const t = progressRatio(ring.bornAt, now, RING_DURATION_MS);
        const radius =
          RING_START_RADIUS + (RING_END_RADIUS - RING_START_RADIUS) * t;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = RING_COLOR_CSS;
        ctx.lineWidth = RING_LINE_WIDTH;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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

    // Shared by the "+1" pickup text and the inscription poem text — both rise-while-
    // fading normally and fade-in-place under reduced-motion (spec/02-game-design.md §9,
    // the "碑文テキスト" row explicitly reuses the "+1" rule).
    function renderFloatingTexts(
      texts: readonly FloatingText[],
      now: number,
      durationMs: number,
    ) {
      if (!ctx || texts.length === 0) return;
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = rgbCss(FLOATING_TEXT_COLOR);
      // reduced-motion (spec/02-game-design.md §9): fades in place, no rise.
      const rise = gameState.reducedMotion ? 0 : FLOATING_TEXT_RISE_PX;
      for (const text of texts) {
        const t = progressRatio(text.bornAt, now, durationMs);
        ctx.globalAlpha = 1 - t;
        ctx.fillText(text.text, text.x, text.y - rise * t);
      }
      ctx.globalAlpha = 1;
    }

    // Stone is visible whether or not the inscription has been discovered yet (spec/
    // 02-game-design.md §13.3). Not in the halo-maintenance list (§10) — no glow.
    function renderInscriptions() {
      if (!ctx) return;
      const sprite = sprites.inscription;
      ctx.fillStyle = rgbCss(INSCRIPTION_STONE_COLOR);
      for (const inscription of INSCRIPTIONS) {
        if (sprite) {
          drawSprite(
            ctx,
            sprite,
            SPRITE_DEFS_BY_KEY.inscription,
            inscription.x,
            inscription.y,
          );
          continue;
        }
        ctx.beginPath();
        ctx.roundRect(
          inscription.x - INSCRIPTION_STONE_WIDTH / 2,
          inscription.y - INSCRIPTION_STONE_HEIGHT,
          INSCRIPTION_STONE_WIDTH,
          INSCRIPTION_STONE_HEIGHT,
          INSCRIPTION_STONE_CORNER_RADIUS,
        );
        ctx.fill();
      }
    }

    function renderPlayer() {
      if (!ctx) return;
      // Halo maintained behind the sprite (spec/02-game-design.md §10).
      fillGlow(ctx, player.x, player.y, CONFIG.playerRadius, PLAYER_COLOR);
      const sprite = sprites.player;
      if (sprite) {
        drawSprite(ctx, sprite, SPRITE_DEFS_BY_KEY.player, player.x, player.y);
      }
    }

    // Darkens the screen and punches soft holes around light sources (spec/02-game-design.md §4).
    function renderLighting(now: number) {
      if (!lightCtx) return;
      lightCtx.clearRect(0, 0, viewWidth, viewHeight);
      lightCtx.globalCompositeOperation = "source-over";
      lightCtx.fillStyle = `rgba(0, 0, 0, ${CONFIG.darknessAlpha})`;
      lightCtx.fillRect(0, 0, viewWidth, viewHeight);

      lightCtx.globalCompositeOperation = "destination-out";

      // reduced-motion (spec/02-game-design.md §9): fixed radius, no pulse.
      const pulse = gameState.reducedMotion
        ? 1
        : pulseFactor(now, LIGHT_PULSE_PERIOD_MS, LIGHT_PULSE_AMPLITUDE);
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
        const easeT = progressRatio(brazier.litAt, now, BRAZIER_LIGHT_EASE_MS);
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

      const blend = currentBiomeBlend;
      const backgroundColor = rgbCss(
        lerpColor(BIOMES[0].background, BIOMES[1].background, blend),
      );
      const tileAccentColor = rgbCss(
        lerpColor(BIOMES[0].tileAccent, BIOMES[1].tileAccent, blend),
      );

      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      renderTiles(backgroundColor, tileAccentColor);
      renderPlants();
      renderInscriptions();
      renderParticles(now);
      renderRings(now);
      renderBraziers(now);
      renderCrystals(now);
      renderWisps();
      renderPlayer();
      renderFloatingTexts(floatingTexts, now, CONFIG.floatingTextDurationMs);
      renderFloatingTexts(
        inscriptionTexts,
        now,
        CONFIG.inscriptionTextDurationMs,
      );
      ctx.restore();

      renderLighting(now);
      ctx.drawImage(lightCanvas, 0, 0, viewWidth, viewHeight);
    }

    function loop(now: number) {
      rafId = requestAnimationFrame(loop);
      const dt = clampDelta(now - lastTime, CONFIG.maxDeltaMs);
      lastTime = now;
      const menuOpen = gameState.isMenuOpen;
      // Clear held keys and D-pad flags while the menu is open so the Dialog's focus trap
      // can never leave a stuck input that resumes movement once it closes.
      if (menuOpen) {
        keys.clear();
        dpad.up = dpad.down = dpad.left = dpad.right = false;
      } else {
        update(dt, now);
      }
      render(now);
    }

    loadSprites(sprites);
    handleResize();
    camera.x = updateCameraAxis(player.x, viewWidth, CONFIG.worldWidth);
    camera.y = updateCameraAxis(player.y, viewHeight, CONFIG.worldHeight);
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("keydown", handleFirstGesture, { once: true });
    window.addEventListener("pointerdown", handleFirstGesture, {
      once: true,
    });
    lastTime = performance.now();
    topUpAmbientParticles(lastTime);
    rafId = requestAnimationFrame(loop);

    onCleanup(() => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("keydown", handleFirstGesture);
      window.removeEventListener("pointerdown", handleFirstGesture);
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
      <div class={styles.dpad}>
        <button
          type="button"
          class={`${styles.dpadButton} ${styles.dpadButtonUp}`}
          aria-label="Move up"
          {...dpadHandlers("up")}
        >
          <ChevronUp size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={`${styles.dpadButton} ${styles.dpadButtonLeft}`}
          aria-label="Move left"
          {...dpadHandlers("left")}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={`${styles.dpadButton} ${styles.dpadButtonRight}`}
          aria-label="Move right"
          {...dpadHandlers("right")}
        >
          <ChevronRight size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={`${styles.dpadButton} ${styles.dpadButtonDown}`}
          aria-label="Move down"
          {...dpadHandlers("down")}
        >
          <ChevronDown size={24} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default GameCanvas;
