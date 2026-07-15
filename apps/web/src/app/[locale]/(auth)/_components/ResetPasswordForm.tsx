"use client";

import { Link } from "@/i18n/navigation";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormError, useZodForm } from "@tarodan/ui/form";
import { useLocale, useTranslations } from "next-intl";
import { AuthCard } from "./AuthCard";
import { resetPasswordSchema, type ResetPasswordValues } from "../_lib/auth";
import { useResetPassword } from "../_hooks/useResetPassword";
import { PasswordChecklist } from "./PasswordChecklist";

export function ResetPasswordForm() {
  const t = useTranslations();
  const locale = useLocale();
  const { token, success, submit } = useResetPassword();

  const form = useZodForm(resetPasswordSchema(locale), {
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { watch, setError } = form;
  const password = watch("password");

  const onSubmit = async (values: ResetPasswordValues) => {
    const err = await submit(values.password);
    if (err) setError("root", { message: err });
  };

  // Token Error State
  if (!token) {
    return (
      <AuthCard
        title={t("auth.invalidLink")}
        description={t("auth.invalidLinkDesc")}
      >
        <Button asChild className="w-full">
          <Link href="/forgot-password">{t("auth.requestNewLink")}</Link>
        </Button>
      </AuthCard>
    );
  }

  // Success State
  if (success) {
    return (
      <AuthCard
        title={t("auth.passwordChanged")}
        description={t("auth.passwordChangedDesc")}
      >
        <Button asChild className="w-full">
          <Link href="/login">{t("auth.loginNow")}</Link>
        </Button>
      </AuthCard>
    );
  }

  // Main Form
  return (
    <AuthCard
      title={t("auth.createNewPassword")}
      description={t("auth.createNewPasswordDesc")}
      backHref="/login"
      backLabel={t("auth.backToLogin")}
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="password"
          type="password"
          label={t("auth.newPassword")}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <PasswordChecklist password={password} />

        <FormInput
          name="confirmPassword"
          type="password"
          label={t("auth.confirmPassword")}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <FormError />

        <Button
          type="submit"
          isLoading={form.formState.isSubmitting}
          className="w-full"
        >
          {t("settings.changePassword")}
        </Button>
      </Form>
    </AuthCard>
  );
}
