"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { useLogin } from "./useLogin";

/**
 * Identifier-first login flow, on one screen:
 *   1. `identify`: e-mail plus Google and Apple. "Continue" checks the e-mail:
 *        - not registered         -> `notRegistered` (the sign-up hint)
 *        - registered, password   -> the `password` step
 *        - registered, no password -> the `noPassword` step (Google, Apple, or
 *          the set-password mail)
 *   2. `password`: the normal password sign-in through `useLogin.submit`.
 * All password sign-in logic (business tier redirect, verification banner,
 * the redirect after a social sign-in) stays in `useLogin`; this only drives
 * the steps.
 */
export type LoginStep = "identify" | "password" | "noPassword";

export function useLoginFlow() {
  const t = useTranslations();
  const login = useLogin();

  const [step, setStep] = useState<LoginStep>("identify");
  const [email, setEmail] = useState("");
  const [notRegistered, setNotRegistered] = useState(false);

  const checkMutation = useMutation({
    mutationFn: (value: string) => authApi.checkEmail(value),
  });

  const identify = async (value: string) => {
    setNotRegistered(false);
    const res = await checkMutation
      .mutateAsync(value)
      .then((r) => r.data)
      .catch(() => null);
    if (!res) {
      toast.error(t("error.somethingWrongDesc"));
      return;
    }
    setEmail(value);
    if (!res.exists) {
      setNotRegistered(true);
      return;
    }
    setStep(res.hasPassword ? "password" : "noPassword");
  };

  const back = () => {
    setStep("identify");
    setNotRegistered(false);
    login.resetTwoFactor();
  };

  const setPasswordMutation = useMutation({
    mutationFn: (value: string) => authApi.forgotPassword(value),
    onSuccess: () => toast.success(t("auth.setPasswordEmailSent")),
    onError: () => toast.error(t("auth.couldNotSendEmail")),
  });

  return {
    step,
    email,
    notRegistered,
    identify,
    identifying: checkMutation.isPending,
    back,
    sendSetPassword: () => setPasswordMutation.mutate(email),
    settingPassword: setPasswordMutation.isPending,
    // password-login engine passthrough
    submit: login.submit,
    requires2FA: login.requires2FA,
    isLoggingIn: login.isLoading,
    showVerificationBanner: login.showVerificationBanner,
    resendVerification: login.resendVerification,
    isResending: login.isResending,
    redirectAfterGoogle: login.redirectAfterGoogle,
  };
}
