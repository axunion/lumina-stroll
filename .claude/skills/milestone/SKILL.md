---
name: milestone
description: Implement one Lumina Stroll roadmap milestone (M0-M7) end to end - read the spec scope, implement, get pnpm check/test green, run the spec-compliance audit, then present the manual verification items. Use when the user says things like "do M2", "next milestone", or "implement milestone 3".
argument-hint: [M0-M7]
---

Implement a single milestone from `spec/05-roadmap.md`, strictly one at a time.

## Target

Milestone: `$ARGUMENTS`. If no argument was given, infer the next milestone from
`spec/05-roadmap.md` and the git log / current state of `src/`, state your inference, and
confirm with the user before starting. Trust the actual `src/` contents over the git log
when they disagree. If a milestone is only partially done, target that milestone and
finish it rather than moving on.

## Steps

1. **Read the scope.** Read the target milestone section in `spec/05-roadmap.md`: its
   scope bullets and its verification list.
2. **Read the referenced spec.** Read every spec section the scope references
   (`01-architecture.md` … `04-ui.md`, and `06-test-plan.md` for M1). Game constants,
   types, palettes, and world data are copied from `spec/03-reference.md` only; verbatim
   config/code blocks that other spec sections own (e.g. `01-architecture.md` §6) are
   copied from there.
3. **Implement.** Only what the milestone scopes — no work from later milestones, no
   groundwork for out-of-scope features. For M1, write the tests from `06-test-plan.md`
   first (all listed cases), then make them pass.
4. **Automated verification.** Run `pnpm check` and `pnpm test`. Fix until both are green.
5. **Spec audit.** Delegate to the `spec-compliance-reviewer` agent for the changed files.
   Fix all Critical findings (and Warnings unless there is a documented reason not to),
   then re-run step 4.
6. **Manual verification.** Present the milestone's manual verification items from
   `spec/05-roadmap.md` as a checklist for the user to walk through (for M7, that is the
   whole of `spec/07-verification-checklist.md`, run against `pnpm build && pnpm preview`).
   Wait for the user's result; fix anything that fails and repeat from step 4.
7. **Do not commit.** When the user confirms verification, remind them a commit can be
   made (the ax-commit-x skill handles it). Committing is the user's call.
