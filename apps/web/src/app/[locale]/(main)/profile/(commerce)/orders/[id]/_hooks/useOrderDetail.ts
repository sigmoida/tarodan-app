/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  api,
  paymentsApi,
  addressesApi,
  ratingsApi,
  mediaApi,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useTranslations } from "next-intl";
import { useWebItem, useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type {
  ElogoInvoice,
  OrderDetail,
  SellerInvoiceStatus,
} from "../_lib/types";

/**
 * Grup çatısı görünümü: order id sunucuda grubuna çözülür (grupsuz sipariş =
 * sentetik tek siparişlik grup). Aynı 'order' resource anahtarı kullanılır ki
 * mevcut invalidation'lar (iptal/iade/onay) bu sorguyu da tazelesin.
 */
export function useOrderGroupQuery(orderId: string, enabled: boolean) {
  return useWebItem<import("../../_lib/types").ServerOrderGroup>({
    resource: "order",
    id: orderId,
    fetcher: async (id) => {
      const response = await api.get(`/orders/${id}/group`);
      const data = response.data?.data ?? response.data;
      if (!data || typeof data !== "object" || !Array.isArray(data.orders)) {
        throw new Error("Invalid order group response");
      }
      return data;
    },
    enabled: !!orderId && enabled,
    query: { meta: { page: "order-detail" }, retry: false },
  });
}

/** Alıcı teslimatı onaylar: delivered → confirm, 48s penceresi → confirm-receipt. */
export function useConfirmDelivery() {
  const t = useTranslations();
  return useWebMutation(
    async ({ orderId, early }: { orderId: string; early: boolean }) => {
      await api.post(
        `/orders/${orderId}/${early ? "confirm-receipt" : "confirm"}`,
      );
    },
    {
      invalidates: ["order", "orders", "orders-counts"],
      errorMessage: t("order.confirmDeliveryFailed"),
      onSuccess: () => toast.success(t("order.deliveryConfirmed")),
    },
  );
}

/** The order itself — resource 'order' → detail key ['order', 'detail', orderId]. */
export function useOrderQuery(orderId: string, enabled: boolean) {
  return useWebItem<OrderDetail>({
    resource: "order",
    id: orderId,
    fetcher: async (id) => {
      const response = await api.get(`/orders/${id}`);
      const data = response.data?.data ?? response.data;
      if (!data || typeof data !== "object" || data.status === undefined) {
        throw new Error("Invalid order response");
      }
      return data as OrderDetail;
    },
    enabled: !!orderId && enabled,
    query: { meta: { page: "order-detail" }, retry: false },
  });
}

// eLogo / seller invoice only meaningful once the order is paid and not cancelled.
const invoiceEnabled = (order: OrderDetail | null | undefined) =>
  !!order && order.status !== "pending_payment" && order.status !== "cancelled";

/** eLogo e-Arşiv (gerçek yasal fatura) hazır mı? Hazırsa "Faturayı İndir" çıkar. */
export function useElogoInvoice(
  orderId: string,
  order: OrderDetail | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.orders.elogoInvoice(orderId),
    queryFn: async (): Promise<ElogoInvoice | null> => {
      try {
        const res = await api.get(`/elogo/invoices/by-order/${orderId}`);
        return (res.data as ElogoInvoice) || null;
      } catch {
        return null;
      }
    },
    enabled: !!orderId && invoiceEnabled(order),
  });
}

/** Kurumsal satıcı faturası durumu (yükleme yetkisi + yüklenmiş fatura). */
export function useSellerInvoice(
  orderId: string,
  order: OrderDetail | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.orders.sellerInvoice(orderId),
    queryFn: async (): Promise<SellerInvoiceStatus | null> => {
      try {
        const res = await api.get(`/orders/${orderId}/seller-invoice`);
        return (res.data as SellerInvoiceStatus) || null;
      } catch {
        return null;
      }
    },
    enabled: !!orderId && invoiceEnabled(order),
  });
}

/** Kayıtlı adresler (ödeme bekleyen alıcı için). */
export function useSavedAddresses(enabled: boolean) {
  return useWebList<any[]>({
    resource: "addresses",
    fetcher: async () => {
      const res = await addressesApi.getAll();
      return Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];
    },
    enabled,
  });
}

