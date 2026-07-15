"use client";

import Link from "next/link";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormError, useZodForm } from "@tarodan/ui/form";
import { useLocale, useTranslations } from "next-intl";
import { AuthCard } from "./AuthCard";
import { forgotPasswordSchema, type ForgotPasswordValues } from "../_lib/auth";
import { useForgotPassword } from "../_hooks/useForgotPassword";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const locale = useLocale();
  const { submit, sent, reset } = useForgotPassword();
  const form = useZodForm(forgotPasswordSchema(locale), {
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordValues) => submit(values.email);

  if (sent) {
    return (
      <AuthCard
        title={t("auth.emailSentTitle")}
        description={
          <>
            {t("auth.resetLinkSentDesc")}{" "}
            <strong className="text-heading">{form.getValues("email")}</strong>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
            <p className="text-sm text-warning-800">{t("auth.spamHint")}</p>
          </div>

          <Button asChild className="w-full">
            <Link href="/login">{t("auth.backToLogin")}</Link>
          </Button>

          <Button variant="secondary" onClick={reset} className="w-full">
            {t("auth.tryDifferentEmail")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.forgotPasswordTitle")}
      description={t("auth.forgotPasswordDesc")}
      backHref="/login"
      backLabel={t("auth.backToLogin")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-primary-600 hover:text-primary-700"
          >
            {t("auth.signUp")}
          </Link>
        </>
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="email"
          type="email"
          label={t("auth.emailAddress")}
          placeholder="ornek@email.com"
          autoFocus
        />

        <FormError />

        <Button
          type="submit"
          isLoading={form.formState.isSubmitting}
          className="w-full"
        >
          {t("auth.sendResetLink")}
        </Button>
      </Form>
    </AuthCard>
  );
}
