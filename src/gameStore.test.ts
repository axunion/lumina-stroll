import { describe, expect, it } from "vitest";
import { createGameStore } from "./gameStore";

describe("createGameStore", () => {
  it("starts with the initial state from spec/03-reference.md §5", () => {
    const { gameState } = createGameStore(null);
    expect(gameState.crystalsCollected).toBe(0);
    expect(gameState.litBraziersCount).toBe(0);
    expect(gameState.currentBiome).toBe("enchantedForest");
    expect(gameState.isMenuOpen).toBe(false);
    // Node test environment has no matchMedia, so reduced motion defaults to false.
    expect(gameState.reducedMotion).toBe(false);
    expect(gameState.discoveredInscriptionIds).toEqual([]);
    expect(gameState.audioMuted).toBe(false);
  });

  it("collectCrystal called twice sets crystalsCollected to 2", () => {
    const store = createGameStore(null);
    store.collectCrystal();
    store.collectCrystal();
    expect(store.gameState.crystalsCollected).toBe(2);
  });

  it("lightBrazier increments litBraziersCount", () => {
    const store = createGameStore(null);
    store.lightBrazier();
    expect(store.gameState.litBraziersCount).toBe(1);
  });

  it("setCurrentBiome changes currentBiome", () => {
    const store = createGameStore(null);
    store.setCurrentBiome("crystalCave");
    expect(store.gameState.currentBiome).toBe("crystalCave");
  });

  it("setMenuOpen / setReducedMotion / setAudioMuted change only their own field", () => {
    const store = createGameStore(null);
    store.setMenuOpen(true);
    expect(store.gameState.isMenuOpen).toBe(true);
    expect(store.gameState.reducedMotion).toBe(false);
    expect(store.gameState.crystalsCollected).toBe(0);
    expect(store.gameState.litBraziersCount).toBe(0);
    expect(store.gameState.currentBiome).toBe("enchantedForest");
    expect(store.gameState.audioMuted).toBe(false);

    store.setReducedMotion(true);
    expect(store.gameState.reducedMotion).toBe(true);
    expect(store.gameState.isMenuOpen).toBe(true);
    expect(store.gameState.crystalsCollected).toBe(0);
    expect(store.gameState.litBraziersCount).toBe(0);
    expect(store.gameState.currentBiome).toBe("enchantedForest");
    expect(store.gameState.audioMuted).toBe(false);

    store.setAudioMuted(true);
    expect(store.gameState.audioMuted).toBe(true);
    expect(store.gameState.reducedMotion).toBe(true);
    expect(store.gameState.isMenuOpen).toBe(true);
    expect(store.gameState.crystalsCollected).toBe(0);
    expect(store.gameState.litBraziersCount).toBe(0);
    expect(store.gameState.currentBiome).toBe("enchantedForest");
  });

  it("discoverInscription adds the id and is idempotent for the same id", () => {
    const store = createGameStore(null);
    store.discoverInscription(2);
    expect(store.gameState.discoveredInscriptionIds).toEqual([2]);
    store.discoverInscription(2);
    expect(store.gameState.discoveredInscriptionIds).toEqual([2]);
    store.discoverInscription(4);
    expect(store.gameState.discoveredInscriptionIds).toEqual([2, 4]);
  });

  it("derives initial state from a save", () => {
    const store = createGameStore({
      version: 1,
      collectedCrystalIds: [1, 3, 9],
      litBrazierIds: [1, 4],
      discoveredInscriptionIds: [2],
      audioMuted: true,
    });
    expect(store.gameState.crystalsCollected).toBe(3);
    expect(store.gameState.litBraziersCount).toBe(2);
    expect(store.gameState.discoveredInscriptionIds).toEqual([2]);
    expect(store.gameState.audioMuted).toBe(true);
  });
});
