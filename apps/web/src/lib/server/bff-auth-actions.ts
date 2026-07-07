'use server';

import { webAuthConfig, type WebUser } from '@/lib/auth.config';
import { authLogic, bffSession, getSession } from './bff-session';

export type WebLoginResult =
  | { status: 'ok'; user: WebUser | null }
  | { status: '2fa' }
  | { status: 'error'; message: string };

function reasonMessage(
  reason: 'invalid' | 'connection' | 'unknown',
  serverMessage: string | undefined,
): string {
  if (reason === 'connection') return 'Sunucuya bağlanılamadı.';
  if (reason === 'invalid') return 'E-posta veya şifre hatalı';
  return serverMessage || 'Giriş başarısız';
}

/**
 * BFF Server Actions for the web app (email/password login, Google login,
 * logout, forgot-password). On success the tokens are written to the app's
 * httpOnly cookies inside `@tarodan/auth`; the resolved user is returned so the
 * client store can hydrate. NOT wired into the login UI yet — part of the
 * foundation for the authed-surface cutover.
 */
export async function loginAction(input: {
  email: string;
  password: string;
  twoFactorCode?: string;
}): Promise<WebLoginResult> {
  const result = await authLogic.login(input);
  if (result.status === 'error') {
    return { status: 'error', message: reasonMessage(result.reason, result.serverMessage) };
  }
  if (result.status === '2fa') return { status: '2fa' };
  const user = await getSession();
  return { status: 'ok', user };
}

export async function googleLoginAction(idToken: string): Promise<WebLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${webAuthConfig.apiBaseUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    });
  } catch {
    return { status: 'error', message: 'Sunucuya bağlanılamadı.' };
  }
  const data = await res.json().catch(() => null);
  if (res.ok && data?.tokens?.accessToken) {
    bffSession.writeTokens(data.tokens.accessToken, data.tokens.refreshToken);
    const user = await getSession();
    return { status: 'ok', user };
  }
  return { status: 'error', message: data?.message || 'Google ile giriş başarısız' };
}

export async function logoutAction(): Promise<void> {
  await authLogic.logout();
}

export async function forgotPasswordAction(email: string): Promise<{ ok: true }> {
  await authLogic.forgotPassword(email);
  return { ok: true };
}
