/** @format */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Kayıttan sonra `returnTo`'ya dönmeden ÖNCE banka hesabı cache'ini tazeler.
 * Hedef sayfanın (ilan formu) sorgusu o an inaktif olduğundan invalidate
 * refetch etmez; eski `null` kalırsa IBAN kapısı bir an geri gelir.
 */
export async function finishBankSave(
  qc: QueryClient,
  returnTo: string | null,
  push: (href: string) => void,
): Promise<void> {
  if (!returnTo) return;
  try {
    await qc.refetchQueries({
      queryKey: queryKeys.bankAccount.detail(),
      type: "all",
    });
  } catch {
    // Tazeleme başarısızsa yine de dön; hedef sayfa kendi sorgusunu çalıştırır.
  }
  push(returnTo);
}
