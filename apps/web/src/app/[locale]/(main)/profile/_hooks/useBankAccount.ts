/** @format */

"use client";

import { bankAccountApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { BankAccountValues } from "../_lib/schemas";
import { useTranslations } from "next-intl";

export interface BankAccount {
  id: string;
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string | null;
  taxId?: string | null;
  isVerified: boolean;
}

const RESOURCE = "bank-account";

export function useBankAccount(enabled: boolean) {
  const query = useWebList<BankAccount | null>({
    resource: RESOURCE,
    fetcher: async () => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled,
    query: { meta: { page: "bank-account" } },
  });
  return { account: query.data ?? null, isLoading: query.isLoading };
}

export function useSaveBankAccount() {
  const t = useTranslations();
  return useWebMutation(
    async (values: BankAccountValues) => {
      await bankAccountApi.upsert({
        accountHolder: values.accountHolder.trim(),
        // FormIban stores the normalized raw value (TR + digits, uppercased, no spaces).
        iban: values.iban,
        ...(values.tcKimlikNo ? { tcKimlikNo: values.tcKimlikNo } : {}),
        ...(values.taxId ? { taxId: values.taxId } : {}),
      });
    },
    {
      invalidates: [RESOURCE],
      successMessage: t("profile.bankHooks.bankaHesabiKaydedildi"),
      errorMessage: t("profile.bankHooks.kaydetmeBasarisiz"),
    },
  );
}

export function useDeleteBankAccount() {
  const t = useTranslations();
  return useWebMutation(() => bankAccountApi.delete(), {
    invalidates: [RESOURCE],
    successMessage: t("profile.bankHooks.bankaHesabiSilindi"),
    errorMessage: t("profile.bankHooks.silmeBasarisiz"),
  });
}
