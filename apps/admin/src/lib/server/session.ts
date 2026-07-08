import 'server-only';

import { createSession, createAuthLogic, type ApiFetchResult } from '@tarodan/auth';
import { adminAuthConfig, mapAdminUser, type AdminUser } from '@/lib/auth.config';

/**
 * Server-only session core for the admin BFF.
 *
 * The browser never sees the NestJS tokens: on login they're stored in this
 * app's OWN httpOnly cookies (`admin_at` / `admin_rt`), every call to NestJS is
 * made server-side with `Authorization: Bearer`, and access tokens are refreshed
 * server-side. All of that logic now lives in the shared `@tarodan/auth` engine;
 * this file just binds it to the admin config and re-exports the same surface
 * the rest of the app already imports (`getSession`, `apiFetch`, …).
 */
const session = createSession<AdminUser>(adminAuthConfig, mapAdminUser);

export const {
  readTokens,
  writeTokens,
  clearTokens,
  refreshTokens,
  apiFetch,
  attachSessionCookies,
  getSession,
  apiBaseUrl,
} = session;

/** Auth-flow logic (login / logout / forgot-password); wrapped by auth-actions. */
export const authLogic = createAuthLogic(adminAuthConfig, session);

export type { AdminUser, ApiFetchResult };
