import 'server-only';

import type { AuthConfig } from './config';
import type { SessionToolkit } from './session';

export interface LoginInput {
	email: string;
	password: string;
	twoFactorCode?: string;
}

export type AuthLoginResult =
	| { status: 'ok' }
	| { status: '2fa' }
	| { status: 'error'; reason: 'invalid' | 'connection' | 'unknown'; serverMessage?: string };

/**
 * The auth flow LOGIC (login / logout / forgot-password), factored out of the
 * admin app. Pure async functions — NOT Server Actions and carrying NO
 * user-facing copy: each app wraps these in its own `'use server'` file, maps
 * the `reason` codes to localized messages, and handles `redirect()`. On a
 * successful login the tokens are written to the app's httpOnly cookies here.
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

		const data = await res.json().catch(() => null);

		if (res.ok && data?.requires2FA) return { status: '2fa' };
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

	return { login, logout, forgotPassword };
}
