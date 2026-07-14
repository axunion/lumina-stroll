---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Solid + Canvas Reactivity Contract

Lumina Stroll's implementation is complete (M0–M13); this file is now the sole record of
the architecture contract for any future edits to `src/**/*.ts(x)`. These constraints are
easy to violate by habit.

## Store contract (exactly 7 fields)

- `gameStore.ts` holds **exactly** these Signal fields: `crystalsCollected`,
  `litBraziersCount`, `currentBiome`, `isMenuOpen`, `reducedMotion`,
  `discoveredInscriptionIds`, `audioMuted`. Adding fields is forbidden (pause state
  derives from `isMenuOpen`; totals are constants, not state; reset-button armed state is
  component-local).
- Writes go through the exported action functions only. Never export `setState`.
- Store actions never touch `persistence` — write-through happens at the event source (the
  code path that has the id: `GameCanvas.tsx` for progress, `GameUI.tsx` for
  `audioMuted`/reset).

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

Re-read this checklist before touching `GameCanvas.tsx` / `GameUI.tsx`:

- **Don't destructure Solid props/store** — reactivity breaks. Always read via `props.x` /
  `gameState.x`.
- **Untracked rAF reads are correct** (see above) — don't bridge them with `createEffect`.
- **Kobalte `Dialog` portals to `<body>`** — canvas overlap is handled by the z-index plan
  in `GameUI.tsx` / `Game.module.css`, not by moving the portal. Style Dialog parts with
  `class={styles.x}` per-part, not globally.
- **Clear the pressed-key `Set` when the menu opens** — Kobalte's focus trap swallows
  `keyup` while the Dialog is open, so a key held at open time reads as still-pressed
  ("stuck key" bug: player walks off the instant Escape closes the menu). Handle this at
  the top of `update()` when `isMenuOpen` flips true, or in the keydown handler.
- **`preventDefault` only for arrow keys** (to stop page scroll) — never for WASD. Skip
  entirely when `e.metaKey || e.ctrlKey || e.altKey` is set, so browser shortcuts still
  work.
- **Clear the pressed-key `Set` on `window` `blur`** — catches `keyup` events missed during
  a tab switch.
- **Don't hand-roll Escape handling** — Kobalte calls `onOpenChange(false)`; the canvas
  keydown handler should just early-return while `gameState.isMenuOpen` is true.
- **Import lucide-solid icons individually** —
  `import Sparkles from 'lucide-solid/icons/sparkles'`. Barrel imports slow the dev server
  and hurt tree-shaking.
- **`verbatimModuleSyntax`** — type-only imports must be `import type { ... }`.
- **`erasableSyntaxOnly`** — no `enum` (use string unions); no constructor parameter
  properties.
- **`noUnusedLocals` / `noUnusedParameters`** — unused symbols are build errors.
- **Read `matchMedia` once**, at store init (see above) — no live listener.
- **Catch `Image.decode()` rejections** — a missing sprite PNG 404s silently into the
  fallback; an unhandled rejection would leak into the console.
- **Create/`resume()` the `AudioContext` only inside a user-gesture handler** — anywhere
  else, autoplay restrictions leave it `suspended`.
- **Wrap every `localStorage` access in try/catch** — Safari private mode throws on
  `setItem`, and in some environments even referencing `window.localStorage` throws.
- **Wrap `JSON.parse` in try/catch** — a corrupted save must never crash the app; treat it
  as no save.
- **A restored brazier's `litAt` is treated as already-eased** — don't replay the lighting
  animation on boot.
