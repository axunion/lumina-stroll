---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Solid + Canvas Reactivity Contract

Hard constraints from `spec/01-architecture.md` that are easy to violate by habit. The full
contract is the spec; this file lists only the traps.

## Store contract (exactly 7 fields)

- `gameStore.ts` holds **exactly** these Signal fields: `crystalsCollected`,
  `litBraziersCount`, `currentBiome`, `isMenuOpen`, `reducedMotion`,
  `discoveredInscriptionIds`, `audioMuted`. Adding fields is forbidden (pause state
  derives from `isMenuOpen`; totals are constants, not state; reset-button armed state is
  component-local).
- Writes go through the exported action functions only. Never export `setState`.
- Store actions never touch `persistence` — write-through happens at the event source
  (`spec/01-architecture.md` §2).

## Frame state is NOT reactive

- Everything that changes per frame (player x/y, velocity, camera, particle arrays,
  floating texts, input key Set, D-pad flags, crystal/brazier/plant/wisp arrays,
  inscription proximity edge state, previous-frame values) lives in plain mutable local
  variables inside `GameCanvas.tsx`. **Never make these Signals** — it causes re-render
  storms.
- The `SpriteMap` images, Web Audio nodes, and the save snapshot are plain module/local
  objects owned by `assets.ts` / `audio.ts` / `persistence.ts` — never Signals either.
- Signal updates happen only on discrete events: crystal collected, brazier lit, biome
  boundary crossed (compare against a locally held previous value), inscription first
  discovered, mute toggled.

## Untracked rAF reads are intentional

- Reading `gameState.isMenuOpen` / `gameState.reducedMotion` inside the rAF loop is
  untracked **by design** — the loop runs every frame, so the next frame reads the latest
  value. Do NOT "fix" this with `createEffect` bridges or by copying values reactively.

## Before writing GameCanvas / GameUI code

Re-read the pitfall checklist in `spec/01-architecture.md` §7 (stuck keys on menu open,
`preventDefault` for arrow keys only, clear key Set on `blur`, lucide per-icon imports,
`import type` under `verbatimModuleSyntax`, no `enum` under `erasableSyntaxOnly`, Kobalte
Portal/defaults). Do not restate those rules here — the spec is the source.
