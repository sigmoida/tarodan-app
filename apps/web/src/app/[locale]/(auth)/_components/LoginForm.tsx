/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormError, useZodForm } from "@tarodan/ui/form";
import { useLocale, useTranslations } from "next-intl";
import { AuthCard } from "./AuthCard";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  emailStepSchema,
  passwordStepSchema,
  type EmailStepValues,
  type PasswordStepValues,
} from "../_lib/auth";
import { useLoginFlow } from "../_hooks/useLoginFlow";

/** "veya" ayıracı (Google butonu ile e-posta girişi arasında). */
function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Çözülmüş e-postayı gösterir + "farklı e-posta" ile 1. adıma döner. */
function ResolvedEmail({
  email,
  onChange,
  changeLabel,
}: {
  email: string;
  onChange: () => void;
  changeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2">
      <span className="truncate text-sm text-body">{email}</span>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onChange}
        className="ml-2 shrink-0"
      >
        {changeLabel}
      </Button>
    </div>
  );
}

export function LoginForm() {
  const t = useTranslations();
  const locale = useLocale();
  const flow = useLoginFlow();

  const emailForm = useZodForm(emailStepSchema(locale), {
    defaultValues: { email: "" },
  });
  const passwordForm = useZodForm(passwordStepSchema(locale), {
    defaultValues: { password: "", twoFactorCode: "" },
  });

  const onIdentify = (values: EmailStepValues) => flow.identify(values.email);
  const onLogin = (values: PasswordStepValues) => {
    if (flow.requires2FA && !values.twoFactorCode) {
      passwordForm.setError("twoFactorCode", {
        message: t("admin.auth.validation.codeInvalid"),
      });
      return;
    }
    return flow.submit(
      flow.email,
      values.password,
      values.twoFactorCode || undefined,
    );
  };

  return (
    <AuthCard
      title={t("auth.welcomeBack")}
      description={t("auth.signInToAccount")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-primary-600 hover:text-primary-700"
          >
            {t("common.register")}
          </Link>
        </>
      }
    >
      {/* 1. adım — e-posta + Google */}
      {flow.step === "identify" && (
        <div className="space-y-4">
          <GoogleSignInButton onSuccess={flow.redirectAfterGoogle} />
          <OrDivider label={t("auth.or")} />
          <Form form={emailForm} onSubmit={onIdentify} className="space-y-4">
            <FormInput
              name="email"
              type="email"
              label={t("auth.email")}
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
              autoFocus
            />
            {flow.notRegistered && (
              <p className="text-sm text-danger-600">
                {t("auth.emailNotRegistered")}{" "}
                <Link
                  href="/register"
                  className="font-semibold underline hover:no-underline"
                >
                  {t("common.register")}
                </Link>
              </p>
            )}
            <Button
              type="submit"
              isLoading={flow.identifying}
              className="w-full"
            >
              {t("common.continue")}
            </Button>
          </Form>
        </div>
      )}

      {/* 2. adım — parola (kayıtlı + parolalı hesap) */}
      {flow.step === "password" && (
        <div className="space-y-4">
          <ResolvedEmail
            email={flow.email}
            onChange={flow.back}
            changeLabel={t("auth.useDifferentEmail")}
          />

          {flow.showVerificationBanner && (
            <div className="rounded-xl border border-warning-300 bg-warning-50 p-5">
              <div className="mb-3 flex gap-3">
                <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-warning-600" />
                <p className="text-sm font-medium text-warning-900">
                  {t("auth.emailNotVerifiedBanner")}
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => flow.resendVerification(flow.email)}
                  disabled={flow.isResending}
                  className="w-full"
                >
                  {flow.isResending
                    ? t("common.sending")
                    : t("auth.resendVerificationEmail")}
                </Button>
                <Link
                  href="/verify-email"
                  className="block w-full py-2 text-sm text-warning-800 underline hover:text-warning-900"
                >
                  {t("auth.goToVerificationPage")}
                </Link>
              </div>
            </div>
          )}

          <Form form={passwordForm} onSubmit={onLogin} className="space-y-4">
            <FormInput
              name="password"
              type="password"
              label={t("auth.password")}
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
            />
            {flow.requires2FA && (
              <FormInput
                name="twoFactorCode"
                label={t("admin.auth.login.verificationCode")}
                placeholder="000000"
                maxLength={9}
                autoComplete="one-time-code"
                autoFocus
              />
            )}
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <FormError />
            <Button
              type="submit"
              isLoading={flow.isLoggingIn}
              className="w-full"
            >
              {t("common.login")}
            </Button>
          </Form>
        </div>
      )}

      {/* 2. adım (alternatif) — Google-only hesap */}
      {flow.step === "googleOnly" && (
        <div className="space-y-4">
          <ResolvedEmail
            email={flow.email}
            onChange={flow.back}
            changeLabel={t("auth.useDifferentEmail")}
          />
          <p className="text-sm text-body">{t("auth.googleOnlyAccount")}</p>
          <GoogleSignInButton onSuccess={flow.redirectAfterGoogle} />
          <Button
            type="button"
            variant="outline"
            isLoading={flow.settingPassword}
            onClick={flow.sendSetPassword}
            className="w-full"
          >
            {t("auth.setPassword")}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
