/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { REAUTH_TOKEN_HEADER } from "@tarodan/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { isCancellation } from "@/hooks/useWebMutation";
import { useReauth } from "./useReauth";

interface DeleteAccountErrorBody {
  message?: string;
  errors?: unknown;
}

/**
 * Permanently delete the account, then log out and go home. The step-up
 * token always goes along in `X-Reauth-Token` (a `DELETE` body can be
 * dropped): the API checks a sent token, and requires one once the
 * `auth_require_reauth_for_sensitive_actions` setting is on.
 */
export function useDeleteAccount() {
  const router = useRouter();
  const t = useTranslations();
  const logout = useAuthStore((s) => s.logout);
  const withReauth = useReauth();
  return useMutation({
    mutationFn: () =>
      withReauth((reauthToken) =>
        api.delete("/users/me", {
          headers: { [REAUTH_TOKEN_HEADER]: reauthToken },
        }),
      ),
    onSuccess: () => {
      toast.success(t("settings.accountDeleted"));
      logout();
      router.push("/");
    },
    onError: (error) => {
      if (isCancellation(error)) return;
      const data = (error as { response?: { data?: DeleteAccountErrorBody } })
        ?.response?.data;
      if (Array.isArray(data?.errors)) {
        toast.error(data.message || t("profile.cannotDeleteAccount"));
        data.errors.forEach((e) => {
          if (typeof e === "string") toast.error(e, { duration: 5000 });
        });
      } else {
        toast.error(data?.message || t("profile.deleteAccountFailed"));
      }
    },
  });
}
