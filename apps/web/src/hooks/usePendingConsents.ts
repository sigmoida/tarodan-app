"use client";

import type { ConsentDocumentKey, PendingConsent } from "@tarodan/types";
import { consentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useWebList } from "./useWebResource";
import { useWebMutation } from "./useWebMutation";

/** Liste ve kabul aynı kaynağı paylaşır: kabul, bekleyen listeyi tazeler. */
const RESOURCE = "consents-pending";

/**
 * Yeniden-onay kapısının verisi: üyenin onaylaması gereken zorunlu belgeler
 * (sunucu hesaplar — hiç kaydı olmayan eski üye, sosyal girişle açılan hesap
 * ya da sürümü değişen belge). Misafirde sorgu çalışmaz, liste boştur.
 */
export function usePendingConsents() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const enabled = isAuthenticated && !isLoading;

  const query = useWebList<PendingConsent[]>({
    resource: RESOURCE,
    fetcher: async () => (await consentsApi.getPending()).data.pending ?? [],
    enabled,
  });

  const accept = useWebMutation(
    (documents: ConsentDocumentKey[]) => consentsApi.accept(documents),
    { invalidates: [RESOURCE] },
  );

  return { pending: enabled ? (query.data ?? []) : [], accept };
}
