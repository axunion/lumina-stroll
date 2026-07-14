# Spec Authority

The game implementation (M0–M13 of the original roadmap) is complete. The shipped code in
`src/` and the git history are now the source of truth for architecture, behavior, types,
numbers, and UI structure — do not restate them here or duplicate them into new docs.

The only remaining document is `spec/asset-guide.md`: guidance for producing (typically
AI-generated) replacement image assets for the 9 swappable sprites. Consult it before any
asset-production work. Its sizes/anchors mirror `src/assets.ts`'s `SPRITE_DEFS` — if the
code changes, update the guide to match; the code wins on any mismatch.

## Non-requirements (never implement)

- No combat, enemies, damage, timers, game-over, score pressure, or obstacles.
- No third biome, no gamepad support, no sprite animation frames / atlases, no audio asset
  files (sound is Web Audio synthesis only), no player-position saving. Also do NOT lay
  groundwork for these (abstractions, optional parameters, hooks) — YAGNI is a hard rule
  here.

## Verification

- `pnpm check` (biome + tsc), `pnpm test` (vitest), `pnpm dev`, `pnpm build && pnpm preview`.

## When the spec is wrong or incomplete

Never silently deviate. If an implementation decision contradicts `spec/asset-guide.md` or
falls into a gap, propose an update to it first, get it agreed, then implement.
