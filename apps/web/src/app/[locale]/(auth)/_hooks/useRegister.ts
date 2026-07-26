"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface RegisterInput {
  displayName: string;
  email: string;
  phone: string;
  birthDate: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
  acceptMarketing: boolean;
}

/**
 * Individual-registration flow. Field validation lives in `registerSchema`
 * (the form gates on it before calling `submit`), so this hook owns only the
 * `/auth/register` mutation, the success-screen state, and the
 * resend-verification action.
 */
export function useRegister() {
  const t = useTranslations();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => {
      // FormPhone stores the normalized full number ("+90" + digits) or "".
      const formattedPhone = input.phone || undefined;
      return api.post("/auth/register", {
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        phone: formattedPhone,
        birthDate: input.birthDate,
        acceptsMarketingEmails: input.acceptMarketing,
      });
    },
    onSuccess: (_res, input) => {
      setRegisteredEmail(input.email);
      setRegistrationSuccess(true);
      toast.success(t("auth.registerSuccessVerify"));
    },
    onError: (error: any) =>
      toast.error(
        error.response?.data?.message || t("auth.registrationFailed"),
      ),
  });

  const submit = (input: RegisterInput) =>
    registerMutation.mutateAsync(input).catch(() => {});

  const resendMutation = useMutation({
    mutationFn: () =>
      api.post("/auth/resend-verification", { email: registeredEmail }),
    onSuccess: () => toast.success(t("auth.verificationEmailResent")),
    onError: () => toast.error(t("auth.couldNotResendEmail")),
  });
  const resendVerification = () => resendMutation.mutate();

  return {
    isLoading: registerMutation.isPending,
    registrationSuccess,
    registeredEmail,
    submit,
    resendVerification,
  };
}
