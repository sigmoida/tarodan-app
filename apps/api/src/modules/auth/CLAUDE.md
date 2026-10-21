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

## Sign-in methods and step-up

- `sign-in-methods/` (`@Controller("auth")`): `GET /auth/sign-in-methods`
  (`hasPassword` and the linked providers), `POST /auth/reauth` and the
  writes. Shapes, providers and `errorCode` values come from
  `packages/types/src/sign-in-methods.ts`; never re-type them.
- `reauth/`: the step-up. `POST /auth/reauth` takes the password, or, only for
  an account without one, a sign-in of a linked provider at most 5 minutes
  old (`iat`); it answers an **opaque** token stored in Redis by its SHA-256,
  bound to the user, for 5 minutes, reusable within that time. Not a JWT:
  `JwtStrategy` checks no token type. 5 failed proofs in 15 minutes lock the
  step-up (`429 REAUTH_LOCKED`, SecurityLog `reauth_failed`/`reauth_locked`,
  Sentry warning). Attempts are counted before the proof is checked, so
  parallel requests cannot pass the limit. Redis down fails closed (no proof
  checked and no token issued: 503; none accepted: 403).
- A sensitive write takes `@RequireReauth()` (`ReauthGuard`, after the
  global JWT guard; one guard, one rule in `reauth/reauth-policy.ts`). The
  token is the body field `reauthToken`; only when the body has none
  (`undefined`, or no body as on `DELETE`) the `X-Reauth-Token` header.
  Anything present counts as sent and is checked (an empty string or `null`
  is refused). Declare `reauthToken` in the DTO when the route has a body.
  **No step-up problem is a 401**: clients treat 401 as an expired session.
  Missing or expired token: `403 REAUTH_REQUIRED`; wrong proof:
  `403 REAUTH_FAILED`.
- Two policies. `@RequireReauth()`: a token is always required (the sign-in
  method writes). `@RequireReauth({ required: "setting", flow })`: a token
  that is sent is always checked, and a request without one is refused only
  while the platform setting `auth_require_reauth_for_sensitive_actions`
  (`REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING`, admin Settings >
  Security, off by default) is on. It covers `DELETE /users/me` and
  `POST /auth/email/request-change`, which mobile 1.0.5 calls without a
  token, nor does web until it sends one. **Switch the setting on only after
  the web release that sends the token is live and
  `min_supported_app_version_ios` and `_android` are above 1.0.5**
  (tarodan-ops `compat.md`). The setting is
  read uncached on each such request without a token, so switching it on
  applies at once; a failed read fails the request. The guard sets the
  route's `auth.flow` tag (`account_delete`, `email_change`) before it
  checks, so refusals are traceable. A guard refusal writes no SecurityLog
  row; failed proofs are logged by `POST /auth/reauth`.
- Writes decide and write in one transaction under the user row lock
  (`SELECT ... FOR UPDATE`), log a SecurityLog row, send the T5 account
  security notice after commit and keep the sessions. `setPassword` lives in
  `auth-password.service.ts` (409 `passwordAlreadySet` when one exists);
  changing a password stays in `security/`.
- The step-up and every write set the Sentry tag `auth.flow` (`reauth`,
  `password_set`, ...); add new step-up routes to
  `guards/critical-route-throttles.spec.ts`. Never log the token or its hash.

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
tokens in the same transaction. `DELETE /users/me` takes the setting-gated
step-up (see "Sign-in methods and step-up"); the admin deletion path does not.

## Contract

Auth, token, cookie, error-code and consent changes are visible to mobile: add a
hub contract delta and keep old clients working.
