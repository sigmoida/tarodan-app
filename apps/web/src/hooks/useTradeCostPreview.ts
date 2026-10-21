/** @format */

"use client";

import { cashAmountValue } from "@/lib/cashAmount";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tradesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/** One party's preview breakdown (no user ids: the offer does not exist yet). */
export interface TradeQuotePreviewParty {
  serviceFee: number;
  shipping: number;
  cashDifference: number;
  total: number;
}

/** The `POST /trades/payment-quote/preview` response. */
export interface TradeQuotePreview {
  initiator: TradeQuotePreviewParty;
  receiver: TradeQuotePreviewParty;
}

interface UseTradeCostPreviewArgs {
  /** The products offered by the side building the offer (the user). */
  myProductIds: string[];
  /** The products asked from the other side. */
  theirProductIds: string[];
  /**
   * The raw field text, read with `cashAmountValue`: empty or refused text
   * counts as no cash difference.
   */
  cashAmount: string;
  cashPayer: "me" | "them";
  enabled: boolean;
}

/** Delay so that each selection click does not send a request. */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * The "what will this offer cost me" preview while an offer is being built.
 *
 * It comes from the SAME engine as the accepted trade's breakdown (backend
 * `previewQuote`); the screen never computes fees or shipping itself, or the
 * preview and the charge could drift apart.
 */
export function useTradeCostPreview({
  myProductIds,
  theirProductIds,
  cashAmount,
  cashPayer,
  enabled,
}: UseTradeCostPreviewArgs) {
  const parsedCash = cashAmountValue(cashAmount);
  const signature = JSON.stringify([
    [...myProductIds].sort(),
    [...theirProductIds].sort(),
    parsedCash,
    cashPayer,
  ]);
  const [debounced, setDebounced] = useState(signature);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced(signature),
      PREVIEW_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [signature]);

  const hasSelection = myProductIds.length > 0 || theirProductIds.length > 0;

  const query = useQuery({
    queryKey: queryKeys.trades.costPreview(debounced),
    queryFn: async (): Promise<TradeQuotePreview> => {
      const [mine, theirs, cash, payer] = JSON.parse(debounced) as [
        string[],
        string[],
        number,
        "me" | "them",
      ];
      const response = await tradesApi.previewPaymentQuote({
        // In a counter offer the "initiator" side is the side BUILDING the
        // offer (same mapping as the counter body); the panel labels rely on it.
        initiatorItems: mine.map((productId) => ({ productId, quantity: 1 })),
        receiverItems: theirs.map((productId) => ({ productId, quantity: 1 })),
        cashAmount: cash > 0 ? cash : undefined,
        cashPayer: payer === "me" ? "initiator" : "receiver",
      });
      return response.data?.data ?? response.data;
    },
    enabled: enabled && hasSelection,
    staleTime: 60_000,
    retry: false,
    meta: { page: "trade-cost-preview" },
  });

  return {
    preview: query.data ?? null,
    previewLoading: query.isFetching,
    previewFailed: query.isError,
  };
}
