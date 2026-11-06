"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { extractErrorI18nKey } from "@/lib/error";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { INSTALLMENT_SETTINGS_RESOURCE } from "../_lib/resources";
import { isMinAmountErrorKey } from "../_lib/settings-form";

/** The kill switch, the minimum amount and the latest rate snapshot. */
export function useInstallmentSettings() {
  return useQuery({
    queryKey: adminKeys.all(INSTALLMENT_SETTINGS_RESOURCE),
    queryFn: async () => (await adminApi.getInstallmentSettings()).data,
  });
}

/**
 * The settings writes (super_admin; audited by the API). The switch has one
 * mutation per direction so each says what it did. A refused minimum amount
 * is shown on its field by the caller, not as a toast.
 */
export function useInstallmentSettingsWrites() {
  const t = useTranslations();
  const options = { invalidates: [INSTALLMENT_SETTINGS_RESOURCE] };
  const enable = useAdminMutation(
    () => adminApi.updateInstallmentSettings({ enabled: true }),
    {
      ...options,
      successMessage: t("admin.finance.installments.general.enabledSaved"),
    },
  );
  const disable = useAdminMutation(
    () => adminApi.updateInstallmentSettings({ enabled: false }),
    {
      ...options,
      successMessage: t("admin.finance.installments.general.disabledSaved"),
    },
  );
  const saveMinAmount = useAdminMutation(
    (minAmount: number) => adminApi.updateInstallmentSettings({ minAmount }),
    {
      ...options,
      successMessage: t("admin.finance.installments.general.minAmountSaved"),
      showErrorToast: (error) =>
        !isMinAmountErrorKey(extractErrorI18nKey(error)),
    },
  );
  return { enable, disable, saveMinAmount };
}
