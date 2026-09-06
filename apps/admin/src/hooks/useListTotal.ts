"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { adminKeys } from "@/lib/query/keys";

/** Liste ucu tek satır ister; yalnız toplam okunur → 30 sn taze kalır. */
const LIST_TOTAL_STALE_MS = 30_000;

export type ListTotalFetcher = (
  params: Record<string, any>,
) => Promise<AxiosResponse<any>>;

/**
 * Liste zarfından toplam kaydı okur. Şekiller (extractData ile aynı sıra):
 *   { data: [...], meta: { total } }   — getOrders / getProducts / getUsers
 *   { data: { data: [...], meta } }    — iç içe sarım
 *   { items: [...], total }            — üst seviye total
 * Hiçbiri yoksa 0 (satır sayısına düşmez: limit=1 ile o her zaman 1 olurdu).
 */
export function readListTotal(responseData: unknown): number {
  const root = (responseData ?? {}) as Record<string, any>;
  const nested = root.data;
  const total =
    root.meta?.total ?? root.total ?? nested?.meta?.total ?? nested?.total;
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
}

function listTotalQuery(
  resource: string,
  params: Record<string, unknown>,
  fetcher: ListTotalFetcher,
) {
  return {
    queryKey: adminKeys.count(resource, params),
    queryFn: async () =>
      readListTotal((await fetcher({ ...params, page: 1, limit: 1 })).data),
    staleTime: LIST_TOTAL_STALE_MS,
  };
}

/**
 * Bir listenin toplam kayıt sayısı: liste ucu `limit=1` ile çağrılır, yalnız
 * zarfın `total`'ı okunur. Sekme rozetleri ve başlık özetleri ("N kayıt") tek
 * yerden buradan geçer; anahtar `adminKeys.count(resource, params)` olduğundan
 * aynı parametrelerle çağıran bileşenler tek isteği paylaşır ve
 * `useAdminMutation` mutasyon sonrası hepsini birlikte tazeler.
 */
export function useListTotal(
  resource: string,
  params: Record<string, unknown>,
  fetcher: ListTotalFetcher,
) {
  return useQuery(listTotalQuery(resource, params, fetcher));
}

/**
 * Aynı kaynağın birden çok dilimi için toplamlar (sekme rozetleri): her anahtar
 * kendi `adminKeys.count` sorgusudur; hook sayısı sabit kalır.
 */
export function useListTotals<K extends string>(
  resource: string,
  paramsByKey: Record<K, Record<string, unknown>>,
  fetcher: ListTotalFetcher,
): Partial<Record<K, number | undefined>> {
  const keys = Object.keys(paramsByKey) as K[];
  return useQueries({
    queries: keys.map((key) =>
      listTotalQuery(resource, paramsByKey[key], fetcher),
    ),
    combine: (results) =>
      Object.fromEntries(
        keys.map((key, i) => [key, results[i]?.data]),
      ) as Partial<Record<K, number | undefined>>,
  });
}
