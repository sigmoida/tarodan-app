"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import { Form, FormError, FormInput, useZodForm } from "@tarodan/ui/form";
import { loginSchema, type LoginValues } from "@/lib/schemas/auth";
import { useLogin } from "@/hooks/useLogin";
import { AuthCard } from "./AuthCard";

export function LoginForm({
  redirectTo,
  expiredReason,
}: {
  redirectTo?: string;
  expiredReason?: string;
}) {
  const t = useTranslations();
  const { login, requires2FA } = useLogin(redirectTo);
  const form = useZodForm(loginSchema(t), {
    defaultValues: { email: "", password: "", twoFactorCode: "" },
  });
  const expiredMessage =
    expiredReason === "idle"
      ? t("admin.auth.login.idleExpired")
      : expiredReason === "session"
        ? t("admin.auth.login.sessionExpired")
        : null;

  const onSubmit = async (values: LoginValues) => {
    const error = await login(values);
    if (error) form.setError("root", { message: error });
  };

  return (
    <AuthCard
      title={t("common.login")}
      footer={
        <Link
          href="/forgot-password"
          className="font-semibold text-primary-600 hover:text-primary-700"
        >
          {t("admin.auth.login.forgotPasswordLink")}
        </Link>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-6">
        {expiredMessage && <Alert variant="warning">{expiredMessage}</Alert>}
        <FormError />

        <FormInput
          name="email"
          label={t("common.email")}
          type="email"
          placeholder="admin@tarodan.com"
        />

        <FormInput
          name="password"
          label={t("admin.auth.common.password")}
          type="password"
          placeholder="••••••••"
        />

        {requires2FA && (
          <FormInput
            name="twoFactorCode"
            label={t("admin.auth.login.verificationCode")}
            placeholder="000000"
            maxLength={9}
            autoComplete="one-time-code"
          />
        )}

        <Button
          type="submit"
          size="lg"
          isLoading={form.formState.isSubmitting}
          className="w-full"
        >
          {t("common.login")}
        </Button>
      </Form>
    </AuthCard>
  );
}
