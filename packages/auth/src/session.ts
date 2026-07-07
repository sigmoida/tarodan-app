import 'server-only';

import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import type { AuthConfig } from './config';
import { cookieOptions } from './cookies';

export interface ApiFetchResult {
	res: Response;
	/**
	 * Present when this call refreshed the access token. The caller MUST persist
	 * these onto its outgoing response (`attachSessionCookies`) — a Route Handler
	 * that returns a hand-built `NextResponse` would otherwise leave the browser
	 * on the old (rotated/invalid) refresh token and bounce it to /login.
	 */
	refreshed?: { access: string; refresh: string };
}

export interface SessionToolkit<TUser> {
	readTokens: () => { access?: string; refresh?: string };
	writeTokens: (access: string, refresh: string) => void;
	clearTokens: () => void;
	refreshTokens: (refresh: string) => Promise<{ access: string; refresh: string } | null>;
	apiFetch: (path: string, init?: RequestInit) => Promise<ApiFetchResult>;
	attachSessionCookies: (
		res: NextResponse,
		tokens: { access: string; refresh: string },
	) => void;
	getSession: () => Promise<TUser | null>;
	apiBaseUrl: () => string;
}

/**
 * The server-only session core for one Next.js BFF app. Owns the app's httpOnly
 * cookies, refreshes the access token server-side (single-flight, since the
 * refresh token rotates), and calls the upstream API with a `Bearer` header.
 *
 * `mapUser` turns the upstream `/profile` payload into the app's user type
 * (return `null` for an invalid/absent user).
 */
export function createSession<TUser>(
	config: AuthConfig,
	mapUser: (raw: unknown) => TUser | null,
): SessionToolkit<TUser> {
	const { cookies: names, apiBaseUrl, endpoints, upstreamRefreshCookie, ttls } = config;
	const isProd = config.isProd ?? process.env.NODE_ENV === 'production';

	const readTokens = () => {
		const store = cookies();
		return {
			access: store.get(names.access)?.value,
			refresh: store.get(names.refresh)?.value,
		};
	};

	const writeTokens = (access: string, refresh: string) => {
		const store = cookies();
		store.set(names.access, access, cookieOptions(ttls.accessMaxAge, isProd));
		store.set(names.refresh, refresh, cookieOptions(ttls.refreshMaxAge, isProd));
	};

	const clearTokens = () => {
		const store = cookies();
		store.delete(names.access);
		store.delete(names.refresh);
	};

	async function doRefresh(
		refresh: string,
	): Promise<{ access: string; refresh: string } | null> {
		const res = await fetch(`${apiBaseUrl}${endpoints.refresh}`, {
			method: 'POST',
			headers: { Cookie: `${upstreamRefreshCookie}=${refresh}` },
			cache: 'no-store',
		});
		if (!res.ok) return null;
		const tokens = await res.json().catch(() => null);
		if (!tokens?.accessToken) return null;
		return { access: tokens.accessToken, refresh: tokens.refreshToken ?? refresh };
	}

	// Single-flight: a page firing many /api calls after the access token expired
	// would otherwise trigger N concurrent refreshes. Since the API ROTATES the
	// refresh token, only the first would succeed and the rest would 401 → bounce
	// to /login. Sharing one in-flight refresh spends the rotating token once.
	let inflight: Promise<{ access: string; refresh: string } | null> | null = null;
	const refreshTokens = (refresh: string) => {
		if (!inflight) {
			inflight = doRefresh(refresh).finally(() => {
				inflight = null;
			});
		}
		return inflight;
	};

	async function apiFetch(path: string, init: RequestInit = {}): Promise<ApiFetchResult> {
		const { access, refresh } = readTokens();
		const authHeaders = (token?: string) => {
			const h = new Headers(init.headers);
			if (token) h.set('Authorization', `Bearer ${token}`);
			return h;
		};

		let res = await fetch(`${apiBaseUrl}${path}`, {
			...init,
			headers: authHeaders(access),
			cache: 'no-store',
		});

		if (res.status === 401 && refresh) {
			const next = await refreshTokens(refresh);
			if (next) {
				try {
					writeTokens(next.access, next.refresh);
				} catch {
					/* Server Component context can't write cookies; the proxy/middleware will. */
				}
				res = await fetch(`${apiBaseUrl}${path}`, {
					...init,
					headers: authHeaders(next.access),
					cache: 'no-store',
				});
				return { res, refreshed: next };
			}
		}
		return { res };
	}

	const attachSessionCookies = (
		res: NextResponse,
		tokens: { access: string; refresh: string },
	) => {
		res.cookies.set(names.access, tokens.access, cookieOptions(ttls.accessMaxAge, isProd));
		res.cookies.set(names.refresh, tokens.refresh, cookieOptions(ttls.refreshMaxAge, isProd));
	};

	async function getSession(): Promise<TUser | null> {
		const { access } = readTokens();
		if (!access) return null;
		const res = await fetch(`${apiBaseUrl}${endpoints.profile}`, {
			headers: { Authorization: `Bearer ${access}` },
			cache: 'no-store',
		});
		if (!res.ok) return null;
		const raw = await res.json().catch(() => null);
		return mapUser(raw);
	}

	return {
		readTokens,
		writeTokens,
		clearTokens,
		refreshTokens,
		apiFetch,
		attachSessionCookies,
		getSession,
		apiBaseUrl: () => apiBaseUrl,
	};
}
