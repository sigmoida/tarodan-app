"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface RegisterBusinessInput {
  companyName: string;
  email: string;
  phone: string;
  companyType: string;
  taxId: string;
  city: string;
  district: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

/**
 * Business-registration flow. Preserves the page's exact sequential validation
 * (toast on the first failing rule) ahead of the `/auth/register/business`
 * mutation, plus the success-screen state and the resend-verification action.
 */
export function useRegisterBusiness() {
  const t = useTranslations();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const registerMutation = useMutation({
    mutationFn: (input: RegisterBusinessInput) => {
      const formattedPhone = input.phone
        ? "+90" + input.phone.replace(/\s/g, "")
        : undefined;
      return api.post("/auth/register/business", {
        companyName: input.companyName,
        email: input.email,
        password: input.password,
        phone: formattedPhone,
        companyType: input.companyType,
        taxId: input.taxId,
        city: input.city,
        district: input.district || undefined,
        acceptsMarketingEmails: false,
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

  const submit = (input: RegisterBusinessInput) => {
    const {
      companyName,
      email,
      phone,
      taxId,
      city,
      password,
      confirmPassword,
      agreeTerms,
    } = input;

    if (
      !companyName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !taxId.trim() ||
      !city.trim() ||
      !password.trim()
    ) {
      toast.error(t("auth.fillRequiredFields"));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("validation.passwordMatch"));
      return;
    }

    if (password.length < 8) {
      toast.error(t("validation.passwordMin8"));
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      toast.error(t("auth.passwordComplexity"));
      return;
    }

    if (!agreeTerms) {
      toast.error(t("auth.mustAcceptTerms"));
      return;
    }

    return registerMutation.mutateAsync(input).catch(() => {});
  };

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
