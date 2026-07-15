/** @format */

"use client";

import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { ChangePasswordValues } from "../_lib/schemas";

/** Whether TOTP two-factor auth is currently enabled. */
export function use2faStatus(enabled: boolean) {
  const query = useWebList<boolean>({
    resource: "profile-2fa-status",
    fetcher: async () => {
      const res = await api.get("/security/2fa/status").catch(() => null);
      return !!res?.data?.isEnabled;
    },
    enabled,
    query: { meta: { page: "profile-2fa-status" } },
  });
  return { is2faEnabled: query.data ?? false, isLoading: query.isLoading };
}

/** Change the account password. */
export function useChangePassword() {
  const t = useTranslations();
  return useWebMutation(
    async (values: ChangePasswordValues) => {
      await api.post("/security/password/change", {
        currentPassword: values.currentPassword.trim(),
        newPassword: values.newPassword,
      });
    },
    {
      errorMessage: "Şifre değiştirilemedi",
      onSuccess: () => toast.success(t("settings.passwordChanged")),
    },
  );
}

/** SMS phone-verification: send a code, then verify it. */
export function usePhoneVerification() {
  const locale = useLocale();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const sendCode = useWebMutation(
    (phone: string) => api.post("/auth/phone/send-code", { phone }),
    {
      errorMessage: locale === "en" ? "Failed" : "Gönderilemedi",
      onSuccess: () =>
        toast.success(locale === "en" ? "Code sent" : "Kod gönderildi"),
    },
  );

  const verify = useWebMutation(
    (code: string) => api.post("/auth/phone/verify", { code }),
    {
      errorMessage: locale === "en" ? "Invalid code" : "Kod hatalı",
      onSuccess: async () => {
        toast.success(
          locale === "en" ? "Phone verified" : "Telefon doğrulandı",
        );
        await refreshUser();
      },
    },
  );

  return { sendCode, verify };
}
