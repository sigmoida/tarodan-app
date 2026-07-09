/** @format */

"use client";

import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@tarodan/ui";
import { Form, FormInput, FormError, useZodForm } from "@tarodan/ui/form";
import { useTranslation } from "@/i18n/LanguageContext";
import { TransitionLoader } from "@/components/TransitionLoader";
import { AuthCard } from "./AuthCard";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { loginSchema, type LoginValues } from "../_lib/auth";
import { useLogin } from "../_hooks/useLogin";

export function LoginForm() {
  const { t, locale } = useTranslation();
  const {
    submit,
    isRedirecting,
    showVerificationBanner,
    resendVerification,
    isResending,
    redirectAfterGoogle,
  } = useLogin();

  const form = useZodForm(loginSchema(locale), {
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginValues) =>
    submit(values.email, values.password);

  return (
    <>
      {isRedirecting && (
        <TransitionLoader
          overlay
          message={locale === "tr" ? "Giriş yapılıyor..." : "Signing in..."}
        />
      )}
      <AuthCard
        title={t("auth.welcomeBack")}
        description={
          locale === "tr" ? "Hesabınıza giriş yapın" : "Sign in to your account"
        }
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
        {showVerificationBanner && (
          <div className="mb-6 rounded-xl border border-warning-300 bg-warning-50 p-5">
            <div className="mb-3 flex gap-3">
              <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-warning-600" />
              <p className="text-sm font-medium text-warning-900">
                {locale === "tr"
                  ? "E-postanız henüz doğrulanmadı. Gelen kutunuzu veya spam klasörünüzü kontrol edin."
                  : "Your email is not verified yet. Please check your inbox or spam folder for the verification link."}
              </p>
            </div>
            <div className="space-y-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => resendVerification(form.getValues("email"))}
                disabled={isResending}
                className="w-full"
              >
                {isResending
                  ? locale === "tr"
                    ? "Gönderiliyor..."
                    : "Sending..."
                  : locale === "tr"
                    ? "Doğrulama E-postasını Tekrar Gönder"
                    : "Resend verification email"}
              </Button>
              <Link
                href="/verify-email"
                className="block w-full py-2 text-center text-sm text-warning-800 underline hover:text-warning-900"
              >
                {locale === "tr"
                  ? "Doğrulama sayfasına git"
                  : "Go to verification page"}
              </Link>
            </div>
          </div>
        )}

        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <FormInput
            name="email"
            type="email"
            label={t("auth.email")}
            placeholder={
              locale === "tr" ? "ornek@email.com" : "example@email.com"
            }
            autoComplete="email"
            autoFocus
          />
          <FormInput
            name="password"
            type="password"
            label={t("auth.password")}
            autoComplete="current-password"
          />

          <div className="flex items-center justify-between">
            <Checkbox id="login-remember" label={t("auth.rememberMe")} />
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
            isLoading={form.formState.isSubmitting}
            className="w-full"
          >
            {t("common.login")}
          </Button>
        </Form>

        <div className="mt-4">
          <GoogleSignInButton onSuccess={redirectAfterGoogle} />
        </div>
      </AuthCard>
    </>
  );
}
