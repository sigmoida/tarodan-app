/**
 * Shared BFF auth engine — configuration surface.
 *
 * A Next.js app owns its OWN httpOnly session cookies and talks to the upstream
 * (NestJS) API server-side with a `Bearer` token. Everything app-specific
 * (cookie names, API base, endpoint paths, TTLs) is passed in here; the engine
 * itself is app-agnostic so `apps/admin` and `apps/web` can share one hardened
 * implementation.
 */

export interface AuthEndpoints {
	/** POST — verify credentials, returns `{ tokens, requires2FA }`. */
	login: string;
	/** POST — exchange the refresh token for a fresh access token (rotates). */
	refresh: string;
	/** GET — resolve the current user from the access token. */
	profile: string;
	/** POST — revoke the session upstream. */
	logout: string;
	/** POST — request a password reset e-mail. */
	forgotPassword: string;
}

export interface AuthConfig {
	/** The app-owned httpOnly cookie names (must differ per app). */
	cookies: { access: string; refresh: string };
	/** Full upstream API base including the `/api` prefix. */
	apiBaseUrl: string;
	endpoints: AuthEndpoints;
	/** Cookie name the upstream refresh endpoint reads the refresh token from. */
	upstreamRefreshCookie: string;
	ttls: { accessMaxAge: number; refreshMaxAge: number };
	/** Clock-skew margin (ms) when checking access-token expiry. Default 30s. */
	jwtSkewMs?: number;
	/** Secure-cookie flag. Defaults to `NODE_ENV === 'production'`. */
	isProd?: boolean;
}
