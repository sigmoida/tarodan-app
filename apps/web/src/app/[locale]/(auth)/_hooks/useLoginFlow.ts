"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { useLogin } from "./useLogin";

/**
 * Identifier-first login akışı. Tek ekranda:
 *   1. `identify` : e-posta + Google. "Devam et" → e-postayı kontrol eder.
 *        - kayıtlı değil        → `notice = "notRegistered"` (kayıt ol mesajı)
 *        - kayıtlı + parolalı    → `password` adımı (parola iste, "Giriş yap")
 *        - kayıtlı + Google-only → `googleOnly` adımı (Google / şifre belirle)
 *   2. `password`  : mevcut useLogin.submit ile normal parola girişi.
 * Parola girişinin tüm mantığı (business tier yönlendirmesi, doğrulama banner'ı,
 * Google sonrası redirect) `useLogin`'de kalır — burada yalnızca adımları sürüyoruz.
 */
export type LoginStep = "identify" | "password" | "googleOnly";

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
    setStep(res.hasPassword ? "password" : "googleOnly");
  };

  const back = () => {
    setStep("identify");
    setNotRegistered(false);
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
    isLoggingIn: login.isLoading,
    showVerificationBanner: login.showVerificationBanner,
    resendVerification: login.resendVerification,
    isResending: login.isResending,
    redirectAfterGoogle: login.redirectAfterGoogle,
  };
}
