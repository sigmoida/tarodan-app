"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";

/** Resolve the post-login target: sessionStorage hint → ?redirect → home. */
function resolveRedirect(): string {
  let redirect: string | null = null;
  try {
    redirect = sessionStorage.getItem("login_redirect");
    if (redirect) sessionStorage.removeItem("login_redirect");
  } catch {
    /* sessionStorage unavailable */
  }
  if (!redirect)
    redirect = new URLSearchParams(window.location.search).get("redirect");
  return redirect && redirect.startsWith("/") ? redirect : "/";
}

/**
 * Login flow. Signs in via the auth store (which sets the httpOnly session
 * cookies), then routes: business accounts without an active business tier are
 * pushed to the membership screen, everyone else to their redirect target.
 * Surfaces the "email not verified" banner + resend on the matching error.
 * Login + resend are `useMutation`s so loading/errors derive from mutation state.
 */
export function useLogin() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { login } = useAuthStore();

  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  // Once login succeeds we swap the form for a full-screen loader and keep it up
  // through the redirect, so the UI never flashes blank while the target renders.
  const [isRedirecting, setIsRedirecting] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      await login(email, password);
      // Post-login: does a business account still need to pick a tier?
      try {
        const userResponse = await api.get("/users/me");
        const currentUser = userResponse.data?.user || userResponse.data;
        const membershipTier =
          currentUser?.membership?.tier?.type ||
          currentUser?.membership?.tier?.name ||
          currentUser?.membershipTier ||
          "free";
        const normalizedTier = String(membershipTier).toLowerCase();
        const isBusinessTier =
          normalizedTier.includes("business") || normalizedTier === "business";
        const needsMembership = !!(
          currentUser?.isEmailVerified &&
          currentUser?.companyName &&
          currentUser?.taxId &&
          !isBusinessTier
        );
        return { needsMembership };
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.error("Business account check failed:", error);
        }
        return { needsMembership: false };
      }
    },
    onSuccess: ({ needsMembership }) => {
      setIsRedirecting(true);
      if (needsMembership) {
        router.push("/membership?required=true");
        return;
      }
      const target = resolveRedirect();
      setTimeout(() => {
        router.push(target);
      }, 1000);
    },
    onError: (error: unknown) => {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("[Login] Login error:", error);
      }
      const message =
        (
          error as {
            response?: { data?: { message?: string } };
            message?: string;
          }
        )?.response?.data?.message ||
        (error as { message?: string })?.message ||
        t("auth.invalidCredentials");

      if (
        message.includes("doğrula") ||
        message.includes("verify") ||
        message.includes("verification")
      ) {
        setShowVerificationBanner(true);
      }
      toast.error(message);
    },
  });

  const submit = (email: string, password: string) => {
    if (!email.trim() || !password.trim()) {
      toast.error(
        locale === "en"
          ? "Email and password are required"
          : "E-posta ve şifre gerekli",
      );
      return;
    }
    return loginMutation.mutateAsync({ email, password }).catch(() => {});
  };

  const resendMutation = useMutation({
    mutationFn: (email: string) =>
      api.post("/auth/resend-verification", { email }),
    onSuccess: () =>
      toast.success(
        locale === "en"
          ? "Verification email sent!"
          : "Doğrulama e-postası gönderildi!",
      ),
    onError: () =>
      toast.error(
        locale === "en" ? "Could not send email" : "E-posta gönderilemedi",
      ),
  });

  const resendVerification = (email: string) => {
    if (!email.trim()) {
      toast.error(
        locale === "en"
          ? "Please enter your email first"
          : "Lütfen önce e-postanızı girin",
      );
      return;
    }
    resendMutation.mutate(email);
  };

  /** Redirect after a successful Google sign-in (store already updated). */
  const redirectAfterGoogle = () => {
    setIsRedirecting(true);
    router.push(resolveRedirect());
  };

  return {
    submit,
    isLoading: loginMutation.isPending,
    isRedirecting,
    showVerificationBanner,
    resendVerification,
    isResending: resendMutation.isPending,
    redirectAfterGoogle,
  };
}
