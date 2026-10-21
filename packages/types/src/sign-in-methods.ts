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
 *   writes (`POST /auth/password/set`) always need it. Account deletion
 *   (`DELETE /users/me`) and the e-mail change request
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
 * (`403 REAUTH_REQUIRED`). Off by default, because mobile 1.0.5 and older and
 * the current web send none. Switch it on only after the web release that
 * sends the token is live and `min_supported_app_version_ios` and
 * `min_supported_app_version_android` are above 1.0.5 (tarodan-ops
 * `compat.md`). A token that is sent is checked even while it is off.
 */
export const REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING =
  "auth_require_reauth_for_sensitive_actions";

/** `POST /auth/password/set`: only for an account that has no password yet. */
export interface SetPasswordRequest {
  newPassword: string;
  reauthToken: string;
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
} as const;

export type SignInMethodsErrorCode =
  (typeof SIGN_IN_METHODS_ERROR_CODES)[keyof typeof SIGN_IN_METHODS_ERROR_CODES];
