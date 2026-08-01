"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { type AiModerationConfig } from "./types";

/**
 * AI eşik yapılandırması. Sorgu HATA durumunu dışarı verir çünkü bu ekranda
 * "okunamadı" ile "kapalı" birbirine karışırsa zarar veriyor: eskiden hata
 * hâlinde config `undefined` kalıyor, "AI kapalı" uyarısı görünmüyor, sürgüler
 * varsayılana (20/70) düşüyor ve Kaydet AKTİF kalıyordu — admin hiç görmediği
 * eşikleri canlıya yazabiliyordu. Varsayılanların tek kaynağı sunucudur;
 * burada yerel bir kopya TUTULMAZ.
 */
export function useAiModerationConfig() {
  const query = useQuery<AiModerationConfig>({
    queryKey: adminKeys.all("ai-moderation-config"),
    queryFn: async () => {
      const res = await adminApi.getAiModerationConfig();
      return {
        enabled: res.data.enabled !== false,
        relevanceThreshold: res.data.relevanceThreshold,
        nsfwThreshold: res.data.nsfwThreshold,
      };
    },
  });

  return {
    config: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isRetrying: query.isRefetching,
    retry: query.refetch,
  };
}
