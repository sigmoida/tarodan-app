"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
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
  // Must be a same-origin ABSOLUTE PATH. `startsWith('/')` alone is bypassable by
  // a protocol-relative URL (`//evil.com`) or `/\evil.com`, which resolve
  // off-origin — an open redirect. Reject those; fall back to home.
  const isSafe =
    !!redirect &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//") &&
    !redirect.startsWith("/\\");
  return isSafe ? (redirect as string) : "/";
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
  const t = useTranslations();
  const locale = useLocale();
  const { login } = useAuthStore();

  const [showVerificationBanner, setShowVerificationBanner] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      await login(email, password);
      // Post-login: does a business account still need to pick a tier? `login()`
      // already hydrated the store via checkAuth (`/users/me`) — read the mapped
      // user from there instead of a SECOND identical round-trip. `membershipTier`
      // is already normalized to 'free' | … | 'business' by the store.
      const currentUser = useAuthStore.getState().user;
      const needsMembership = !!(
        currentUser?.isEmailVerified &&
        currentUser?.companyName &&
        currentUser?.taxId &&
        currentUser.membershipTier !== "business"
      );
      return { needsMembership };
    },
    onSuccess: ({ needsMembership }) => {
      const target = needsMembership
        ? "/membership?required=true"
        : resolveRedirect();
      // Navigate immediately (same recipe as admin's useLogin). A client
      // router.replace keeps the current UI up and shows the root loading
      // spinner while the target renders — instead of leaving the user on
      // /login long enough for the Server Action's post-login revalidation to
      // re-run the async (auth) layout, redirect to '/', and re-stream a BLANK
      // document. refresh() drops any stale RSC cache so the fresh session is read.
      router.replace(target);
      router.refresh();
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
    router.replace(resolveRedirect());
    router.refresh();
  };

  return {
    submit,
    isLoading: loginMutation.isPending,
    showVerificationBanner,
    resendVerification,
    isResending: resendMutation.isPending,
    redirectAfterGoogle,
  };
}
