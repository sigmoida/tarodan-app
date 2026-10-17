---
name: design-token-change
description: Add or change a design token in packages/design-tokens (colour, spacing, radius, typography, shadow, motion, z-index) and propagate it to the Tailwind preset, @tarodan/ui, web, admin and the mobile copy. Use for any design-value change or when a screen needs a value that does not exist yet.
argument-hint: "<token group> <change and reason>"
---

# Design token change

Change: $ARGUMENTS

Read `packages/design-tokens/CLAUDE.md` and tarodan-ops:
`docs/design-system.md`.

## Rules

- `packages/design-tokens/src/*.ts` is the single source for web, admin and
  mobile. Never add a value in an app, a component or a Tailwind config.
- Prefer a semantic alias (`surface-alt`, `muted`, ...) over using a raw palette
  step for a new meaning.
- Light theme only; Noto Sans 400/500/600/700.

## Steps

1. **Check it is really missing:**
   `git grep -n "<value or name>" packages/design-tokens/src packages/ui/src`.
2. **Edit the token** in `packages/design-tokens/src/<group>.ts` (numeric px
   values; the preset converts spacing to rem).
3. **Expose it to web** in `src/tailwind-preset.ts` if it needs a utility class
   (semantic name only).
4. **Use it** in `@tarodan/ui` first (variant via `class-variance-authority`),
   then in the apps.
5. **Verify every consumer:**

   ```bash
   pnpm --filter @tarodan/design-tokens typecheck
   pnpm --filter @tarodan/ui typecheck
   pnpm --filter @tarodan/web typecheck && pnpm --filter @tarodan/web lint
   pnpm --filter @tarodan/admin typecheck && pnpm --filter @tarodan/admin lint
   ```

   Look at the affected screens (contrast at least 4.5:1 for text,
   tarodan-ops: `docs/budgets.md`).

6. **Design-system note:** add what changed and why to tarodan-ops:
   `docs/design-system.md` (or hand the note to the orchestrator if you have no
   hub access).
7. **Sync mobile:** the same change goes into
   `tarodan-mobile/src/theme/<group>.ts` (platform transforms: rem -> pt, CSS
   shadow -> RN shadow/elevation, weight -> font file) in the same wave, or a
   hub backlog line records the drift. Mobile-only role tokens
   (`roles.ts`) are derived there, never here.
8. Commit `feat(design-tokens): ...` (or `fix(...)`); the body names the mobile
   follow-up.
