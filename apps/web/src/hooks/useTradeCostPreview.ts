/** @format */

"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tradesApi } from "@/lib/api";

/** Bir tarafın önizleme dökümü (kullanıcı kimliği yok — teklif henüz yok). */
export interface TradeQuotePreviewParty {
  serviceFee: number;
  shipping: number;
  cashDifference: number;
  total: number;
}

/** `POST /trades/payment-quote/preview` yanıtı. */
export interface TradeQuotePreview {
  initiator: TradeQuotePreviewParty;
  receiver: TradeQuotePreviewParty;
}

interface UseTradeCostPreviewArgs {
  /** Teklifi kuran tarafın (yani kullanıcının) verdiği ürünler. */
  myProductIds: string[];
  /** Karşı taraftan istenen ürünler. */
  theirProductIds: string[];
  /** Ham input değeri — boş/geçersizken fark yok sayılır. */
  cashAmount: string;
  cashPayer: "me" | "them";
  enabled: boolean;
}

/** Seçim tıklaması başına istek atmamak için gecikme. */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * Karşı teklif kurulurken "bu teklif bana kaça mal olur" önizlemesi.
 *
 * Kabul edilmiş takasın dökümüyle AYNI motordan (backend `previewQuote`) gelir;
 * ekran kendi başına ücret/kargo hesaplamaz — aksi halde önizleme ile tahsilat
 * ayrışırdı.
 */
export function useTradeCostPreview({
  myProductIds,
  theirProductIds,
  cashAmount,
  cashPayer,
  enabled,
}: UseTradeCostPreviewArgs) {
  const parsedCash = Math.abs(parseFloat(cashAmount) || 0);
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
    queryKey: ["trade-cost-preview", debounced],
    queryFn: async (): Promise<TradeQuotePreview> => {
      const [mine, theirs, cash, payer] = JSON.parse(debounced) as [
        string[],
        string[],
        number,
        "me" | "them",
      ];
      const response = await tradesApi.previewPaymentQuote({
        // Karşı teklifte "initiator" tarafı teklifi KURAN taraftır (counter
        // gövdesiyle aynı eşleme) — panel etiketleri buna dayanır.
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
