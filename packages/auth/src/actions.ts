import 'server-only';

import type { AuthConfig } from './config';
import type { SessionToolkit } from './session';

export interface LoginInput {
	email: string;
	password: string;
	twoFactorCode?: string;
}

export type AuthErrorReason = 'invalid' | 'unverified' | 'connection' | 'unknown';

export type AuthLoginResult =
	| { status: 'ok' }
	| { status: '2fa' }
	| { status: 'error'; reason: AuthErrorReason; serverMessage?: string };

interface AuthErrorResponse {
	errorCode?: string;
	i18nKey?: string;
	message?: string;
}

function isEmailNotVerified(data: AuthErrorResponse | null): boolean {
	return (
		data?.errorCode === 'EMAIL_NOT_VERIFIED' ||
		data?.i18nKey === 'server.auth.emailNotVerifiedLogin'
	);
}

/**
 * The auth flow LOGIC (login / google-login / logout / forgot-password),
 * factored out of the admin app. Pure async functions — NOT Server Actions and
 * carrying NO user-facing copy: each app wraps these in its own `'use server'`
 * file, maps the `reason` codes to localized messages, and handles `redirect()`.
 * On a successful login the tokens are written to the app's httpOnly cookies here.
 */
export function createAuthLogic<TUser>(config: AuthConfig, session: SessionToolkit<TUser>) {
	const { apiBaseUrl, endpoints } = config;

	async function login(input: LoginInput): Promise<AuthLoginResult> {
		let res: Response;
		try {
			res = await fetch(`${apiBaseUrl}${endpoints.login}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: input.email,
					password: input.password,
					...(input.twoFactorCode ? { twoFactorCode: input.twoFactorCode } : {}),
				}),
				cache: 'no-store',
			});
		} catch {
			return { status: 'error', reason: 'connection' };
		}

		const data = (await res.json().catch(() => null)) as AuthErrorResponse & {
			requires2FA?: boolean;
			tokens?: { accessToken?: string; refreshToken?: string };
		};

		if (res.ok && data?.requires2FA) return { status: '2fa' };
		if (res.ok && data?.tokens?.accessToken && data.tokens.refreshToken) {
			session.writeTokens(data.tokens.accessToken, data.tokens.refreshToken);
			return { status: 'ok' };
		}
		if ((res.status === 401 || res.status === 400) && isEmailNotVerified(data)) {
			return { status: 'error', reason: 'unverified', serverMessage: data?.message };
		}
		if (res.status === 401 || res.status === 400) {
			return { status: 'error', reason: 'invalid' };
		}
		return { status: 'error', reason: 'unknown', serverMessage: data?.message };
	}

	/**
	 * Exchange a Google id_token for app tokens. Mirrors `login`: same result
	 * shape, same token-writing, same `reason` mapping — Google is a first-class
	 * flow through the engine, not a bespoke per-app fetch. Requires
	 * `endpoints.google` to be configured (web only; admin omits it).
	 */
	async function googleLogin(idToken: string): Promise<AuthLoginResult> {
		if (!endpoints.google) {
			return { status: 'error', reason: 'unknown', serverMessage: 'Google login not configured' };
		}
		let res: Response;
		try {
			res = await fetch(`${apiBaseUrl}${endpoints.google}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ idToken }),
				cache: 'no-store',
			});
		} catch {
			return { status: 'error', reason: 'connection' };
		}

		const data = await res.json().catch(() => null);

		if (res.ok && data?.tokens?.accessToken) {
			session.writeTokens(data.tokens.accessToken, data.tokens.refreshToken);
			return { status: 'ok' };
		}
		if (res.status === 401 || res.status === 400) {
			return { status: 'error', reason: 'invalid' };
		}
		return { status: 'error', reason: 'unknown', serverMessage: data?.message };
	}

	async function logout(): Promise<void> {
		const { refresh } = session.readTokens();
		try {
			await fetch(`${apiBaseUrl}${endpoints.logout}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
				cache: 'no-store',
			});
		} catch {
			/* ignore — we log out locally regardless */
		}
		session.clearTokens();
	}

	async function forgotPassword(email: string): Promise<void> {
		try {
			await fetch(`${apiBaseUrl}${endpoints.forgotPassword}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email }),
				cache: 'no-store',
			});
		} catch {
			/* swallow — never reveal whether the e-mail exists */
		}
	}

	return { login, googleLogin, logout, forgotPassword };
}
