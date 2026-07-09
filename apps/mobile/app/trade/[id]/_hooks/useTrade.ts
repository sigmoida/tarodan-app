import { useQuery } from '@tanstack/react-query';
import { tradesApi } from '@/lib/api';
import { qk } from '@/lib/query';
import type { Trade } from '../_lib/types';

/** GET /trades/:id (web ile parite). */
export function useTrade(id: string | undefined) {
  return useQuery<Trade>({
    queryKey: qk.trades.detail(String(id)),
    enabled: !!id,
    queryFn: async () => {
      const response = await tradesApi.getOne(id as string);
      return response.data?.data ?? response.data;
    },
  });
}
