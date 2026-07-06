# Spec Authority

The `spec/` directory is the single source of truth for this project. Consult it before
every implementation decision. Do not duplicate its content here or in code — reference it.

## Document map and conflict resolution

- The authority map lives in `spec/00-overview.md` §6. In short: architecture decisions →
  `01-architecture.md`, behavior → `02-game-design.md`, **all numbers/types/data** →
  `03-reference.md`, UI structure and class names → `04-ui.md`, implementation order →
  `05-roadmap.md`, tests → `06-test-plan.md`, final QA → `07-verification-checklist.md`.
- On conflict: numbers, types, and coordinates — `03-reference.md` wins. Behavior
  descriptions — `02-game-design.md` wins.
- Numeric values are copied from `03-reference.md` only. Never restate values in other
  files, comments, or docs; refer to them by key (e.g. `CONFIG.playerSpeed`).

## Non-requirements (never implement)

- `spec/00-overview.md` §3: no combat, enemies, damage, timers, game-over, score pressure,
  or obstacles.
- `spec/00-overview.md` §7 (out of scope): no localStorage persistence, no audio, no third
  biome, no gamepad support. Also do NOT lay groundwork for these (abstractions, optional
  parameters, hooks) — YAGNI is a hard rule here.

## Milestone workflow

- Implement in the order of `spec/05-roadmap.md` (M0 → M7). Each milestone's verification
  must pass before starting the next.
- Verification commands: `pnpm check` (biome + tsc), `pnpm test` (vitest), `pnpm dev`,
  `pnpm build && pnpm preview`.

## When the spec is wrong or incomplete

Never silently deviate. If an implementation decision contradicts the spec or falls into a
gap, propose an update to the relevant spec file first, get it agreed, then implement.
