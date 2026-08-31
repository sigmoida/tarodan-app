"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import type { SearchableSelectOption } from "@tarodan/ui";

const PAGE_SIZE = 20;
/** Her tuşta istek atmamak için — kullanıcı yazmayı bırakınca ara. */
const SEARCH_DEBOUNCE_MS = 300;

interface AdminUserRow {
  id: string;
  displayName?: string | null;
  email?: string | null;
}

/** Çipte ve listede görünen ad: ad varsa ad (e-posta ile), yoksa e-posta. */
export function userOptionLabel(user: AdminUserRow): string {
  const name = user.displayName?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || user.id;
}

/**
 * "Belirli alıcılar / belirli satıcılar" kitlesi için kullanıcı seçenekleri.
 *
 * Kimlikler bir zamanlar forma virgülle ayrılmış UUID olarak yazılıyordu:
 * yönetici kimliği başka bir ekrandan kopyalamak zorundaydı, bir harf hatası
 * sessizce yanlış kişiyi hedefliyor ve seçilenlerin kim olduğu formda hiç
 * görünmüyordu. Liste artık sunucudan sayfalanarak gelir; arama sunucuda
 * yapılır (tam-metin), böylece binlerce kullanıcıyı istemciye indirmek
 * gerekmez.
 *
 * `kind`: satıcı kitlesi `isSeller` ile daraltılır. Alıcı kitlesi
 * DARALTILMAZ — her kullanıcı alıcı olabilir, satıcılar dahil.
 */
export function useUserOptions(kind: "buyers" | "sellers", enabled: boolean) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const infinite = useInfiniteQuery({
    queryKey: adminKeys.list("discount-user-options", {
      kind,
      search: debounced,
    }),
    enabled,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await adminApi.getUsers({
        page: pageParam,
        limit: PAGE_SIZE,
        ...(debounced ? { search: debounced } : {}),
        ...(kind === "sellers" ? { isSeller: true } : {}),
      });
      return res.data as {
        data: AdminUserRow[];
        meta?: { page?: number; totalPages?: number };
      };
    },
    getNextPageParam: (last) => {
      const page = last.meta?.page ?? 1;
      const totalPages = last.meta?.totalPages ?? 1;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const options: SearchableSelectOption[] = useMemo(
    () =>
      (infinite.data?.pages ?? []).flatMap((page) =>
        (page.data ?? []).map((user) => ({
          value: user.id,
          label: userOptionLabel(user),
        })),
      ),
    [infinite.data],
  );

  return {
    options,
    onQueryChange: setQuery,
    // Sayfa geçişi de "yükleniyor"dur: yalnız ilk yüklemeyi göstermek,
    // kaydırırken listeyi sessizce donmuş gösterirdi.
    loading: infinite.isFetching,
    hasMore: infinite.hasNextPage,
    onLoadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) {
        void infinite.fetchNextPage();
      }
    },
  };
}
