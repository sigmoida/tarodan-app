/** @format */

"use client";

import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { readReturnTo } from "@/lib/returnTo";

/**
 * Kayıttan sonra `returnTo`'ya dönmeden ÖNCE kapının okuduğu cache'i tazeler.
 * Hedef sayfanın (ilan formu) sorgusu o an inaktif olduğundan invalidate
 * refetch etmez; eski değer kalırsa kapı (IBAN / adres) bir an geri gelir.
 */
export async function finishWithReturn(
  qc: QueryClient,
  queryKey: QueryKey,
  returnTo: string | null,
  push: (href: string) => void,
): Promise<void> {
  if (!returnTo) return;
  try {
    await qc.refetchQueries({ queryKey, type: "all" });
  } catch {
    // Tazeleme başarısızsa yine de dön; hedef sayfa kendi sorgusunu çalıştırır.
  }
  push(returnTo);
}

/**
 * Kaydı biten bölümün çağıracağı `finish`: URL'de güvenli bir `returnTo` varsa
 * `queryKey` cache'ini bekleyip oraya döner, yoksa hiçbir şey yapmaz.
 */
export function useReturnAfterSave(queryKey: QueryKey) {
  const qc = useQueryClient();
  const router = useRouter();
  return () => finishWithReturn(qc, queryKey, readReturnTo(), router.push);
}
