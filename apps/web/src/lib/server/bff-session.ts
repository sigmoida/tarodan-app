import "server-only";

import {
  createSession,
  createAuthLogic,
  type ApiFetchResult,
} from "@tarodan/auth";
import { webAuthConfig, mapWebUser, type WebUser } from "@/lib/auth.config";

/**
 * Server-only BFF session core for the web app, built on the shared
 * `@tarodan/auth` engine. This is the NEW server-owned-session path (Next-owned
 * `web_at` / `web_rt` cookies + `Bearer` to NestJS). It is introduced ALONGSIDE
 * the existing direct-to-API auth (authStore + `lib/server/session.ts`) — the
 * live cutover (pointing the client at the `/api` proxy, swapping middleware,
 * rewiring authStore) is a separate, verified step; nothing routes here yet.
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

export type { WebUser, ApiFetchResult };
