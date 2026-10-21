/**
 * Sign-in methods and step-up (re-authentication): the contract between the
 * API, web and mobile (mobile vendors this file into `src/types/`).
 *
 * - `GET /auth/sign-in-methods` answers `SignInMethods`.
 * - `POST /auth/reauth` takes a `ReauthRequest` and answers `ReauthResponse`.
 *   The token is short-lived and opaque; clients keep it in memory only.
 * - Sensitive writes take the token as `reauthToken` in the body or, when the
 *   body has no `reauthToken`, in the `X-Reauth-Token` header
 *   (`REAUTH_TOKEN_HEADER`; use the header on `DELETE`). The sign-in method
 *   writes always need it, and each answers the fresh `SignInMethods`:
 *   `POST /auth/password/set` (`SetPasswordRequest`),
 *   `POST /auth/social/google/link` (`GoogleLinkRequest`),
 *   `POST /auth/social/apple/link` (`AppleLinkRequest`) and
 *   `POST /auth/social/:provider/unlink` (`UnlinkProviderRequest`).
 *   Account deletion (`DELETE /users/me`) and the e-mail change request
 *   (`POST /auth/email/request-change`) check a token whenever one is sent,
 *   and need one only while the setting
 *   `REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING` is on.
 *
 * A step-up problem is never a 401 (both clients treat 401 as an expired
 * session): a missing or expired token is `403` with
 * `errorCode: "REAUTH_REQUIRED"`, a wrong proof is `403` with
 * `errorCode: "REAUTH_FAILED"`.
 */

/** Providers that can be linked to an account and used to sign in. */
export const SIGN_IN_PROVIDERS = ["google", "apple"] as const;

export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export function isSignInProvider(value: unknown): value is SignInProvider {
  return (
    typeof value === "string" &&
    (SIGN_IN_PROVIDERS as readonly string[]).includes(value)
  );
}

/** One provider identity linked to the signed-in account. */
export interface LinkedSignInProvider {
  provider: SignInProvider;
  /** The e-mail the provider reported when it was linked; may differ from the account e-mail. */
  email: string | null;
  /** ISO 8601. */
  linkedAt: string;
}

/** The signed-in account's sign-in methods. */
export interface SignInMethods {
  hasPassword: boolean;
  providers: LinkedSignInProvider[];
}

/**
 * Proof for `POST /auth/reauth`. `provider` selects the method: without it the
 * proof is the password. An account with a password can only confirm with it;
 * a provider proof is accepted only from an account without a password, for a
 * provider linked to it, and only from a fresh provider sign-in.
 */
export type ReauthRequest =
  | { password: string }
  | { provider: "google"; code?: string; idToken?: string }
  | { provider: "apple"; identityToken: string };

export interface ReauthResponse {
  /** Opaque; sent back as `reauthToken`. Never persist it. */
  reauthToken: string;
  /** ISO 8601. The token can be used for several writes until then. */
  expiresAt: string;
}

/**
 * Request header that carries the step-up token when the body has no
 * `reauthToken` (lower case, as Node reports it). The web gateway forwards it
 * (`FORWARDED_REQUEST_HEADERS` in `@tarodan/auth`).
 */
export const REAUTH_TOKEN_HEADER = "x-reauth-token";

/**
 * On/off platform setting (`isPlatformSettingOn`): while on, account deletion
 * and the e-mail change request are refused without a step-up token
 * (`403 REAUTH_REQUIRED`). Off by default, because no mobile version sends a
 * token yet (not 1.0.5, 1.1.0 or 1.1.1) and web sends none before its step-up
 * release. Switch it on only after the web release that sends the token is
 * live and `min_supported_app_version_ios` and
 * `min_supported_app_version_android` are at least the first mobile version
 * that sends it (tarodan-ops `compat.md`). A token that is sent is checked
 * even while it is off.
 */
export const REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING =
  "auth_require_reauth_for_sensitive_actions";

/** `POST /auth/password/set`: only for an account that has no password yet. */
export interface SetPasswordRequest {
  newPassword: string;
  reauthToken: string;
}

/**
 * `POST /auth/social/google/link`: web sends the popup `code`, native sends
 * the `idToken` (one of them, as on `POST /auth/google`).
 */
export interface GoogleLinkRequest {
  code?: string;
  idToken?: string;
  reauthToken: string;
}

/**
 * `POST /auth/social/apple/link`. Mobile also sends `authorizationCode`, as on
 * `POST /auth/apple`, so the Apple token can be revoked on unlink and on
 * account deletion; web sends none.
 */
export interface AppleLinkRequest {
  identityToken: string;
  authorizationCode?: string;
  reauthToken: string;
}

/** `POST /auth/social/:provider/unlink`. */
export interface UnlinkProviderRequest {
  reauthToken: string;
}

/**
 * The last-method rule (sign-in methods plan, decision D1): after an unlink
 * the account must keep a password or a Google link. Apple alone does not
 * count, because Apple sign-in is iOS-only on mobile (ADR 0012) and an
 * Apple-only account could not sign in on Android.
 *
 * True only when `provider` is linked and removing it keeps the rule. An
 * account has at most one link per provider; the rule still judges every row
 * of the provider as removed, so legacy data with two rows stays safe. The API
 * applies it under the user row lock; the clients use it to disable the
 * Disconnect button. Never re-implement it.
 */
export function canUnlinkProvider(
  methods: SignInMethods,
  provider: SignInProvider,
): boolean {
  if (!methods.providers.some((linked) => linked.provider === provider)) {
    return false;
  }
  const remaining = methods.providers.filter(
    (linked) => linked.provider !== provider,
  );
  return (
    methods.hasPassword ||
    remaining.some((linked) => linked.provider === "google")
  );
}

/** `errorCode` values of the sign-in methods and step-up routes. */
export const SIGN_IN_METHODS_ERROR_CODES = {
  /** 403: missing, expired or foreign `reauthToken`; confirm again. */
  reauthRequired: "REAUTH_REQUIRED",
  /** 403: the proof was wrong. */
  reauthFailed: "REAUTH_FAILED",
  /** 400: the account has a password, so only the password is accepted. */
  reauthMethodNotAllowed: "REAUTH_METHOD_NOT_ALLOWED",
  /** 429: too many failed proofs; differs from the generic per-IP throttle. */
  reauthLocked: "REAUTH_LOCKED",
  /** 503: the step-up store is unavailable; try again later. */
  reauthUnavailable: "REAUTH_UNAVAILABLE",
  /** 409: `POST /auth/password/set` on an account that has a password. */
  passwordAlreadySet: "PASSWORD_ALREADY_SET",
  /** 400: the provider token of a link could not be verified (never 401). */
  providerTokenInvalid: "PROVIDER_TOKEN_INVALID",
  /** 409: the account already has a link for this provider. */
  providerAlreadyLinked: "PROVIDER_ALREADY_LINKED",
  /** 409: the provider account is linked to another account (not named). */
  providerLinkedToOtherAccount: "PROVIDER_LINKED_TO_OTHER_ACCOUNT",
  /** 404: unlink of a provider that is not linked (a stale list). */
  providerNotLinked: "PROVIDER_NOT_LINKED",
  /** 409: the unlink would break the last-method rule (`canUnlinkProvider`). */
  lastSignInMethod: "LAST_SIGN_IN_METHOD",
} as const;

export type SignInMethodsErrorCode =
  (typeof SIGN_IN_METHODS_ERROR_CODES)[keyof typeof SIGN_IN_METHODS_ERROR_CODES];
