---
name: spec-audit
description: Audit the Lumina Stroll implementation (or a given scope) against the spec/ documents and report mismatches. Use when the user asks "does this match the spec?", "spec check", "audit against spec", or after ad-hoc changes made outside the /milestone flow.
argument-hint: [files, milestone, or empty for working-tree changes]
---

Run a spec-compliance audit and present the results. This skill is a thin wrapper around
the `spec-compliance-reviewer` agent — do not review inline yourself.

## Steps

1. Determine the scope from `$ARGUMENTS`:
   - Empty → current working-tree changes (diff vs HEAD plus untracked `src/` files).
     If there are no changes but committed game code exists, offer to audit the full
     implementation instead of stopping.
   - A milestone id (e.g. `M3`) → the files that milestone touches per `spec/05-roadmap.md`.
   - File paths or a directory → exactly those.
   If the resolved scope is an empty file set, report what you checked and stop — that is
   a valid result, not an error. The untouched Vite starter files do not count as
   implementation.
2. Delegate to the `spec-compliance-reviewer` agent with the scope spelled out.
3. Present the findings as a table: severity | location | mismatch | spec reference.
   Repeat the agent's PASS/FAIL verdict. List any reported "Spec issues" separately —
   those need a spec update decision from the user, not a code fix.
4. Do not apply fixes unless the user asks.
