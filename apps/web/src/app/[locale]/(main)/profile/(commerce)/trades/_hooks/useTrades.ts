/** @format */

"use client";

import api from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import type { Trade } from "../_lib/types";

const RESOURCE = "trades";

const SHIPPED_STATUSES = [
  "initiator_shipped",
  "receiver_shipped",
  "both_shipped",
];

/**
 * The user's trades, optionally filtered by status. `shipped` spans several
 * statuses so it's grouped client-side. Replaces the page's inline `useQuery`.
 */
export function useTrades(statusFilter: string | null, enabled: boolean) {
  const query = useWebList<Trade[]>({
    resource: RESOURCE,
    params: statusFilter,
    fetcher: async () => {
      const params: Record<string, string> = { pageSize: "100" };
      if (statusFilter && statusFilter !== "shipped") {
        params.status = statusFilter;
      }
      const response = await api.get("/trades", { params });
      let trades: Trade[] = response.data.data || response.data.trades || [];
      if (statusFilter === "shipped") {
        trades = trades.filter((t) => SHIPPED_STATUSES.includes(t.status));
      }
      return trades;
    },
    enabled,
    query: { meta: { page: "trades" } },
  });

  return { trades: query.data ?? [], isLoading: query.isLoading };
}
