/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Trade } from "../_lib/types";

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
  const query = useQuery({
    queryKey: ["trades", statusFilter],
    queryFn: async (): Promise<Trade[]> => {
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
    meta: { page: "trades" },
  });

  return { trades: query.data ?? [], isLoading: query.isLoading };
}
