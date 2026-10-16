/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { bankAccountApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useWebMutation } from "@/hooks/useWebMutation";

export interface BankAccount {
  id: string;
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string | null;
  taxId?: string | null;
  updatedAt?: string | null;
}

export interface BankAccountInput {
  accountHolder: string;
  iban: string;
  taxId?: string;
}

/** `useWebMutation.invalidates` kaynak adı = tek anahtarın kökü. */
const RESOURCE = queryKeys.bankAccount.detail()[0];

/**
 * Satıcının banka hesabı — profil, satıcı belgeleri ve ilan formu kapısı bu TEK
 * sorguyu paylaşır (tek key, tek queryFn). Kayıt yoksa `account` `null`'dır.
 */
export function useBankAccount(enabled = true) {
  const query = useQuery<BankAccount | null>({
    queryKey: queryKeys.bankAccount.detail(),
    queryFn: async () => (await bankAccountApi.get()).data || null,
    enabled,
    meta: { page: "bank-account" },
  });
  return { account: query.data ?? null, isLoading: query.isLoading };
}

interface SaveMessages {
  successMessage?: string;
  errorMessage?: string;
}

/** Upsert; metinler çağıran ekrana göre verilir (profil / satıcı belgeleri). */
export function useSaveBankAccount(messages?: SaveMessages) {
  const t = useTranslations();
  return useWebMutation(
    async (values: BankAccountInput) => {
      await bankAccountApi.upsert({
        accountHolder: values.accountHolder.trim(),
        // FormIban normalize değeri verir; boşluk/küçük harf gelirse de eşitle.
        iban: values.iban.replace(/\s/g, "").toUpperCase(),
        // TCKN gönderilmez (tek kaynak: yasal kimlik); sunucu mevcut değere
        // dokunmaz.
        ...(values.taxId?.trim() ? { taxId: values.taxId.trim() } : {}),
      });
    },
    {
      invalidates: [RESOURCE],
      successMessage:
        messages?.successMessage ??
        t("profile.bankHooks.bankaHesabiKaydedildi"),
      errorMessage:
        messages?.errorMessage ?? t("profile.bankHooks.kaydetmeBasarisiz"),
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
