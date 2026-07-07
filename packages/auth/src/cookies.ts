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
