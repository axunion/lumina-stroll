---
name: asset-pipeline
description: Normalize, QA, and install sprite PNG assets for Lumina Stroll. Use when the user provides raw AI-generated images to turn into game sprites, asks to regenerate the floor tiles or the lit brazier, or wants the assets in public/assets/ checked against the spec.
---

Regulations and per-sprite briefs live in `spec/asset-guide.md`; the full human
procedure and rationale live in `docs/asset-pipeline.md`. This skill is the
operational command sequence.

## Pipeline

1. **Intake**: raw generated images belong in `assets-intake/` (gitignored, any
   name). They must have a transparent background — the normalizer rejects
   baked-in backgrounds; ask the user to regenerate instead of keying.
2. **Normalize** (all sprites except tiles and brazierLit):
   `node scripts/normalize-sprite.ts assets-intake/<file>.png <spriteKey>`
3. **Derive / generate**:
   - `node scripts/compose-brazier-lit.ts` — REQUIRED again whenever
     brazier-unlit.png changes (lit is derived from it).
   - `node scripts/generate-tiles.ts [seed]` — both floor tiles; never
     normalize tiles from AI images.
4. **Mechanized QA**: `node scripts/check-assets.ts [spriteKey ...]` — exits 1
   on FAIL. Map FAIL/WARN messages to the failure table in
   `spec/asset-guide.md` §7 and turn them into concrete regeneration feedback
   (prompt deltas) for the user.
5. **Visual verify**: launch via the `run-lumina-stroll` skill and follow
   `spec/asset-guide.md` §6 steps 4–5 (darkness readability, halo blending;
   walk tiles edge to edge for seams). Never skip this — style violations are
   only partially mechanized.

## Notes

- Sprite keys, sizes, and anchors come from `SPRITE_DEFS` in `src/assets.ts`
  (the single source of truth; scripts import it directly).
- Tuning constants sit at the top of each script (margins, ember pool, tile
  speckles, QA thresholds) — edit and re-run rather than adding CLI flags.
- A misnamed output falls back silently in-game; the QA script catches missing
  files only when the key is passed explicitly.
