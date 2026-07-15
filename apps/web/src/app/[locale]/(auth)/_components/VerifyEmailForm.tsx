"use client";

import Link from "next/link";
import { Button, Spinner } from "@tarodan/ui";
import { Form, FormInput, FormError, useZodForm } from "@tarodan/ui/form";
import { useLocale, useTranslations } from "next-intl";
import { AuthCard } from "./AuthCard";
import { useVerifyEmail } from "../_hooks/useVerifyEmail";
import { resendEmailSchema, type ResendEmailValues } from "../_lib/auth";

export function VerifyEmailForm() {
  const t = useTranslations();
  const locale = useLocale();
  const { status, errorMessage, resend, resendLoading, resendSuccess } =
    useVerifyEmail();
  const form = useZodForm(resendEmailSchema(locale), {
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ResendEmailValues) => resend(values.email);

  const resendForm = (
    <Form form={form} onSubmit={onSubmit} className="space-y-3">
      <FormInput
        name="email"
        type="email"
        label={t("auth.email")}
        placeholder="ornek@email.com"
      />
      <FormError />
      <Button type="submit" isLoading={resendLoading} className="w-full">
        {t("auth.resendVerificationEmail")}
      </Button>
      {resendSuccess && (
        <p className="text-center text-sm text-success-600">
          {t("auth.emailSentCheckInbox")}
        </p>
      )}
    </Form>
  );

  if (status === "loading") {
    return (
      <AuthCard
        title={t("auth.verifyingEmail")}
        description={t("auth.pleaseWait")}
      >
        <div className="flex justify-center py-4">
          <Spinner size="lg" />
        </div>
      </AuthCard>
    );
  }

  if (status === "success") {
    return (
      <AuthCard
        title={t("auth.emailVerified")}
        description={t("auth.emailVerifiedDesc")}
      >
        <div className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/login">{t("auth.loginNow")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (status === "error") {
    return (
      <AuthCard
        title={t("auth.verificationFailed")}
        description={errorMessage}
        footer={
          <>
            <Link
              href="/login"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("auth.goToLogin")}
            </Link>
            {" · "}
            <Link
              href="/register"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("auth.registerAgain")}
            </Link>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
            <p className="text-sm text-warning-800">
              {t("auth.linkExpiredHint")}
            </p>
          </div>

          {resendForm}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.emailVerification")}
      description={t("auth.emailVerificationDesc")}
      footer={
        <Link
          href="/login"
          className="font-semibold text-primary-600 hover:text-primary-700"
        >
          {t("auth.goToLogin")}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-info-200 bg-info-50 p-4">
          <p className="text-sm text-info-800">{t("auth.spamHintVerify")}</p>
        </div>

        {resendForm}
      </div>
    </AuthCard>
  );
}
