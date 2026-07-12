// Save snapshot ownership, serialization, and localStorage I/O (spec/03-reference.md §1.4,
// §6.2, §8; lifecycle in spec/01-architecture.md §10).

export interface SaveDataV1 {
  version: 1;
  collectedCrystalIds: number[];
  litBrazierIds: number[];
  discoveredInscriptionIds: number[];
  audioMuted: boolean;
}

export interface SaveTotals {
  crystals: number;
  braziers: number;
  inscriptions: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Persistence {
  readonly initial: SaveDataV1 | null;
  markCrystalCollected(id: number): void;
  markBrazierLit(id: number): void;
  markInscriptionDiscovered(id: number): void;
  setAudioMuted(muted: boolean): void;
  clear(): void;
}

const SAVE_KEY = "luminaStroll.save";

// Keeps each id in [1, total], integer, and de-duplicated; out-of-range/non-integer/
// duplicate elements are dropped, the rest of the array survives (spec/03-reference.md §8).
function sanitizeIds(ids: unknown[], total: number): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const id of ids) {
    if (
      typeof id === "number" &&
      Number.isInteger(id) &&
      id >= 1 &&
      id <= total &&
      !seen.has(id)
    ) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export function parseSave(
  json: string | null,
  totals: SaveTotals,
): SaveDataV1 | null {
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  const {
    collectedCrystalIds,
    litBrazierIds,
    discoveredInscriptionIds,
    audioMuted,
  } = candidate;
  if (
    !Array.isArray(collectedCrystalIds) ||
    !Array.isArray(litBrazierIds) ||
    !Array.isArray(discoveredInscriptionIds)
  ) {
    return null;
  }
  return {
    version: 1,
    collectedCrystalIds: sanitizeIds(collectedCrystalIds, totals.crystals),
    litBrazierIds: sanitizeIds(litBrazierIds, totals.braziers),
    discoveredInscriptionIds: sanitizeIds(
      discoveredInscriptionIds,
      totals.inscriptions,
    ),
    audioMuted: typeof audioMuted === "boolean" ? audioMuted : false,
  };
}

export function serializeSave(save: SaveDataV1): string {
  return JSON.stringify(save);
}

export function createPersistence(
  storage: StorageLike | undefined,
  totals: SaveTotals,
): Persistence {
  if (!storage) {
    return {
      initial: null,
      markCrystalCollected: () => {},
      markBrazierLit: () => {},
      markInscriptionDiscovered: () => {},
      setAudioMuted: () => {},
      clear: () => {},
    };
  }

  // Narrowed to a local const: TS's control-flow narrowing of the `storage` parameter
  // doesn't cross into the nested closures below (persist / clear).
  const store: StorageLike = storage;

  let loaded: string | null;
  try {
    loaded = store.getItem(SAVE_KEY);
  } catch {
    loaded = null;
  }
  const initial = parseSave(loaded, totals);

  // Mutable snapshot this closure owns; each mutator updates it and writes through
  // synchronously (spec/01-architecture.md §10 — no debounce, no per-frame writes).
  // Cloned from `initial` (not aliased) so mutating it never changes the `initial` this
  // Persistence exposes — that must stay the value loaded at creation (§6.2).
  const base: SaveDataV1 = initial ?? {
    version: 1,
    collectedCrystalIds: [],
    litBrazierIds: [],
    discoveredInscriptionIds: [],
    audioMuted: false,
  };
  const snapshot: SaveDataV1 = {
    ...base,
    collectedCrystalIds: [...base.collectedCrystalIds],
    litBrazierIds: [...base.litBrazierIds],
    discoveredInscriptionIds: [...base.discoveredInscriptionIds],
  };

  function persist() {
    try {
      store.setItem(SAVE_KEY, serializeSave(snapshot));
    } catch {
      // Safari private mode / quota exceeded — never crash (spec/03-reference.md §6.2).
    }
  }

  function addUnique(ids: number[], id: number) {
    if (!ids.includes(id)) ids.push(id);
  }

  return {
    initial,
    markCrystalCollected(id) {
      addUnique(snapshot.collectedCrystalIds, id);
      persist();
    },
    markBrazierLit(id) {
      addUnique(snapshot.litBrazierIds, id);
      persist();
    },
    markInscriptionDiscovered(id) {
      addUnique(snapshot.discoveredInscriptionIds, id);
      persist();
    },
    setAudioMuted(muted) {
      snapshot.audioMuted = muted;
      persist();
    },
    clear() {
      try {
        store.removeItem(SAVE_KEY);
      } catch {
        // See persist() above — never crash.
      }
    },
  };
}

function getLocalStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// Mirrors the world-data-derived totals (spec/03-reference.md §4.6), copied here as
// literals rather than imported: gameStore.ts imports `persistence` from this module, so
// importing gameStore's TOTAL_CRYSTALS/TOTAL_BRAZIERS back would be circular. 03-reference.md
// §4.6 remains the source of truth these mirror.
const SAVE_TOTALS: SaveTotals = { crystals: 14, braziers: 6, inscriptions: 6 };

export const persistence: Persistence = createPersistence(
  getLocalStorage(),
  SAVE_TOTALS,
);
