import { useCallback, useState } from 'react';

type Refetcher = () => Promise<unknown> | unknown;

/**
 * Pull-to-refresh yardımcısı.
 *
 * Değişken sayıda `refetch` fonksiyonu alır (genelde react-query'den), hepsini
 * paralel çalıştırır ve `refreshing` state'ini yönetir. Dönen `refreshing` /
 * `onRefresh` doğrudan `ThemedRefreshControl`'e geçilir.
 *
 * @example
 * const { refreshing, onRefresh } = useRefresh(productQuery.refetch, reviewsQuery.refetch);
 */
export function useRefresh(...refetchers: Refetcher[]) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchers.map((fn) => fn()));
    } finally {
      setRefreshing(false);
    }
    // refetch referansları react-query tarafından stabil tutulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refetchers);

  return { refreshing, onRefresh };
}
