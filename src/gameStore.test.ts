import { describe, expect, it } from "vitest";
import { createGameStore } from "./gameStore";

describe("createGameStore", () => {
  it("starts with the initial state from spec/03-reference.md §5", () => {
    const { gameState } = createGameStore();
    expect(gameState.crystalsCollected).toBe(0);
    expect(gameState.litBraziersCount).toBe(0);
    expect(gameState.currentBiome).toBe("enchantedForest");
    expect(gameState.isMenuOpen).toBe(false);
    // Node test environment has no matchMedia, so reduced motion defaults to false.
    expect(gameState.reducedMotion).toBe(false);
  });

  it("collectCrystal called twice sets crystalsCollected to 2", () => {
    const store = createGameStore();
    store.collectCrystal();
    store.collectCrystal();
    expect(store.gameState.crystalsCollected).toBe(2);
  });

  it("lightBrazier increments litBraziersCount", () => {
    const store = createGameStore();
    store.lightBrazier();
    expect(store.gameState.litBraziersCount).toBe(1);
  });

  it("setCurrentBiome changes currentBiome", () => {
    const store = createGameStore();
    store.setCurrentBiome("crystalCave");
    expect(store.gameState.currentBiome).toBe("crystalCave");
  });

  it("setMenuOpen and setReducedMotion change only their own field", () => {
    const store = createGameStore();
    store.setMenuOpen(true);
    expect(store.gameState.isMenuOpen).toBe(true);
    expect(store.gameState.reducedMotion).toBe(false);
    expect(store.gameState.crystalsCollected).toBe(0);
    expect(store.gameState.litBraziersCount).toBe(0);
    expect(store.gameState.currentBiome).toBe("enchantedForest");

    store.setReducedMotion(true);
    expect(store.gameState.reducedMotion).toBe(true);
    expect(store.gameState.isMenuOpen).toBe(true);
    expect(store.gameState.crystalsCollected).toBe(0);
    expect(store.gameState.litBraziersCount).toBe(0);
    expect(store.gameState.currentBiome).toBe("enchantedForest");
  });
});
