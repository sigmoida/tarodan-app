"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { hasAuthMarker } from "@/lib/authMarker";
import { useAuthStore } from "@/stores/authStore";

/**
 * Reset-password flow. Reads the reset `token` from the URL, posts the new
 * password via a mutation, and flips to the success view. Returns a form-level
 * error message on failure (also toasted); the form owns its pending state.
 *
 * The page is open to signed-in visitors too (the mail link carries its own
 * token, see `middleware.ts`). A successful reset revokes every refresh token
 * on the API, so a session this browser still holds is dead: it is cleared
 * through the regular store `logout` BEFORE the success view shows, so the
 * view's login link is not bounced away by the guest-only `/login` gate.
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
      // `logout` clears the httpOnly cookies through its server action and
      // the client state (marker, user snapshot, store); it never throws.
      if (hasAuthMarker()) await logout();
      setSuccess(true);
      toast.success(t("auth.passwordChangedSuccess"));
      return null;
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
  };

  return { token, success, submit };
}
