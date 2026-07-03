'use server';

import { redirect } from 'next/navigation';
import {
  forgotPasswordSchema,
  loginSchema,
  type LoginValues,
} from '@/lib/schemas/auth';
import { apiBaseUrl, clearTokens, readTokens, writeTokens } from './session';

export type LoginResult =
  | { status: 'ok' }
  | { status: '2fa' }
  | { status: 'error'; message: string };

/**
 * Server Action: verify credentials against NestJS and, on success, store the
 * tokens in the admin app's httpOnly cookies. The tokens never reach the client.
 * Input is re-validated with the same schema the client uses.
 */
export async function loginAction(input: LoginValues): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: 'Geçersiz giriş bilgileri' };
  }
  const { email, password, twoFactorCode } = parsed.data;

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        ...(twoFactorCode ? { twoFactorCode } : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    return { status: 'error', message: 'Sunucuya bağlanılamadı.' };
  }

  const data = await res.json().catch(() => null);

  if (res.ok && data?.requires2FA) {
    return { status: '2fa' };
  }

  if (res.ok && data?.tokens?.accessToken) {
    writeTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return { status: 'ok' };
  }

  if (res.status === 401 || res.status === 400) {
    return {
      status: 'error',
      message: twoFactorCode
        ? 'Doğrulama kodu hatalı'
        : 'E-posta veya şifre hatalı girildi',
    };
  }
  return { status: 'error', message: data?.message || 'Giriş başarısız' };
}

/**
 * Server Action: request a password reset. Always reports success so we never
 * leak whether an email is registered.
 */
export async function forgotPasswordAction(email: string): Promise<{ ok: true }> {
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    // Invalid input → report success anyway (never leak).
    return { ok: true };
  }
  try {
    await fetch(`${apiBaseUrl()}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: parsed.data.email }),
      cache: 'no-store',
    });
  } catch {
    /* swallow — do not reveal whether the email exists */
  }
  return { ok: true };
}

/**
 * Server Action: revoke the session on the API, clear local cookies, and send
 * the user back to the login page.
 */
export async function logoutAction() {
  const { refresh } = readTokens();
  try {
    await fetch(`${apiBaseUrl()}/auth/admin/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
      cache: 'no-store',
    });
  } catch {
    /* ignore — we log out locally regardless */
  }
  clearTokens();
  redirect('/login');
}
