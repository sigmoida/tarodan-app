"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Forgot-password flow. Posts the reset request and flips to the "sent" view.
 * Deliberately reports success even on error — never leak whether an email is
 * registered (the mutation swallows failures and always sets `sent`). The form
 * owns its pending state via the returned promise.
 */
export function useForgotPassword() {
  const [sent, setSent] = useState(false);

  const forgotMutation = useMutation({
    mutationFn: (email: string) => api.post("/auth/forgot-password", { email }),
    onError: (error) => {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Failed to request password reset:", error);
      }
      // Always show success for security reasons.
    },
    onSettled: () => setSent(true),
  });

  const submit = (email: string) =>
    forgotMutation.mutateAsync(email).catch(() => {});

  const reset = () => setSent(false);

  return { submit, sent, reset };
}
