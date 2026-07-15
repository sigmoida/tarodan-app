/** @format */

"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, listingsApi, userApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import type { TradeProduct } from "../_lib/types";

/** The listing the user wants (target of the trade). */
export function useTradeTarget(listingId: string | null, enabled: boolean) {
  const query = useWebList<TradeProduct>({
    resource: "trade-target",
    params: listingId,
    fetcher: async () => {
      const res = await listingsApi.getOne(listingId!);
      return res.data.product || res.data;
    },
    enabled: enabled && !!listingId,
    query: { meta: { page: "trades-new-target" } },
  });
  return { target: query.data ?? null, isLoading: query.isLoading };
}

/** The user's active, trade-enabled products (excluding the target). */
export function useTradeableProducts(
  listingId: string | null,
  enabled: boolean,
) {
  const query = useWebList<TradeProduct[]>({
    resource: "trade-eligible-products",
    params: listingId,
    fetcher: async () => {
      const res = await userApi.getMyProducts({
        status: "active",
        tradeEligible: true,
      });
      const products: TradeProduct[] = res.data.data || res.data.products || [];
      return products.filter(
        (p) => p.status === "active" && p.isTradeEnabled && p.id !== listingId,
      );
    },
    enabled: enabled && !!listingId,
    query: { meta: { page: "trades-new-products" } },
  });
  return { products: query.data ?? [], isLoading: query.isLoading };
}

export interface CreateTradePayload {
  receiverId: string;
  initiatorItems: { productId: string; quantity: number }[];
  receiverItems: { productId: string; quantity: number }[];
  cashAmount?: number;
  message?: string;
  shippingAddressId?: string;
}

/** Send a trade offer → navigate to the trades list. */
export function useCreateTrade() {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const refreshUserData = useAuthStore((s) => s.refreshUserData);

  return useMutation({
    mutationFn: (payload: CreateTradePayload) => api.post("/trades", payload),
    onSuccess: () => {
      toast.success(t("trade.tradeSent"));
      router.push("/profile/trades");
    },
    onError: async (error: any) => {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        (locale === "en"
          ? "Failed to send trade offer"
          : "Takas teklifi gönderilemedi");
      if (
        msg.includes("Takas özelliği") ||
        msg.includes("üyeliğinizde mevcut değil") ||
        msg.includes("takas özelliğine sahip değil")
      ) {
        await refreshUserData();
      }
      toast.error(msg);
    },
  });
}
