import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useCommissionPreview(price: string, categoryId: string) {
  // Boş string Number("") = 0 (NaN değil); fiyat girilmeden ?amount= ile 400
  // almayalım diye boş/0/negatifte preview'i atla.
  const amount = Number(price);
  const enabled = !!price && !Number.isNaN(amount) && amount > 0;

  const query = useQuery({
    queryKey: ['edit-listing-commission', price, categoryId],
    queryFn: async () => {
      const res = await api.get('/orders/commission-preview', {
        params: { amount: price, categoryId: categoryId || undefined },
      });
      return {
        sellerFeeAmount: Number(res.data?.sellerFeeAmount ?? 0),
        sellerNetAmount: Number(res.data?.sellerNetAmount ?? 0),
      };
    },
    enabled,
    staleTime: 30 * 1000,
  });

  return {
    commissionPreview: enabled ? (query.data ?? null) : null,
    commissionPreviewLoading: enabled && query.isLoading,
  };
}
