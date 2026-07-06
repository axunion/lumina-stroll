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

Feature-by-feature expectations live in `spec/07-verification-checklist.md` — use it when
verifying a specific change.
