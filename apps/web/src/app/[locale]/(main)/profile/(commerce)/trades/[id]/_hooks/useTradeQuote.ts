/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { tradesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import type { Trade, TradeQuote } from "../_lib/types";
import { paymentRowsOf } from "../_lib/tradePayments";

/**
 * Kabul edilmemiş takasın ödeme dökümü. Satırlar ancak kabulde yazıldığı için
 * teklif aşamasında ekran fiyatı bu uçtan öğrenir; satırlar oluştuktan sonra
 * SORGU YAPILMAZ — tutarlar snapshot'tan okunur, kural sonradan değişse bile
 * ekran tahsil edilecek tutarı gösterir.
 */
export function useTradeQuote(trade: Trade | null) {
  const tradeId = trade?.id ?? "";
  const hasRows = paymentRowsOf(trade).length > 0;

  const query = useQuery({
    queryKey: queryKeys.trades.paymentQuote(tradeId),
    queryFn: async (): Promise<TradeQuote | null> => {
      const response = await tradesApi.paymentQuote(tradeId);
      return response.data?.data ?? response.data ?? null;
    },
    enabled: !!tradeId && !hasRows,
    // Kural/tarife nadiren değişir; teklif ekranı her odakta yeniden sormasın.
    staleTime: 60_000,
    retry: false,
    meta: { page: "trade-payment-quote" },
  });

  return { quote: query.data ?? null, quoteLoading: query.isLoading };
}
