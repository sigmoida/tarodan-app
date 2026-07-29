import "server-only";

import {
  createSession,
  createAuthLogic,
  type ApiFetchResult,
} from "@tarodan/auth";
import { webAuthConfig, mapWebUser, type WebUser } from "@/lib/auth.config";

/**
 * Server-only session core for the web app, built on the shared `@tarodan/auth`
 * engine. This is the live server-owned-session path: the client routes through
 * the `/gateway` proxy and login uses these actions, so the Next-owned
 * `web_at` / `web_rt` cookies carry the session and the `Bearer` to NestJS.
 *
 * Safe to call `getSession` from Server Components / layouts — it never writes
 * cookies. The public surface (`getSession`, `AuthUser`) is preserved so the
 * `(auth)` and `profile` layout guards need no changes.
 */
const session = createSession<WebUser>(webAuthConfig, mapWebUser);

export const {
  readTokens,
  writeTokens,
  clearTokens,
  refreshTokens,
  apiFetch,
  attachSessionCookies,
  clearSessionCookies,
  getSession,
  apiBaseUrl,
} = session;

/** Bound auth logic (email/password login, logout, forgot-password). */
export const authLogic = createAuthLogic(webAuthConfig, session);

/** The bound toolkit, for the BFF proxy route and Google login. */
export const bffSession = session;

/** Server-resolved user. Alias of the engine's `WebUser`. */
export type AuthUser = WebUser;

export type { WebUser, ApiFetchResult };
