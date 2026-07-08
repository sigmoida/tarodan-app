import { NextResponse, type NextRequest } from 'next/server';
import type { AuthConfig } from './config';
import { isExpired } from './jwt';
import { cookieOptions, indicatorCookieOptions } from './cookies';

export interface AuthMiddlewareOptions {
	/** Paths that never require auth (login, forgot-password, …). */
	publicPaths: string[];
	/** Where to send unauthenticated users. Default `/login`. */
	loginPath?: string;
}

/**
 * Edge auth gate + proactive token refresh, factored out of the admin app.
 *
 * On every protected navigation: no refresh token → redirect to login; access
 * token missing/expired → refresh here (the cheapest place to keep it fresh
 * before RSCs read it) and rotate the cookies. Edge-safe: imports only the pure
 * `jwt`/`cookies` helpers, never the `server-only` session core.
 *
 * Import from `@tarodan/auth/middleware` (NOT the package root) so no
 * `server-only` module is pulled into the Edge bundle.
 */
export function createAuthMiddleware(config: AuthConfig, options: AuthMiddlewareOptions) {
	const isProd = config.isProd ?? process.env.NODE_ENV === 'production';
	const skew = config.jwtSkewMs ?? 30_000;
	const loginPath = options.loginPath ?? '/login';

	return async function middleware(request: NextRequest): Promise<NextResponse> {
		const { pathname } = request.nextUrl;

		if (options.publicPaths.some((p) => pathname.startsWith(p))) {
			return NextResponse.next();
		}

		const refresh = request.cookies.get(config.cookies.refresh)?.value;
		if (!refresh) {
			const loginUrl = new URL(loginPath, request.url);
			loginUrl.searchParams.set('redirect', pathname);
			const res = NextResponse.redirect(loginUrl);
			// No session → clear any stale JS-readable indicator so the client can't
			// mistakenly render as authed on the next page.
			if (config.indicatorCookie) res.cookies.set(config.indicatorCookie, '', { path: '/', maxAge: 0 });
			return res;
		}

		const access = request.cookies.get(config.cookies.access)?.value;
		if (!isExpired(access, skew)) {
			// Valid session — make sure the JS-readable indicator reflects it. This
			// self-heals sessions created before the indicator existed and keeps it
			// fresh on every authed navigation.
			if (config.indicatorCookie) {
				const res = NextResponse.next();
				res.cookies.set(
					config.indicatorCookie,
					'1',
					indicatorCookieOptions(config.ttls.refreshMaxAge, isProd),
				);
				return res;
			}
			return NextResponse.next();
		}

		// Access token missing/expired but the refresh token is present → refresh.
		const res = await fetch(`${config.apiBaseUrl}${config.endpoints.refresh}`, {
			method: 'POST',
			headers: { Cookie: `${config.upstreamRefreshCookie}=${refresh}` },
		});
		const tokens = res.ok ? await res.json().catch(() => null) : null;
		if (!tokens?.accessToken) {
			const res = NextResponse.redirect(new URL(loginPath, request.url));
			if (config.indicatorCookie) res.cookies.set(config.indicatorCookie, '', { path: '/', maxAge: 0 });
			return res;
		}

		const newRefresh = tokens.refreshToken ?? refresh;
		// Propagate to the current request so downstream RSCs read the fresh token…
		request.cookies.set(config.cookies.access, tokens.accessToken);
		request.cookies.set(config.cookies.refresh, newRefresh);
		const response = NextResponse.next({ request: { headers: request.headers } });
		// …and persist to the browser.
		response.cookies.set(
			config.cookies.access,
			tokens.accessToken,
			cookieOptions(config.ttls.accessMaxAge, isProd),
		);
		response.cookies.set(config.cookies.refresh, newRefresh, cookieOptions(config.ttls.refreshMaxAge, isProd));
		// Keep the JS-readable indicator alive across the rotation.
		if (config.indicatorCookie) {
			response.cookies.set(
				config.indicatorCookie,
				'1',
				indicatorCookieOptions(config.ttls.refreshMaxAge, isProd),
			);
		}
		return response;
	};
}
