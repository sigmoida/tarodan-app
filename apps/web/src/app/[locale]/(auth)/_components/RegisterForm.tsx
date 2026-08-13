"use client";

import { useState, useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import { Button, Spinner } from "@tarodan/ui";
import {
  Form,
  FormInput,
  FormDatePicker,
  FormPhone,
  FormCheckbox,
  FormError,
  useZodForm,
} from "@tarodan/ui/form";
import { registerSchema, type RegisterValues } from "../_lib/auth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { useRegister } from "../_hooks/useRegister";
import { AuthCard } from "./AuthCard";
import { PasswordChecklist } from "./PasswordChecklist";
import { RegisterAccountTabs } from "./RegisterAccountTabs";

export function RegisterForm() {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { registrationSuccess, registeredEmail, submit, resendVerification } =
    useRegister();

  // authStore ilk client render'da (giriş yapmamış kullanıcı) isLoading=false
  // verirken server isLoading=true verir; bu fark hydration hatasına yol
  // açıyordu. mounted guard'ı ile server + client ilk render aynı (Spinner)
  // kalır, gerçek duruma mount sonrası geçilir.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const form = useZodForm(registerSchema(locale), {
    defaultValues: {
      displayName: "",
      username: "",
      email: "",
      phone: "",
      birthDate: "",
      password: "",
      confirmPassword: "",
      agreeTerms: false,
      acceptsMarketingEmails: false,
    },
  });

  const onSubmit = (v: RegisterValues) =>
    submit({
      displayName: v.displayName,
      username: v.username,
      email: v.email,
      phone: v.phone ?? "",
      birthDate: v.birthDate,
      password: v.password,
      confirmPassword: v.confirmPassword,
      agreeTerms: v.agreeTerms,
      acceptMarketing: v.acceptsMarketingEmails,
    });

  const getMaxBirthDate = (): string => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today.toISOString().split("T")[0];
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  if (!mounted || (authLoading && !isAuthenticated)) {
    return <Spinner size="lg" />;
  }

  if (isAuthenticated) {
    return (
      <AuthCard
        title={t("auth.alreadySignedIn")}
        description={t("auth.alreadyLoggedIn")}
      >
        <Button className="w-full" onClick={() => router.push("/")}>
          {t("auth.goToHome")}
        </Button>
      </AuthCard>
    );
  }

  if (registrationSuccess) {
    return (
      <AuthCard
        title={t("auth.almostThere")}
        description={
          <>
            {t("auth.verificationSentTo")}
            <span className="font-semibold text-body">{registeredEmail}</span>
          </>
        }
        footer={
          <Link
            href="/verify-email"
            className="font-semibold text-primary-600 hover:text-primary-700"
          >
            {t("auth.verifyLaterLink")}
          </Link>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("auth.verificationSpamHint")}</p>
          <Button className="w-full" onClick={() => router.push("/login")}>
            {t("auth.goToLogin")}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={resendVerification}
          >
            {t("auth.resendVerificationEmail")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.createAccount")}
      description={t("auth.joinCommunity")}
      footer={
        <>
          {t("auth.hasAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-primary-600 hover:text-primary-700"
          >
            {t("common.login")}
          </Link>
        </>
      }
    >
      <div className="mb-5">
        <RegisterAccountTabs active="individual" />
      </div>
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormInput
          name="displayName"
          label={`${t("checkout.fullName")} *`}
          placeholder={t("auth.fullNamePlaceholder")}
          autoComplete="name"
        />

        <FormInput
          name="username"
          label={`${t("auth.username")} *`}
          placeholder={t("auth.usernamePlaceholder")}
          autoComplete="username"
          helperText={t("auth.usernameImmutableHint")}
        />

        <FormInput
          name="email"
          type="email"
          label={`${t("auth.email")} *`}
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
        />

        <div className="grid grid-cols-2 gap-4">
          <FormPhone
            name="phone"
            label={t("auth.phone")}
            legacyMessage={t("validation.phoneLegacyNotice")}
          />

          <FormDatePicker
            name="birthDate"
            label={`${t("auth.birthDate")} *`}
            max={getMaxBirthDate()}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="password"
            type="password"
            label={`${t("auth.password")} *`}
            placeholder="••••••••"
            autoComplete="new-password"
          />

          <FormInput
            name="confirmPassword"
            type="password"
            label={`${t("auth.confirmPassword")} *`}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>

        <PasswordChecklist password={form.watch("password")} />

        <FormCheckbox
          name="agreeTerms"
          label={
            <span className="text-sm text-muted leading-snug">
              {t.rich("auth.termsAgreeRich", {
                terms: (chunks) => (
                  <Link
                    href="/terms"
                    className="font-medium text-primary-600 hover:text-primary-700"
                  >
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link
                    href="/privacy"
                    className="font-medium text-primary-600 hover:text-primary-700"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          }
        />

        <FormCheckbox
          name="acceptsMarketingEmails"
          label={t("auth.marketingConsent")}
        />

        <FormError />

        <Button
          type="submit"
          isLoading={form.formState.isSubmitting}
          className="w-full"
        >
          {t("common.register")}
        </Button>

        <GoogleSignInButton onSuccess={() => router.push("/")} />
      </Form>
    </AuthCard>
  );
}
