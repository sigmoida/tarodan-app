# @tarodan/ui (packages/ui)

The shared component library for **web and admin**: primitives (`Button`,
`Input`, `Select`, `Modal`, `Badge`, `StatusBadge`, `SectionCard`, `EmptyState`,
`Skeleton`, `Tabs`, `Pagination`, ...), the form layer (`@tarodan/ui/form`) and
small shared libs (phone, password and legal-identity schemas, `cn`). Mobile has
its own library (`tarodan-mobile/src/ui`) that mirrors names and variants.
Repo rules: [root CLAUDE.md](../../CLAUDE.md).

## Rules

- **Add here before you fork.** A missing variant or state is added to the
  component here, then used. Apps never copy a primitive locally.
- **Tokens only.** Styles use the semantic classes from
  `@tarodan/design-tokens/tailwind`; no hex, rgba, raw palette or magic sizes. A
  missing token goes to `packages/design-tokens` first.
- **Light theme only**: no `dark:` variants.
- **Small APIs.** Prefer composition (`children`, slots) over flags. Variants go
  through `class-variance-authority`; the variant list is the API.
- **i18n-agnostic.** Components take copy as props (labels, confirm text,
  modal buttons); they never import a catalog or hardcode Turkish.
- **Server-safe subpaths.** Client-only components must not leak into Server
  Component chains through the barrel. Pure or server-safe pieces have subpath
  exports (`./utils`, `./logo`, `./spinner`, `./button`, `./badge`, ...); add one
  when a server page needs a component.
- **Accessibility**: labels on fields, visible focus, keyboard operable, target
  size at least 24 px (tarodan-ops: `docs/budgets.md`).
- Status colours and labels come from `@tarodan/shared` (`status-configs.ts`),
  re-exported here; never a local status map.

## Form layer (`@tarodan/ui/form`)

- `useZodForm(schema, { defaultValues })` + `Form` + field wrappers
  (`FormInput`, `FormSelect`, `FormTextarea`, `FormCheckbox`, `FormPhone`,
  `FormIban`, `FormDatePicker`, `FormSearchableSelect`, `FormImageUpload`, ...).
  Wrappers wire value and error by `name`; never thread `register` or errors by
  hand.
- `FormModal` = `Modal` + `Form` + Cancel/Submit footer + unsaved-changes guard
  (+ `destructive`). The resource modal owns the form and the mutation;
  `FormModal` only frames them.
- A custom-driven control still registers its field and writes through
  `setValue(name, value, { shouldValidate: true })`, so validation stays in the
  schema.
- `FormImageUpload` takes an injected `upload` function; the package never
  knows an app's API.
- Shared schema builders: `trPhone` / `trPhoneOptional` (TR mobile only, stored
  as `+905XXXXXXXXX`; `combinePhone` normalises), password and legal-identity
  schemas built on `@tarodan/types`. Never a local regex.

## Parity with mobile

Same concept, same name, props vocabulary and variants as mobile `@/ui`. When
you add or change a variant here, check the mobile side in the same change or
add a hub backlog line (tarodan-ops: `docs/design-system.md`, component parity
table).

## Verification

```bash
pnpm --filter @tarodan/ui typecheck
pnpm --filter @tarodan/ui lint
pnpm --filter @tarodan/ui test          # jsdom component tests (src/**/*.test.tsx)
pnpm --filter @tarodan/web typecheck     # every consumer
pnpm --filter @tarodan/admin typecheck
```

A shared component is not done when only one app compiles.