/**
 * invalidate order + orders lists. Uses the resource-wide ['order'] prefix so it
 * still matches the migrated detail key ['order', 'detail', orderId] as well as
 * the elogo/seller sub-invoice queries.
 */
function useInvalidateOrder(_orderId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient
      .invalidateQueries({ queryKey: queryKeys.orders.detail() })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() }),
      );
}

/** Satıcı: paid → preparing, ya da alıcı onayı → completed. */
export function useUpdateOrderStatus(orderId: string) {
  const t = useTranslations();
  const invalidateOrder = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (newStatus: string) => {
      if (newStatus === "completed") {
        await api.post(`/orders/${orderId}/confirm`);
      } else if (newStatus === "preparing") {
        await api.post(`/orders/${orderId}/prepare`);
      } else {
        throw new Error("unsupported");
      }
    },
    onSuccess: async () => {
      toast.success(t("order.statusUpdated"));
      await invalidateOrder();
    },
    onError: (error: any) => {
      if (error?.message === "unsupported") {
        toast.error(t("order.unsupportedStatus"));
        return;
      }
      toast.error(
        error?.response?.data?.message || t("order.statusUpdateFailed"),
      );
    },
  });
}

/** Süre aşımına uğramış teklif siparişini yeniden aktive et. */
export function useReactivateOrder(orderId: string) {
  const t = useTranslations();
  return useWebMutation(
    async () => {
      await api.post(`/orders/${orderId}/reactivate`);
    },
    {
      invalidates: ["order", "orders"],
      errorMessage: t("order.reactivateFailed"),
      onSuccess: () => toast.success(t("order.reactivateSuccess")),
    },
  );
}

export interface CheckoutInput {
  order: OrderDetail;
  showNewAddressForm: boolean;
  newAddress: {
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode: string;
  };
  selectedAddressId: string | null;
  savedAddresses: any[];
}

/**
 * Ödeme bekleyen alıcı: teslimat adresini kaydet → siparişe ata → ödemeyi başlat
 * (PayTR ya da bypass akışı). Tek atomik akış; yönlendirmeler içeride yapılır.
 */
export function useSetAddressAndPay(orderId: string) {
  const router = useRouter();
  const t = useTranslations();
  const invalidateOrder = useInvalidateOrder(orderId);

  const initiatePayment = async (order: OrderDetail): Promise<void> => {
    try {
      const res = await paymentsApi.initiate(order.id, "paytr");
      const data = res.data?.data ?? res.data;

      // Bypass mode: complete payment instantly without PayTR
      if (data?.useBypass && data?.paymentId) {
        try {
          const bypassRes = await paymentsApi.bypassComplete(data.paymentId);
          if (bypassRes.data?.success) {
            toast.success(t("payment.paymentSuccess"));
            router.push(`/payment/success?paymentId=${data.paymentId}`);
          } else {
            toast.error(t("payment.paymentFailed"));
            router.push(`/payment/fail?paymentId=${data.paymentId}`);
          }
        } catch (err: any) {
          toast.error(
            err.response?.data?.message || t("payment.paymentFailed"),
          );
        }
        return;
      }

      // Tek ödeme yüzeyi: site-içi kart formu + 3D Secure için ödeme sayfamıza git.
      if (data?.paymentId) {
        router.push(`/payment/${data.paymentId}`);
        return;
      }

      toast.error(t("payment.startFailed"));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("payment.startFailed"));
    }
  };

  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const {
        order,
        showNewAddressForm,
        newAddress,
        selectedAddressId,
        savedAddresses,
      } = input;

      let addrPayload: {
        fullName: string;
        phone: string;
        city: string;
        district: string;
        address: string;
        zipCode?: string;
      };

      if (showNewAddressForm) {
        if (
          !newAddress.fullName ||
          !newAddress.phone ||
          !newAddress.city ||
          !newAddress.district ||
          !newAddress.address
        ) {
          toast.error(t("auth.fillRequiredFields"));
          return;
        }
        addrPayload = {
          fullName: newAddress.fullName,
          phone: newAddress.phone,
          city: newAddress.city,
          district: newAddress.district,
          address: newAddress.address,
          zipCode: newAddress.zipCode || undefined,
        };
        try {
          await addressesApi.create({
            ...addrPayload,
            title: newAddress.fullName,
            isDefault: savedAddresses.length === 0,
          });
        } catch {
          // Non-critical: address may already exist or user might not want to save
        }
      } else {
        if (!selectedAddressId) return;
        const addr = savedAddresses.find(
          (a: any) => a.id === selectedAddressId,
        );
        if (!addr) return;
        addrPayload = {
          fullName: addr.fullName,
          phone: addr.phone,
          city: addr.city,
          district: addr.district,
          address: addr.address,
          zipCode: addr.zipCode || undefined,
        };
      }

      try {
        await api.patch(`/orders/${order.id}/shipping-address`, addrPayload);
        await invalidateOrder();
        await initiatePayment(order);
      } catch (err: any) {
        toast.error(err.response?.data?.message || t("address.saveFailed"));
      }
    },
  });
}

