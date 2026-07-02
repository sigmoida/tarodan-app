# Admin — UI & Frontend Principles

Guidance for building UI in `apps/admin`. Read this before adding routes,
components, or hooks. These rules are enforced partly by ESLint
(`@tarodan/eslint-config/next`) and partly by review.

## 1. Base components come from `@tarodan/ui`

Never rebuild a primitive that already exists in `@tarodan/ui` (Button, Input,
Select, Textarea, Checkbox, Radio, Label, FormField, Card, Badge, StatusBadge,
Spinner, Modal, …). Import from `@tarodan/ui`.

- Raw `<button>`, `<input>`, `<select>`, `<textarea>` are **ESLint errors** —
  use the component. (`<input type="file">` is the only raw-input exception.)
- Need a variant/state that doesn't exist? Add it to `@tarodan/ui` (shared),
  don't fork a local copy.
- App-specific composite components (built _from_ `@tarodan/ui`) live in
  `src/components/…`.

## 2. Everything flows from design tokens

Colors, spacing, radius, and typography come from `@tarodan/design-tokens`
(via the Tailwind preset). In markup use **semantic token classes only**:
`primary`, `danger`, `success`, `info`, `warning`, `surface`, `surface-alt`,
`surface-elevated`, `heading`, `body`, `muted`, `subtle`, `border`, `inverted`.

- Raw Tailwind palette (`bg-gray-100`, `text-red-500`, …) and raw `white`/`black`
  utilities are **ESLint errors**.
- No hardcoded hex / rgba in components.
- Don't re-pass a component's built-in defaults (e.g. `border`, `rounded-lg`,
  `focus:ring-primary-200` on `<Input>`) — ESLint flags these as redundant.

## 3. Thin components, logic in hooks

A component should mostly render. Put data-fetching, form submission, and
side effects in a hook.

- Admin-specific logic → `src/hooks/` (e.g. `useLogin`, `useForgotPassword`,
  `useAdminResource`).
- Logic that is (or will be) shared across apps → a **package**, not here.
  Auth hooks are admin-only (mobile/web have their own), so they stay local.
- Use React context only when state is genuinely shared across a subtree
  (global auth already lives in the `authStore` zustand store — don't wrap it
  in another context "just because").

## 4. DRY — never duplicate

If you're about to copy a block, extract it (component, hook, or constant).

- Render shared elements **once** outside conditionals rather than in each
  branch (see `ForgotPasswordForm`: one "back to login" link, not two).
- Duplicated config/data (status maps, option lists, labels) is the most
  dangerous kind — it drifts silently. Keep one source of truth; prefer the
  shared `@tarodan/shared` status configs.
- Before writing a helper, check `@tarodan/ui`, `@tarodan/shared`,
  `src/lib/`, and `src/hooks/` for an existing one.

## 5. Small component APIs

Many props = a design smell. If a component needs a long prop list, it's
probably doing too much — split it, or lift composition to the caller
(`children`, slots) instead of flags.

- Prefer composition (`<AuthCard title=…>{children}</AuthCard>`) over
  configuration (`<AuthCard title subtitle footer showX showY …>`).

## 6. Layouts & routing (App Router)

Separate concerns with **route groups**, each with its own `layout.tsx`:

- `src/app/(auth)/` — unauthenticated pages (login, forgot-password). Auth
  layout: centered card frame, brand, no admin chrome. Shared brand
  header/footer + "already logged in?" redirect live in the layout.
- `src/app/(admin)/` — authenticated app. Admin layout: sidebar/topbar +
  providers (query/confirm/prompt).
- One screen = one concern. A toggle inside a page that swaps between two
  distinct flows (e.g. login vs forgot-password) should be **two routes**,
  not one component with a mode flag.

## 7. Folder organization

```
src/
  app/
    (auth)/            # login, forgot-password  → auth layout
    (admin)/           # dashboard & everything else → admin layout
    layout.tsx         # root (fonts, Toaster, AuthBootstrap)
  components/
    <feature>/         # feature-scoped composites, e.g. components/auth/
    …                  # cross-cutting admin components
  hooks/               # admin-specific hooks
  lib/                 # api client, stores, utils
```

Feature components live under `components/<feature>/` (e.g. `components/auth/`),
not scattered at the components root.

## 8. Shared config is upstream — don't fork it

`tsconfig`, Tailwind, and ESLint all extend shared packages
(`@tarodan/tsconfig/nextjs`, `@tarodan/design-tokens/tailwind`,
`@tarodan/eslint-config/next`). App config files only hold app-specific bits
(paths, content globs, one-off animations). Change a shared rule in the
package, not by overriding here.

---

### Reference example: the auth refactor

The `(auth)` group is the canonical example of these rules:

- **Routes**: `(auth)/login` + `(auth)/forgot-password` (separate routes, one
  auth layout) instead of a single login page with a `forgotMode` toggle.
- **Components** (`components/auth/`): `AuthCard` (tiny `title`+`children` API,
  wraps the design-system `Card`), `LoginForm`, `ForgotPasswordForm` — all
  built from `@tarodan/ui` `Button`/`Input`.
- **Hooks** (`hooks/`): `useLogin`, `useForgotPassword`,
  `useRedirectIfAuthenticated` — the pages/forms stay thin.
- **No raw primitives, no palette colors, no inline spinner** (`Button
  isLoading` handles it), links are `next/link`.
