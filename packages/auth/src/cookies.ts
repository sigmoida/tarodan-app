/**
 * The single httpOnly cookie policy for app-owned session cookies. Edge-safe
 * (pure), so both the session core and the middleware share one definition.
 */
export interface SessionCookieOptions {
	httpOnly: true;
	secure: boolean;
	sameSite: 'lax';
	path: '/';
	maxAge: number;
}

export function cookieOptions(maxAge: number, isProd = false): SessionCookieOptions {
	return { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge };
}

/**
 * The JS-READABLE session-indicator cookie policy (NOT httpOnly). Written by the
 * engine alongside the httpOnly session cookies so the client can tell "there is
 * a session" without ever seeing a token — and without drifting from the real
 * session, since the server owns both. Holds nothing sensitive: just presence.
 */
export interface IndicatorCookieOptions {
	httpOnly: false;
	secure: boolean;
	sameSite: 'lax';
	path: '/';
	maxAge: number;
}

export function indicatorCookieOptions(
	maxAge: number,
	isProd = false,
): IndicatorCookieOptions {
	return { httpOnly: false, secure: isProd, sameSite: 'lax', path: '/', maxAge };
}
