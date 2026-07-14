---
name: run-lumina-stroll
description: How to launch and eyeball Lumina Stroll locally. Used by /run and /verify, or when the user asks to start the app or see a change working in the browser.
---

## Launch

- Dev: `pnpm dev` (Vite, defaults to http://localhost:5173).
- Production check: `pnpm build && pnpm preview` (preview defaults to http://localhost:4173).
- Both servers run until stopped: start them as background tasks and kill them when the
  check is done.

## What a healthy boot looks like

- Tab title "Lumina Stroll"; no console errors or warnings.
- Full-screen dark canvas with a soft glowing player circle near the center; the rest of
  the world is dimmed by the darkness overlay.
- HUD top-left: crystal pill `0 / 14`, brazier pill `0 / 6`, biome chip
  "Enchanted Forest"; settings (gear) button top-right.
- Arrow keys and WASD move the player; arrow keys must not scroll the page.

The implementation (M0–M13) is complete, so there is no per-feature checklist left to
consult — eyeball the golden path (move around, collect a crystal, light a brazier, cross
the biome boundary, open Settings) and watch for console errors or visual regressions.
When verifying a **swapped-in asset**, follow the checkout steps in
`spec/asset-guide.md` §6 instead.
