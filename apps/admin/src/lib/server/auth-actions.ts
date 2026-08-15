"use server";

import { getTranslations } from "next-intl/server";
import {
  forgotPasswordSchema,
  loginSchema,
  type LoginValues,
} from "@/lib/schemas/auth";
import { authLogic } from "./session";

export type LoginResult =
  { status: "ok" } | { status: "2fa" } | { status: "error"; message: string };

/**
 * Server Action: verify credentials against NestJS and, on success, store the
 * tokens in the admin app's httpOnly cookies (done inside `@tarodan/auth`). The
 * tokens never reach the client. Input is re-validated with the same schema the
 * client uses; the engine's `reason` codes are mapped to admin copy here.
 */
export async function loginAction(input: LoginValues): Promise<LoginResult> {
  const t = await getTranslations();
  const parsed = loginSchema(t).safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: t("admin.auth.login.invalidInput") };
  }

  // admin's tsconfig runs with strictNullChecks off, which makes zod infer every
  // field optional; the schema guarantees email/password at runtime, so normalize.
  const { email = "", password = "", twoFactorCode } = parsed.data;
  const result = await authLogic.login({
    email,
    password,
    twoFactorCode: twoFactorCode || undefined,
  });
  if (result.status === "error") {
    const message =
      result.reason === "connection"
        ? t("admin.auth.login.connectionError")
        : result.reason === "invalid"
          ? parsed.data.twoFactorCode
            ? t("admin.auth.login.invalidCode")
            : t("admin.auth.login.invalidCredentials")
          : result.serverMessage || t("admin.auth.login.genericFailure");
    return { status: "error", message };
  }
  return result;
}

/**
 * Server Action: request a password reset. Always reports success so we never
 * leak whether an email is registered.
 */
export async function forgotPasswordAction(
  email: string,
): Promise<{ ok: true }> {
  const t = await getTranslations();
  const parsed = forgotPasswordSchema(t).safeParse({ email });
  if (parsed.success) {
    await authLogic.forgotPassword(parsed.data.email);
  }
  return { ok: true };
}

/**
 * Server Action: revoke the session on the API and clear local cookies.
 * The client owns the destination so idle expiry can preserve its return path.
 */
export async function logoutAction() {
  await authLogic.logout();
}
