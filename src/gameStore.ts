import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { detectReducedMotion } from "./gameLogic";
import { persistence, type SaveDataV1 } from "./persistence";

export type BiomeId = "enchantedForest" | "crystalCave";

export interface GameState {
  crystalsCollected: number;
  litBraziersCount: number;
  currentBiome: BiomeId;
  isMenuOpen: boolean;
  reducedMotion: boolean;
  discoveredInscriptionIds: readonly number[];
  audioMuted: boolean;
}

export type Rgb = readonly [number, number, number];

export interface Biome {
  id: BiomeId;
  name: string;
  startX: number;
  background: Rgb;
  tileAccent: Rgb;
  ambientParticle: Rgb;
  lightTint: Rgb;
}

export const BIOMES: readonly Biome[] = [
  {
    id: "enchantedForest",
    name: "Enchanted Forest",
    startX: 0,
    background: [18, 38, 32],
    tileAccent: [24, 48, 40],
    ambientParticle: [180, 230, 160],
    lightTint: [255, 240, 200],
  },
  {
    id: "crystalCave",
    name: "Crystal Cave",
    startX: 2400, // == CONFIG.biomeBoundaryX
    background: [22, 20, 44],
    tileAccent: [30, 28, 58],
    ambientParticle: [150, 210, 255],
    lightTint: [210, 225, 255],
  },
] as const;

// Derived constants, not state (spec/03-reference.md §4.6).
export const TOTAL_CRYSTALS = 14; // = CRYSTALS.length
export const TOTAL_BRAZIERS = 6; // = BRAZIERS.length

function initialState(save: SaveDataV1 | null): GameState {
  return {
    crystalsCollected: save?.collectedCrystalIds.length ?? 0,
    litBraziersCount: save?.litBrazierIds.length ?? 0,
    currentBiome: "enchantedForest", // position is not saved — every stroll starts at the entrance
    isMenuOpen: false,
    // NOTE: wrap in a lambda — passing window.matchMedia unbound loses `this`
    // and throws "Illegal invocation" when called.
    reducedMotion: detectReducedMotion(
      typeof window !== "undefined"
        ? (query) => window.matchMedia(query)
        : undefined,
    ),
    discoveredInscriptionIds: save?.discoveredInscriptionIds ?? [],
    audioMuted: save?.audioMuted ?? false,
  };
}

// Exported so tests can create isolated instances (spec/06-test-plan.md §1).
export function createGameStore(save: SaveDataV1 | null) {
  const [state, setState] = createStore<GameState>(initialState(save));
  return {
    gameState: state, // consumers must not receive setState
    collectCrystal: () => setState("crystalsCollected", (n) => n + 1),
    lightBrazier: () => setState("litBraziersCount", (n) => n + 1),
    setCurrentBiome: (biome: BiomeId) => setState("currentBiome", biome),
    setMenuOpen: (open: boolean) => setState("isMenuOpen", open),
    setReducedMotion: (reduced: boolean) => setState("reducedMotion", reduced),
    discoverInscription: (id: number) =>
      setState("discoveredInscriptionIds", (ids) =>
        ids.includes(id) ? ids : [...ids, id],
      ),
    setAudioMuted: (muted: boolean) => setState("audioMuted", muted),
  };
}

export const {
  gameState,
  collectCrystal,
  lightBrazier,
  setCurrentBiome,
  setMenuOpen,
  setReducedMotion,
  discoverInscription,
  setAudioMuted,
} = createRoot(() => createGameStore(persistence.initial));
