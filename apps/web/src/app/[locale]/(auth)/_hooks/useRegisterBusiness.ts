"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface RegisterBusinessInput {
  authorizedFullName: string;
  companyLegalName: string;
  companyTitle: string;
  companyAddress: string;
  companyEmail: string;
  kepAddress?: string;
  phone: string;
  contactPhone?: string;
  agreeTerms: boolean;
}

export function useRegisterBusiness() {
  const t = useTranslations();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const registerMutation = useMutation({
    mutationFn: (input: RegisterBusinessInput) =>
      api.post("/auth/register/business", {
        authorizedFullName: input.authorizedFullName.trim(),
        companyLegalName: input.companyLegalName.trim(),
        companyTitle: input.companyTitle.trim(),
        companyAddress: input.companyAddress.trim(),
        companyEmail: input.companyEmail.trim().toLowerCase(),
        kepAddress: input.kepAddress?.trim().toLowerCase() || undefined,
        phone: input.phone,
        contactPhone: input.contactPhone || undefined,
      }),
    onSuccess: (_response, input) => {
      setRegisteredEmail(input.companyEmail);
      setRegistrationSuccess(true);
      toast.success(t("auth.corporateApplicationReceived"));
    },
    onError: (error: any) =>
      toast.error(
        error.response?.data?.message || t("auth.registrationFailed"),
      ),
  });

  const submit = (input: RegisterBusinessInput) =>
    registerMutation.mutateAsync(input).catch(() => {});

  return {
    isLoading: registerMutation.isPending,
    registrationSuccess,
    registeredEmail,
    submit,
  };
}
