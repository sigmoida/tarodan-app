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
	/** POST — exchange a Google id_token for app tokens. Optional (web only). */
	google?: string;
}

export interface AuthConfig {
	/** The app-owned httpOnly cookie names (must differ per app). */
	cookies: { access: string; refresh: string };
	/**
	 * Optional JS-READABLE session-indicator cookie name. When set, the engine
	 * writes a non-httpOnly `'1'` cookie of this name alongside the httpOnly
	 * session cookies (and clears it on logout / rotates it on refresh), so the
	 * client can detect "there is a session" without a token and WITHOUT drifting
	 * from the real session — the server owns both. Omit to opt out (admin does).
	 */
	indicatorCookie?: string;
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
