"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

/**
 * Reset-password flow. Reads the reset `token` from the URL, posts the new
 * password via a mutation, and flips to the success view. Returns a form-level
 * error message on failure (also toasted); the form owns its pending state.
 *
 * The page is open to signed-in visitors too (the mail link carries its own
 * token, see `middleware.ts`). A successful reset revokes every refresh token
 * of that account on the API, so any session this browser holds is cleared
 * through the regular store `logout` BEFORE the success view shows; otherwise
 * the still-valid access cookie makes the guest-only `/login` gate bounce the
 * view's login link home. JS cannot see the httpOnly session cookies, so the
 * logout runs unconditionally (a no-op for a guest).
 */
export function useResetPassword() {
  const t = useTranslations();
  const token = useSearchParams().get("token");
  const [success, setSuccess] = useState(false);
  const logout = useAuthStore((s) => s.logout);

  const resetMutation = useMutation({
    mutationFn: (newPassword: string) =>
      api.post("/auth/reset-password", { token, newPassword }),
  });

  const submit = async (newPassword: string): Promise<string | null> => {
    try {
      await resetMutation.mutateAsync(newPassword);
    } catch (error: unknown) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Failed to reset password:", error);
      }
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || t("auth.passwordResetFailed");
      toast.error(msg);
      return msg;
    }
    // Outside the try above: the password has changed and the token is used
    // up, so nothing after this point may report a failed reset. The store
    // `logout` never throws.
    await logout();
    setSuccess(true);
    toast.success(t("auth.passwordChangedSuccess"));
    return null;
  };

  return { token, success, submit };
}
