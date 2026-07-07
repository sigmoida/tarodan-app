'use server';

import { redirect } from 'next/navigation';
import {
  forgotPasswordSchema,
  loginSchema,
  type LoginValues,
} from '@/lib/schemas/auth';
import { authLogic } from './session';

export type LoginResult =
  | { status: 'ok' }
  | { status: '2fa' }
  | { status: 'error'; message: string };

/**
 * Server Action: verify credentials against NestJS and, on success, store the
 * tokens in the admin app's httpOnly cookies (done inside `@tarodan/auth`). The
 * tokens never reach the client. Input is re-validated with the same schema the
 * client uses; the engine's `reason` codes are mapped to admin copy here.
 */
export async function loginAction(input: LoginValues): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: 'Geçersiz giriş bilgileri' };
  }

  // admin's tsconfig runs with strictNullChecks off, which makes zod infer every
  // field optional; the schema guarantees email/password at runtime, so normalize.
  const { email = '', password = '', twoFactorCode } = parsed.data;
  const result = await authLogic.login({
    email,
    password,
    twoFactorCode: twoFactorCode || undefined,
  });
  if (result.status === 'error') {
    const message =
      result.reason === 'connection'
        ? 'Sunucuya bağlanılamadı.'
        : result.reason === 'invalid'
          ? parsed.data.twoFactorCode
            ? 'Doğrulama kodu hatalı'
            : 'E-posta veya şifre hatalı girildi'
          : result.serverMessage || 'Giriş başarısız';
    return { status: 'error', message };
  }
  return result;
}

/**
 * Server Action: request a password reset. Always reports success so we never
 * leak whether an email is registered.
 */
export async function forgotPasswordAction(email: string): Promise<{ ok: true }> {
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (parsed.success) {
    await authLogic.forgotPassword(parsed.data.email);
  }
  return { ok: true };
}

/**
 * Server Action: revoke the session on the API, clear local cookies, and send
 * the user back to the login page.
 */
export async function logoutAction() {
  await authLogic.logout();
  redirect('/login');
}
