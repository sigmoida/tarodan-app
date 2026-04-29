"use client";

import { Button, Modal, Spinner, Textarea } from "@tarodan/ui";
import { refundsApi } from "@/lib/api";
import { useTranslation } from "@/i18n/LanguageContext";
import { useAuthStore } from "@/stores/authStore";
import {
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const reasonLabel: Record<string, { tr: string; en: string }> = {
  changed_mind: { tr: "Vazgeçtim (cayma)", en: "Changed mind" },
  damaged: { tr: "Hasarlı geldi", en: "Damaged" },
  wrong_item: { tr: "Yanlış ürün geldi", en: "Wrong item" },
  not_as_described: { tr: "Açıklamayla uyuşmuyor", en: "Not as described" },
  missing_parts: { tr: "Eksik parça", en: "Missing parts" },
  other: { tr: "Diğer", en: "Other" },
};

const statusLabel: Record<string, { tr: string; en: string; tone: string }> = {
  pending_review: { tr: "Satıcı İncelemesinde", en: "Awaiting Seller", tone: "info" },
  approved: { tr: "Onaylandı", en: "Approved", tone: "success" },
  wait_for_delivery: {
    tr: "Ürün Teslimi Bekleniyor",
    en: "Awaiting Delivery",
    tone: "info",
  },
  return_shipment_open: {
    tr: "İade Kargosu Açıldı",
    en: "Return Shipment Ready",
    tone: "info",
  },
  return_in_transit: { tr: "İade Yolda", en: "Return In Transit", tone: "info" },
  return_delivered: {
    tr: "Satıcıya Ulaştı",
    en: "Reached Seller",
    tone: "success",
  },
  refunded: { tr: "İade Tamamlandı", en: "Refunded", tone: "success" },
  rejected: { tr: "Reddedildi", en: "Rejected", tone: "danger" },
  disputed: { tr: "İtiraz / İnceleme", en: "Under Dispute", tone: "warning" },
  cancelled: { tr: "İptal Edildi", en: "Cancelled", tone: "muted" },
};

const toneClass: Record<string, string> = {
  info: "bg-info-50 text-info-700 border-info-200",
  success: "bg-success-50 text-success-700 border-success-200",
  warning: "bg-warning-50 text-warning-700 border-warning-200",
  danger: "bg-danger-50 text-danger-700 border-danger-200",
  muted: "bg-surface-alt text-muted border-border-default",
};

export default function RefundRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { locale } = useTranslation();
  const refundId = (params?.id as string) ?? "";

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(`/login?redirect=/refund-requests/${refundId}`);
    }
  }, [authLoading, isAuthenticated, refundId, router]);

  const { data: rr, isLoading } = useQuery({
    queryKey: ["refund-request", refundId],
    queryFn: async () => {
      const res = await refundsApi.getById(refundId);
      return res.data as any;
    },
    enabled: !!refundId && isAuthenticated,
  });

  const cancelMutation = useMutation({
    mutationFn: () => refundsApi.cancel(refundId),
    onSuccess: () => {
      toast.success(
        locale === "en" ? "Request cancelled" : "Talep iptal edildi",
      );
      queryClient.invalidateQueries({ queryKey: ["refund-request", refundId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Hata"),
  });

  const acceptMutation = useMutation({
    mutationFn: () => refundsApi.accept(refundId),
    onSuccess: () => {
      toast.success(
        locale === "en" ? "Request accepted" : "Talep kabul edildi",
      );
      queryClient.invalidateQueries({ queryKey: ["refund-request", refundId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Hata"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => refundsApi.reject(refundId, rejectReason.trim()),
    onSuccess: () => {
      toast.success(
        locale === "en" ? "Request rejected" : "Talep reddedildi",
      );
      setShowRejectModal(false);
      queryClient.invalidateQueries({ queryKey: ["refund-request", refundId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Hata"),
  });

  if (authLoading || isLoading || !rr) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const cfg = statusLabel[rr.status] ?? {
    tr: rr.status,
    en: rr.status,
    tone: "muted",
  };
  const isBuyer = user?.id === rr.requesterId;
  const isSeller = user?.id === rr.order?.seller?.id;
  const reason = reasonLabel[rr.reason] ?? { tr: rr.reason, en: rr.reason };

  const canCancel =
    isBuyer &&
    (rr.status === "pending_review" || rr.status === "wait_for_delivery");
  const canSellerDecide = isSeller && rr.status === "pending_review";
  const showReturnShipment =
    rr.returnTrackingNumber &&
    [
      "return_shipment_open",
      "return_in_transit",
      "return_delivered",
      "refunded",
    ].includes(rr.status);

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/refund-requests"
          className="inline-flex items-center gap-2 text-muted hover:text-heading mb-4"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          {locale === "en" ? "Back" : "Geri"}
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-heading">
              {locale === "en" ? "Refund" : "İade"} #{rr.refundNumber}
            </h1>
            <p className="text-sm text-muted mt-1">
              {new Date(rr.createdAt).toLocaleString(
                locale === "en" ? "en-US" : "tr-TR",
              )}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${toneClass[cfg.tone]}`}
          >
            {locale === "en" ? cfg.en : cfg.tr}
          </span>
        </div>

        <div className="space-y-4">
          {/* Order info */}
          <div className="bg-surface-elevated rounded-xl p-5">
            <h2 className="text-sm font-semibold text-heading mb-3">
              {locale === "en" ? "Order" : "Sipariş"}
            </h2>
            <Link
              href={`/orders/${rr.order.id}`}
              className="flex items-center gap-3 hover:bg-surface -mx-2 px-2 py-2 rounded-lg"
            >
              <div className="w-12 h-12 rounded bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                {rr.order.product?.images?.[0] ? (
                  <img
                    src={rr.order.product.images[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">📦</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-heading truncate">
                  {rr.order.product?.title ?? "—"}
                </p>
                <p className="text-sm text-muted">
                  {rr.order.orderNumber} · ₺
                  {Number(rr.amount).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </Link>
          </div>

          {/* Refund details */}
          <div className="bg-surface-elevated rounded-xl p-5">
            <h2 className="text-sm font-semibold text-heading mb-3">
              {locale === "en" ? "Reason & Description" : "Sebep ve Açıklama"}
            </h2>
            <p className="text-sm text-body">
              <span className="text-muted">
                {locale === "en" ? "Reason: " : "Sebep: "}
              </span>
              <span className="font-medium">
                {locale === "en" ? reason.en : reason.tr}
              </span>
            </p>
            {rr.description && (
              <p className="text-sm text-body mt-3 whitespace-pre-wrap">
                {rr.description}
              </p>
            )}
            {Array.isArray(rr.evidencePhotoUrls) &&
              rr.evidencePhotoUrls.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted mb-2">
                    {locale === "en" ? "Evidence" : "Kanıt"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {rr.evidencePhotoUrls.map((url: string, i: number) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-20 h-20 rounded overflow-hidden border border-border-default"
                      >
                        <img
                          src={url}
                          alt={`Kanıt ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Seller response (if rejected/disputed) */}
          {rr.sellerResponse && (
            <div className="bg-warning-50 border border-warning-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-warning-800 mb-2">
                {locale === "en" ? "Seller's Response" : "Satıcı Yanıtı"}
              </h2>
              <p className="text-sm text-warning-900 whitespace-pre-wrap">
                {rr.sellerResponse}
              </p>
            </div>
          )}

          {/* Return shipment info */}
          {showReturnShipment && (
            <div className="bg-info-50 border border-info-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-info-800 mb-3 flex items-center gap-2">
                <TruckIcon className="w-5 h-5" />
                {locale === "en" ? "Return Shipment" : "İade Kargonuz"}
              </h2>
              <p className="text-sm text-info-900 mb-3">
                {locale === "en"
                  ? "Take this number to a Sürat branch with the package. Drop-off is free."
                  : "Bu numarayı paketle birlikte herhangi bir Sürat şubesine teslim edin. Kargo ücretsizdir."}
              </p>
              <div className="bg-surface-elevated rounded-lg p-4 mb-3 flex items-center justify-between gap-3">
                <span className="font-mono text-lg font-bold text-heading break-all">
                  {rr.returnTrackingNumber}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(rr.returnTrackingNumber);
                    toast.success(
                      locale === "en" ? "Copied" : "Kopyalandı",
                    );
                  }}
                  className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                  {locale === "en" ? "Copy" : "Kopyala"}
                </button>
              </div>
              {rr.returnProvider === "surat" && (
                <a
                  href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnTrackingNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  <TruckIcon className="w-4 h-4" />
                  {locale === "en" ? "Track on Sürat" : "Sürat'ta Takip Et"}
                </a>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {canCancel && (
              <Button
                variant="secondary"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {locale === "en"
                  ? "Cancel Request"
                  : "Talebi İptal Et"}
              </Button>
            )}
            {canSellerDecide && (
              <>
                <Button
                  variant="primary"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                >
                  {locale === "en" ? "Accept Refund" : "İadeyi Kabul Et"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowRejectModal(true)}
                >
                  {locale === "en" ? "Reject" : "Reddet"}
                </Button>
              </>
            )}
          </div>
        </div>

        <Modal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          title={locale === "en" ? "Reject Refund" : "İadeyi Reddet"}
          maxWidth="max-w-md"
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {locale === "en"
                ? "Provide a clear reason. The case will be reviewed by an admin."
                : "Net bir gerekçe yazın. İtiraz admin tarafından incelenecektir."}
            </p>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={
                locale === "en" ? "Reason (min 10 chars)" : "Gerekçe (en az 10 karakter)"
              }
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowRejectModal(false)}
                disabled={rejectMutation.isPending}
              >
                {locale === "en" ? "Cancel" : "Vazgeç"}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={
                  rejectReason.trim().length < 10 || rejectMutation.isPending
                }
                onClick={() => rejectMutation.mutate()}
              >
                {locale === "en" ? "Reject" : "Reddet"}
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}
