"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

type VerifyStatus = "loading" | "success" | "error" | "no-token";

/**
 * Email-verification flow. Reads the `token` from the URL and auto-verifies once
 * on mount (a ref guards against the strict-mode double call marking the token
 * "used"). Verify + resend are `useMutation`s, so `status`/loading/error derive
 * from mutation state instead of hand-rolled `useState`. Toast/error language
 * comes from the active `next-intl` locale; the verify request is fired only
 * from the token effect, so a language switch never re-triggers it.
 */
export function useVerifyEmail() {
  const t = useTranslations();
  const token = useSearchParams().get("token");
  const verifyStartedRef = useRef(false);

  const verify = useMutation({
    mutationFn: (token: string) => api.post("/auth/verify-email", { token }),
    onSuccess: () => toast.success(t("auth.emailVerifiedSuccess")),
    onError: (error: unknown) => {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Email verification failed:", error);
      }
    },
  });

  useEffect(() => {
    if (!token || verifyStartedRef.current) return;
    verifyStartedRef.current = true;
    verify.mutate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // fire once per token; verify.mutate is stable

  const status: VerifyStatus = !token
    ? "no-token"
    : verify.isSuccess
      ? "success"
      : verify.isError
        ? "error"
        : "loading";

  const errorMessage = verify.isError
    ? (verify.error as { response?: { data?: { message?: string } } })?.response
        ?.data?.message || t("auth.verificationFailed")
    : "";

  const resendMutation = useMutation({
    mutationFn: (email: string) =>
      api.post("/auth/resend-verification", { email }),
    onSuccess: () => toast.success(t("auth.verificationEmailSent")),
    onError: (err: unknown) =>
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("auth.failedToSend"),
      ),
  });

  const resend = (rawEmail: string) => {
    const email = rawEmail.trim();
    if (!email) {
      toast.error(t("auth.enterEmail"));
      return;
    }
    resendMutation.mutate(email);
  };

  return {
    status,
    errorMessage,
    resend,
    resendLoading: resendMutation.isPending,
    resendSuccess: resendMutation.isSuccess,
  };
}
