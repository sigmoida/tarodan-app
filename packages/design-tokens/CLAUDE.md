# @tarodan/design-tokens (packages/design-tokens)

**The single source of truth for every design value** on web, admin and mobile:
`colors`, `spacing`, `radius`, `typography`, `shadows`, `motion`, `z-index`
(`src/*.ts`), plus `tailwind-preset.ts`, the web adapter that projects them onto
a Tailwind theme. Repo rules: [root CLAUDE.md](../../CLAUDE.md). Cross-repo
policy: tarodan-ops: `docs/design-system.md`.

## Consumers

- `apps/web` and `apps/admin` through `@tarodan/design-tokens/tailwind`. App
  Tailwind configs hold only app-specific bits (content globs, one-off
  animations); they never redeclare colours, radius or spacing.
- `@tarodan/ui` uses the semantic classes the preset defines.
- **Mobile** (`tarodan-mobile/src/theme/`) keeps a synced copy of these files.
  Platform transforms (rem -> pt, CSS shadow -> RN shadow/elevation, font weight
  -> font file) belong in the mobile sync script, not in hand edits.

## Rules

- No ad-hoc colours, sizes or variants anywhere: a missing value is added here
  first, then used. Raw values are numeric px; the preset converts spacing to
  rem so it scales with the root font size.
- Web markup uses **semantic** names (`primary`, `danger`, `success`, `info`,
  `warning`, `surface`, `surface-alt`, `surface-elevated`, `heading`, `body`,
  `muted`, `subtle`, `border`, `inverted`). Raw palette steps stay inside the
  token layer.
- Light theme only. Typography is Noto Sans 400/500/600/700 on every platform.
- Prefer adding a semantic alias over reusing a raw step in a new meaning.

## Changing a token

Use the `design-token-change` skill. In short:

1. Edit `src/<group>.ts` (and `tailwind-preset.ts` if it adds a utility).
2. Typecheck and lint `@tarodan/design-tokens`, `@tarodan/ui`, web and admin;
   look at the affected screens.
3. **Write a design-system note** in tarodan-ops: `docs/design-system.md`
   (what changed and why), and **sync mobile**: the same change lands in
   `tarodan-mobile/src/theme/` in the same wave, or a hub backlog line records
   the drift.
4. Commit as `feat(design-tokens): ...` or `fix(design-tokens): ...`.

The token-sync script and a drift check in mobile CI are planned (hub backlog);
until then the sync is manual, so step 3 is not optional.
