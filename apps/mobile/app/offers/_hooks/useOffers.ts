import { useQuery } from '@tanstack/react-query';
import { offersApi } from '@/lib/api';
import { qk } from '@/lib/query';
import type { Offer, TabType } from '../_lib/types';

/** Aktif sekmeye göre teklif listesi (query hook). */
export function useOffers(tab: TabType, enabled: boolean) {
  return useQuery({
    queryKey: qk.offers.list(tab),
    enabled,
    // Eski davranışla parite: sekme her değiştiğinde taze veri çek (global 5dk
    // staleTime'ı bu ekran için geçersiz kıl — teklifler dışarıda değişebilir).
    staleTime: 0,
    queryFn: async (): Promise<Offer[]> => {
      const res = await offersApi.getAll({ type: tab });
      return res.data?.data || res.data?.offers || [];
    },
  });
}
