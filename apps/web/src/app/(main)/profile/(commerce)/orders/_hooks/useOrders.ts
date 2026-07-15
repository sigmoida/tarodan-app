/** @format */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, ratingsApi, mediaApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useCart } from "@/hooks/useCart";
import { useTranslations } from "next-intl";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { Order, OrderRole, OrderStatusFilter } from "../_lib/types";
import { getOrderProductId } from "../_lib/types";

/** Orders for the active role + status filter. */
export function useOrders(
  role: OrderRole,
  statusFilter: OrderStatusFilter,
  enabled: boolean,
) {
  const query = useWebList<Order[]>({
    resource: "orders",
    params: [role, statusFilter],
    fetcher: async () => {
      const response = await api.get("/orders", {
        params: {
          role: role === "all" ? undefined : role,
          status: statusFilter === "cancelled" ? "cancelled" : undefined,
          refundsOnly: statusFilter === "refunds" ? true : undefined,
        },
      });
      return response.data.orders || response.data.data || [];
    },
    enabled,
    query: { meta: { page: "orders" } },
  });
  return { orders: query.data ?? [], isLoading: query.isLoading };
}

/** Buyer / seller totals (meta.total only) for the role tabs. */
export function useOrderCounts(enabled: boolean) {
  const query = useWebList<{ buyer: number; seller: number }>({
    resource: "orders-counts",
    fetcher: async () => {
      const [buyerRes, sellerRes] = await Promise.all([
        api.get("/orders", { params: { role: "buyer", limit: 1 } }),
        api.get("/orders", { params: { role: "seller", limit: 1 } }),
      ]);
      return {
        buyer: buyerRes.data?.meta?.total ?? 0,
        seller: sellerRes.data?.meta?.total ?? 0,
      };
    },
    enabled,
  });
  return query.data ?? { buyer: 0, seller: 0 };
}

/** Seller adds tracking info → ships the order. */
export function useShipOrder() {
  const t = useTranslations();
  return useWebMutation(
    async ({
      orderId,
      trackingNumber,
    }: {
      orderId: string;
      trackingNumber: string;
    }) => {
      await api.post(`/orders/${orderId}/ship`, {
        trackingNumber: trackingNumber.trim(),
        carrier: "Sürat Kargo",
      });
    },
    {
      invalidates: ["orders"],
      errorMessage: t("order.shippingSaveFailed"),
      onSuccess: () => toast.success(t("order.shippingSaved")),
    },
  );
}

/** Buyer cancels a pre-shipment order. */
export function useCancelOrder() {
  const t = useTranslations();
  return useWebMutation(
    async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      await api.post(`/orders/${orderId}/cancel`, {
        reason: reason?.trim() || undefined,
      });
    },
    {
      invalidates: ["orders", "orders-counts"],
      errorMessage: t("order.cancelFailed"),
      onSuccess: () => toast.success(t("order.orderCancelled")),
    },
  );
}

/** Re-add a finished order's product to the cart and jump to checkout. */
export function useReorder() {
  const router = useRouter();
  const t = useTranslations();
  const { addToCart } = useCart();
  return async (order: Order) => {
    const productId = getOrderProductId(order);
    if (!productId) {
      toast.error(t("order.orderNotFound"));
      return;
    }
    try {
      await addToCart(productId, order.items?.[0]?.quantity ?? 1);
      toast.success(t("cart.addedToCart"));
      router.push("/cart");
    } catch (err: any) {
      toast.error(err?.message || t("cart.addToCartFailed"));
    }
  };
}

/** eLogo e-Arşiv invoice for an order (opens the PDF), with per-order loading. */
export function useInvoiceDownload() {
  const t = useTranslations();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (orderId: string) => {
    setDownloadingId(orderId);
    try {
      const invoiceRes = await api.get(`/elogo/invoices/by-order/${orderId}`);
      const invoice = invoiceRes.data;
      if (!invoice?.id) {
        toast.error(t("order.invoiceNotReady"));
        return;
      }
      const res = await api.get(`/elogo/invoices/${invoice.id}/pdf`);
      const url = res.data?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success(t("order.invoiceOpened"));
      } else {
        toast.error(t("order.invoiceNotReady"));
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        toast.error(t("order.invoiceNotReady"));
      } else {
        toast.error(err?.response?.data?.message || t("common.downloadFailed"));
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return { downloadingId, download };
}

export interface ReviewPayload {
  order: Order;
  productId: string;
  sellerId?: string;
  reviewScore: number;
  reviewTitle: string;
  reviewText: string;
  images: File[];
  sellerCommunication: number;
  sellerShipping: number;
  sellerPackaging: number;
  sellerReviewText: string;
}

/** Product + seller rating for a delivered order (uploads photos first). */
export function useSubmitReview() {
  const queryClient = useQueryClient();
  const t = useTranslations();
  return useMutation({
    mutationFn: async (p: ReviewPayload) => {
      let imageUrls: string[] = [];
      if (p.images.length > 0) {
        const results = await Promise.all(
          p.images.map((file) => mediaApi.uploadReviewImage(file)),
        );
        imageUrls = results.map((r) => r.data?.url).filter(Boolean) as string[];
      }
      await ratingsApi.createProductRating({
        productId: p.productId,
        orderId: p.order.id,
        score: p.reviewScore,
        title: p.reviewTitle || undefined,
        review: p.reviewText || undefined,
        images: imageUrls.length > 0 ? imageUrls : undefined,
      });
      if (p.sellerId) {
        const avg = Math.round(
          (p.sellerCommunication + p.sellerShipping + p.sellerPackaging) / 3,
        );
        const breakdown = `İletişim: ${p.sellerCommunication}/5, Kargo: ${p.sellerShipping}/5, Paketleme: ${p.sellerPackaging}/5`;
        await ratingsApi.createUserRating({
          receiverId: p.sellerId,
          orderId: p.order.id,
          score: avg,
          comment: p.sellerReviewText
            ? `${p.sellerReviewText}\n\n${breakdown}`
            : breakdown,
        });
      }
    },
    onSuccess: async () => {
      toast.success(t("review.reviewSubmitted"));
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || t("common.operationFailed"),
      );
    },
  });
}
