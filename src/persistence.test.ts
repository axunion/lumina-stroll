import { describe, expect, it, vi } from "vitest";
import {
  createPersistence,
  parseSave,
  type SaveDataV1,
  type StorageLike,
  serializeSave,
} from "./persistence";

// spec/06-test-plan.md §4
const TOTALS = { crystals: 14, braziers: 6, inscriptions: 6 };

function makeSave(overrides: Partial<SaveDataV1> = {}): SaveDataV1 {
  return {
    version: 1,
    collectedCrystalIds: [1, 3, 9],
    litBrazierIds: [1, 4],
    discoveredInscriptionIds: [2],
    audioMuted: false,
    ...overrides,
  };
}

function makeStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

describe("parseSave / serializeSave", () => {
  it("round-trips through serializeSave", () => {
    const save = makeSave();
    expect(parseSave(serializeSave(save), TOTALS)).toEqual(save);
  });

  it("returns null for null or malformed JSON", () => {
    expect(parseSave(null, TOTALS)).toBeNull();
    expect(parseSave("{oops", TOTALS)).toBeNull();
  });

  it("returns null for a version other than 1", () => {
    expect(
      parseSave(JSON.stringify({ ...makeSave(), version: 2 }), TOTALS),
    ).toBeNull();
    const { version: _version, ...withoutVersion } = makeSave();
    expect(parseSave(JSON.stringify(withoutVersion), TOTALS)).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...makeSave(), version: "1" }), TOTALS),
    ).toBeNull();
  });

  it("returns null when an id field is not an array", () => {
    expect(
      parseSave(
        JSON.stringify({ ...makeSave(), collectedCrystalIds: null }),
        TOTALS,
      ),
    ).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...makeSave(), litBrazierIds: 3 }), TOTALS),
    ).toBeNull();
    expect(
      parseSave(
        JSON.stringify({ ...makeSave(), discoveredInscriptionIds: {} }),
        TOTALS,
      ),
    ).toBeNull();
  });

  it("drops out-of-range, non-integer, and duplicate id array elements, keeps the rest", () => {
    const parsed = parseSave(
      JSON.stringify({
        ...makeSave(),
        collectedCrystalIds: [1, 0, 15, 1.5, "3", 1, 5],
      }),
      TOTALS,
    );
    expect(parsed?.collectedCrystalIds).toEqual([1, 5]);
  });

  it("falls back audioMuted to false when it is not a boolean", () => {
    const parsed = parseSave(
      JSON.stringify({ ...makeSave(), audioMuted: "true" }),
      TOTALS,
    );
    expect(parsed?.audioMuted).toBe(false);
  });
});

describe("createPersistence", () => {
  it("has null initial and no-op mutators when storage is undefined", () => {
    const persistence = createPersistence(undefined, TOTALS);
    expect(persistence.initial).toBeNull();
    expect(() => {
      persistence.markCrystalCollected(1);
      persistence.markBrazierLit(1);
      persistence.markInscriptionDiscovered(1);
      persistence.setAudioMuted(true);
      persistence.clear();
    }).not.toThrow();
  });

  it("write-through: each mutator call persists and is idempotent for the same id", () => {
    const storage = makeStorage();
    const persistence = createPersistence(storage, TOTALS);
    persistence.markCrystalCollected(1);
    persistence.markCrystalCollected(1);
    persistence.markBrazierLit(4);
    persistence.markInscriptionDiscovered(2);
    persistence.setAudioMuted(true);

    const saved = parseSave(storage.getItem("luminaStroll.save"), TOTALS);
    expect(saved?.collectedCrystalIds).toEqual([1]);
    expect(saved?.litBrazierIds).toEqual([4]);
    expect(saved?.discoveredInscriptionIds).toEqual([2]);
    expect(saved?.audioMuted).toBe(true);
  });

  it("initial stays the value loaded at creation, unaffected by later mutators", () => {
    const storage = makeStorage({
      "luminaStroll.save": serializeSave(
        makeSave({ collectedCrystalIds: [1] }),
      ),
    });
    const persistence = createPersistence(storage, TOTALS);
    persistence.markCrystalCollected(3);
    expect(persistence.initial?.collectedCrystalIds).toEqual([1]);
  });

  it("does not throw when setItem throws (quota / private mode)", () => {
    const storage = makeStorage();
    storage.setItem = vi.fn(() => {
      throw new Error("quota exceeded");
    });
    const persistence = createPersistence(storage, TOTALS);
    expect(() => persistence.markCrystalCollected(1)).not.toThrow();
  });

  it("clear() removes the saved item", () => {
    const storage = makeStorage({
      "luminaStroll.save": serializeSave(makeSave()),
    });
    const persistence = createPersistence(storage, TOTALS);
    persistence.clear();
    expect(storage.getItem("luminaStroll.save")).toBeNull();
  });
});
