import type { Request } from "express";
import { REAUTH_TOKEN_HEADER } from "@tarodan/types";

/** Route metadata `@RequireReauth()` writes and `ReauthGuard` reads. */
export const REAUTH_POLICY_METADATA = "tarodan:reauth-policy";

/**
 * When a route needs a step-up token.
 *
 * - `always`: every request needs a live token (the sign-in method writes).
 * - `setting`: a token that is sent is always checked; a request without one
 *   is refused only while the platform setting
 *   `REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING` is on. For routes that
 *   older mobile versions call without a token (account deletion, e-mail
 *   change), so they keep working until the minimum supported version sends
 *   one.
 */
export type ReauthRequirement = "always" | "setting";

export interface ReauthPolicy {
  required: ReauthRequirement;
  /**
   * Sentry `auth.flow` tag of the route, set before the check so a refused
   * request is traceable too.
   */
  flow?: string;
}

/** A route with the guard but no metadata needs a token (fails closed). */
export const DEFAULT_REAUTH_POLICY: ReauthPolicy = { required: "always" };

/**
 * The one rule for where the token is read: the body field `reauthToken`
 * first; when the body has none (`undefined`, or no body, as on most `DELETE`
 * requests), the `X-Reauth-Token` header. Anything present counts as sent,
 * even an empty string or `null`, and is then checked (and refused unless it
 * is a live token). `undefined` means no token was sent.
 */
export function readReauthToken(request: Request): unknown {
  const fromBody: unknown = (
    request.body as { reauthToken?: unknown } | undefined
  )?.reauthToken;
  if (fromBody !== undefined) return fromBody;
  return request.headers?.[REAUTH_TOKEN_HEADER];
}
