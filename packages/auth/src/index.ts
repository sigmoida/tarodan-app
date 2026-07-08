/**
 * `@tarodan/auth` — the shared BFF auth engine for Tarodan's Next.js apps.
 *
 * The package ROOT is server-only (it re-exports the `server-only` session core
 * + auth logic + proxy). The Edge-safe middleware factory lives at the
 * `@tarodan/auth/middleware` subpath so importing it never pulls `server-only`
 * into the Edge bundle. Pure helpers (`isExpired`, `cookieOptions`) are exported
 * here too and are safe anywhere.
 */

export type { AuthConfig, AuthEndpoints } from './config';
export { createSession, type SessionToolkit, type ApiFetchResult } from './session';
export { createAuthLogic, type LoginInput, type AuthLoginResult } from './actions';
export { createBffProxy } from './proxy';
export { isExpired } from './jwt';
export { cookieOptions, type SessionCookieOptions } from './cookies';
