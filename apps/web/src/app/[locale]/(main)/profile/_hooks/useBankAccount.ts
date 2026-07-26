/** @format */

"use client";

import { bankAccountApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { BankAccountValues } from "../_lib/schemas";

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
      successMessage: "Banka hesabı kaydedildi",
      errorMessage: "Kaydetme başarısız",
    },
  );
}

export function useDeleteBankAccount() {
  return useWebMutation(() => bankAccountApi.delete(), {
    invalidates: [RESOURCE],
    successMessage: "Banka hesabı silindi",
    errorMessage: "Silme başarısız",
  });
}
