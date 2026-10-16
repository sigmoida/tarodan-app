/** @format */

"use client";

import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import {
  PROFILE_GATE,
  readGateReturnTo,
  type ProfileGateSection,
} from "@/lib/profileGate";

/**
 * Kayıttan sonra `returnTo`'ya dönmeden ÖNCE kapının okuduğu cache'i tazeler.
 * Hedef sayfanın (ilan formu) sorgusu o an inaktif olduğundan invalidate
 * refetch etmez; eski değer kalırsa kapı (IBAN / adres) bir an geri gelir.
 *
 * `isOpen` verilirse tazelenen cache'e bakılır; kapı hâlâ kapalıysa dönülmez
 * (kullanıcı geri dönüp aynı kapıyla karşılaşmasın).
 */
export async function finishWithReturn(
  qc: QueryClient,
  queryKey: QueryKey,
  returnTo: string | null,
  push: (href: string) => void,
  isOpen?: (data: unknown) => boolean,
): Promise<void> {
  if (!returnTo) return;
  let refreshed = true;
  try {
    // Uçuştaki istek varsa (mutasyonun invalidate'i) yenisini açmaz, onu bekler.
    await qc.refetchQueries(
      { queryKey, type: "all" },
      { cancelRefetch: false, throwOnError: true },
    );
  } catch {
    // Tazeleme başarısızsa yine de dön; hedef sayfa kendi sorgusunu çalıştırır.
    refreshed = false;
  }
  // Cache tazelenemediyse kapı durumu bilinemez: karar hedef sayfaya kalır.
  if (refreshed && isOpen && !isOpen(qc.getQueryData(queryKey))) return;
  push(returnTo);
}

/**
 * Kaydı biten bölümün çağıracağı `finish`: URL'de BU kapıdan gelen güvenli bir
 * `returnTo` varsa kapının cache'ini bekleyip, kapı açıldıysa oraya döner;
 * yoksa hiçbir şey yapmaz.
 */
export function useReturnAfterSave(section: ProfileGateSection) {
  const qc = useQueryClient();
  const router = useRouter();
  const { queryKey, isOpen } = PROFILE_GATE[section];
  return () =>
    finishWithReturn(
      qc,
      queryKey,
      readGateReturnTo(section),
      router.push,
      isOpen,
    );
}
