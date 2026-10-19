# Auth module (and identity, consents, blocking)

Sessions, guards and decorators, social login, plus the pointers for the
neighbouring modules `legal-identity/`, `consent/`, `user-block/`,
`user-report/` and `security/` (2FA, sessions). API rules:
[apps/api/CLAUDE.md](../../../CLAUDE.md). AuthZ and security changes are senior
work (Opus) and need tests.

## Shape

- `auth.service.ts` is the facade. Responsibilities: `auth-token` (issue,
  refresh, rotate, logout), `auth-registration`, `auth-login`, `auth-password`,
  `social/social-login` (Google, Apple), `verification/` (e-mail change, phone).
- Controllers: `auth.controller.ts` (`/auth`), `admin-auth.controller.ts`
  (`/auth/admin`). Strategies: `jwt`, `jwt-refresh`, `admin-jwt`.

## Guards and decorators

- Global guard order (`app.module.ts`): BlockedIp -> Throttler -> Csrf ->
  JwtAuth -> BannedUser. **Default closed**: every route needs a token unless
  it is `@Public()` (which still attempts optional auth).
- Decorators (`decorators/`): `@Public`, `@AdminRoute`, `@CurrentUser`,
  `@Roles`, `@RequirePermission`, `@BypassPermissionMatrix`.
- Admin routes pair `@AdminRoute` with an admin guard (`AdminJwtAuthGuard` +
  `RolesGuard`). `RolesGuard.PERMISSION_MAP` maps `/api/admin/<segment>` to a
  permission and **fails closed** for unmapped segments (`super_admin` passes).
  Contract specs: `admin-guard-pairing`, `permission-map-coverage`,
  `roles-guard-url-normalization`. Add a new admin segment to the map.
- Services own ownership checks ("is this your order?"); access is the
  decorators' job. No hand-rolled role checks in services.

## Sessions and cookies

- Cookie names and options live only in `utils/auth-cookies.ts` (user
  `access_token`/`refresh_token`, admin `admin_token`/`admin_refresh_token`,
  `csrf_token`). Never add a second cookie convention.
- Browser cookie auth is CSRF-protected (double submit, timing-safe,
  `guards/csrf.guard.ts`); requests without auth cookies (mobile bearer, BFF)
  skip it. Mobile uses `Authorization: Bearer`.
- Refresh tokens are stored hashed and rotate on every refresh; a token revoked
  within `REFRESH_ROTATION_GRACE_MS` (60 s) is accepted once (race, not replay).
  Password reset revokes every session.
- Staff accounts (`AdminUser` rows) can never open a customer session
  (`utils/staff-account.ts`), checked after the password so the response does
  not reveal staff status.
- Login rejection order is fixed, and the missing-user paths do a dummy bcrypt
  compare (`utils/timing-pad.ts`) against user enumeration.

## Throttles

Sensitive routes add a strict `@Throttle` on top of the global limit (login 5/min
is the pattern; forgot-password 3/min; refresh 60/min).
`guards/critical-route-throttles.spec.ts` pins them; keep it green and add new
sensitive routes to it. Known gap (hub backlog): the throttler counts by
`req.ip`, so web BFF traffic shares one bucket.

## 2FA and social login

- 2FA lives in `modules/security/` (TOTP secret encrypted at rest, backup codes
  hashed and consumed by CAS). Social login never bypasses 2FA
  (`TWO_FACTOR_PASSWORD_REQUIRED`).
- `social/social-identity.service.ts` owns every OAuthAccount write for Google
  and Apple: an existing link wins; else the e-mail is matched
  case-insensitively (never a deleted row). A verified match is linked and
  keeps its password and sessions. An unverified match is **taken over** in one
  transaction: password, refresh and push tokens, pending reset/verify/change
  and phone codes, 2FA, phone, birth date, legal identity and marketing opt-in
  are cleared, the consents withdrawn (`social_link_reset`), then linked and
  verified (SecurityLog `social_link_reset`, Sentry warning). A legacy link to
  a still-unverified account only loses the password. The e-mail match is
  `lower(email) = lower($1)`, never Prisma `mode: "insensitive"` (an unescaped
  ILIKE). Staff and banned matches get nothing written. A lost P2002 race
  resolves to the winner's link or is retried once.
- Apple refresh tokens are stored encrypted (`APPLE_TOKEN_ENCRYPTION_KEY`);
  account deletion enqueues revocation in the deletion transaction (outbox).
  Permanent failures go to the DLQ; redrive with
  `maintenance/redrive-apple-token-revocations.ts` (dry run, then `--apply`;
  `docs/OPERATIONS.md`).
- Admin session timeout is the platform setting `admin_session_timeout_minutes`
  (`security/helpers/admin-session-timeout.ts`).

## Registration

- The user row and its consent records are written in **one transaction**; a
  consent failure rolls back the account. `acceptedConsents`, `birthDate` and
  legal identity are optional so old mobile versions keep working.
- Password rules come from `packages/types/src/password-policy.ts` (`@IsPassword`).

## Legal identity (`modules/legal-identity/`, `docs/IDENTITY.md`)

- TCKN and legal names are validated by `packages/types/src/legal-identity.ts`;
  a member can fill them once (`409 server.identity.locked` afterwards);
  corrections are admin-only with a reason and an audit row.
- Conflicts answer `nationalIdUnavailable` without revealing the other account.
  Submissions are IP- and member-budgeted before the uniqueness lookup.
- **Never log or return a TCKN**: responses carry `nationalIdMasked`;
  `StripSensitiveFieldsInterceptor`, Sentry redaction and the audit log strip
  the fields. Admin shows them through `MaskedValue`.
- Enforcement is client-side today; a server-side check before money actions is
  an open hub backlog item (ADR 0004).

## Consents (`modules/consent/`, `docs/CONSENTS.md`)

- Document versions live in `packages/types/src/legal-consent.ts` and are
  stamped by the server. Bumping a required document re-prompts every member.
- `consent_records` is append-only (DB trigger). Withdrawals are new rows.
- The `distance_sales_consent_required` setting stays **off** until the mobile
  version in production sends `distanceSalesAccepted`.

## Blocking and reports (`modules/user-block/`, `docs/USER_BLOCKING.md`)

- Blocks are symmetric and permanent. Use the single gates: `assertNotBlocked`
  (403), `assertVisibleTo` (404, does not leak the block), `getHiddenUserIds`,
  `isBlockedEither`. Never re-implement the filter.
- Blocks and user reports notify admins (`notifyAllAdmins`) through listeners;
  a notification failure never fails the block or report.

## Account deletion

`UserProfileService.deleteAccount` (`modules/user/profile/`) blocks on open
money, archives identity into `DeletedUserIdentity` (admin-only, undeletable)
before anonymising, frees the national id, and revokes Apple tokens and push
tokens in the same transaction.

## Contract

Auth, token, cookie, error-code and consent changes are visible to mobile: add a
hub contract delta and keep old clients working.