export interface ReviewInput {
  order: OrderDetail;
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

/** Ürün + satıcı değerlendirmesi (fotoğrafları önce yükler). */
export function useSubmitReview(orderId: string) {
  const t = useTranslations();
  const invalidateOrder = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (p: ReviewInput) => {
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
        const avgSellerScore = Math.round(
          (p.sellerCommunication + p.sellerShipping + p.sellerPackaging) / 3,
        );
        const scoreBreakdown = `İletişim: ${p.sellerCommunication}/5, Kargo: ${p.sellerShipping}/5, Paketleme: ${p.sellerPackaging}/5`;
        const fullComment = p.sellerReviewText
          ? `${p.sellerReviewText}\n\n${scoreBreakdown}`
          : scoreBreakdown;
        await ratingsApi.createUserRating({
          receiverId: p.sellerId,
          orderId: p.order.id,
          score: avgSellerScore,
          comment: fullComment,
        });
      }
    },
    onSuccess: async () => {
      toast.success(t("review.reviewSubmitted"));
      await invalidateOrder();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Review submit error:", error);
      toast.error(
        error?.response?.data?.message || t("common.operationFailed"),
      );
    },
  });
}

/** eLogo e-Arşiv PDF'ini yeni sekmede aç (görüntüle/indir). */
export function useDownloadElogoInvoice() {
  const t = useTranslations();
  return useMutation({
    mutationFn: async (invoiceId: string | undefined) => {
      if (!invoiceId) {
        throw new Error("not-ready");
      }
      // Yeni eLogo e-Arşiv ucu → S3 presigned URL döner; yeni sekmede aç.
      const res = await api.get(`/elogo/invoices/${invoiceId}/pdf`);
      const url = res.data?.url;
      if (!url) throw new Error("not-ready");
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onSuccess: () => {
      toast.success(t("order.invoiceOpened"));
    },
    onError: (err: any) => {
      if (err?.message === "not-ready") {
        toast.error(t("order.invoiceNotReady"));
        return;
      }
      const msg = err.response?.data?.message;
      if (err.response?.status === 404) {
        toast.error(msg || t("order.invoiceNotFound"));
      } else {
        toast.error(msg || t("common.downloadFailed"));
      }
    },
  });
}

/** Kurumsal satıcı: siparişe fatura PDF yükle/değiştir. */
export function useUploadSellerInvoice(orderId: string) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/orders/${orderId}/seller-invoice`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return !!res.data?.replaced;
    },
    onSuccess: async (replaced) => {
      toast.success(
        replaced ? t("order.invoiceReplaced") : t("order.invoiceUploaded"),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.orders.sellerInvoice(orderId),
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || t("common.uploadFailed"));
    },
  });
}

/** Kurumsal satıcı faturasını yeni sekmede aç. */
export function useDownloadSellerInvoice(orderId: string) {
  const t = useTranslations();
  return useMutation({
    mutationFn: async () => {
      const res = await api.get(`/orders/${orderId}/seller-invoice/download`);
      const url = res.data?.url;
      if (!url) throw new Error("not-found");
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err: any) => {
      if (err?.message === "not-found") {
        toast.error(t("order.invoiceNotFound"));
        return;
      }
      toast.error(err.response?.data?.message || t("common.downloadFailed"));
    },
  });
}
