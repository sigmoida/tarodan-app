/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";

/** Permanently delete the account, then log out and go home. */
export function useDeleteAccount() {
  const router = useRouter();
  const t = useTranslations();
  const logout = useAuthStore((s) => s.logout);
  return useMutation({
    mutationFn: () => api.delete("/users/me"),
    onSuccess: () => {
      toast.success(t("settings.accountDeleted"));
      logout();
      router.push("/");
    },
    onError: (error: any) => {
      const data = error?.response?.data;
      if (data?.errors && Array.isArray(data.errors)) {
        toast.error(data.message || t("profile.cannotDeleteAccount"));
        data.errors.forEach((e: string) => toast.error(e, { duration: 5000 }));
      } else {
        toast.error(data?.message || t("profile.deleteAccountFailed"));
      }
    },
  });
}
