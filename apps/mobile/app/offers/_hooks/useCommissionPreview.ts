import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { qk } from '@/lib/query';
import type { Offer, TabType } from '../_lib/types';

/**
 * Gelen sekmesinde, alıcı onayı beklemeyen bekleyen teklifler için satıcının
 * tahmini net tutarını batch hesaplar → `{ [offerId]: sellerNetAmount }`.
 * (Eski `useEffect`+manuel fetch yerine query hook.)
 */
export function useCommissionPreview(offers: Offer[], tab: TabType) {
  const pending =
    tab === 'received'
      ? offers.filter((o) => o.status === 'pending' && !o.buyerMustAccept)
      : [];
  const ids = pending.map((o) => o.id);

  const query = useQuery({
    queryKey: qk.offers.commissionPreview(ids),
    enabled: pending.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await ordersApi.getCommissionPreviewBatch(
        pending.map((o) => ({
          amount: Number(o.amount),
          categoryId: o.product?.categoryId ?? null,
        })),
      );
      const results = res.data?.results;
      const map: Record<string, number> = {};
      if (Array.isArray(results)) {
        pending.forEach((o, i) => {
          const r = results[i];
          if (r != null && typeof r.sellerNetAmount === 'number') {
            map[o.id] = r.sellerNetAmount;
          }
        });
      }
      return map;
    },
  });

  return query.data ?? {};
}
