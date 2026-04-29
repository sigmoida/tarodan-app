"use client";

import { Button, Modal, Spinner, Textarea } from "@tarodan/ui";
import { refundsApi } from "@/lib/api";
import { useTranslation } from "@/i18n/LanguageContext";
import { useAuthStore } from "@/stores/authStore";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  TruckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const reasonLabel: Record<string, { tr: string; en: string }> = {
  changed_mind: { tr: "Vazgeçtim (cayma hakkı)", en: "Changed mind" },
  damaged: { tr: "Hasarlı geldi", en: "Damaged" },
  wrong_item: { tr: "Yanlış ürün geldi", en: "Wrong item" },
  not_as_described: { tr: "Açıklamayla uyuşmuyor", en: "Not as described" },
  missing_parts: { tr: "Eksik parça", en: "Missing parts" },
  other: { tr: "Diğer", en: "Other" },
};

const statusConfig: Record<
  string,
  { tr: string; en: string; tone: "info" | "success" | "warning" | "danger" | "muted" }
> = {
  pending_review: { tr: "Satıcı / Admin İncelemesinde", en: "Under Review", tone: "warning" },
  approved: { tr: "Onaylandı, İşleniyor", en: "Approved", tone: "info" },
  wait_for_delivery: {
    tr: "Ürün Tesliminden Sonra İşleme Alınacak",
    en: "Awaiting Delivery",
    tone: "info",
  },
  return_shipment_open: {
    tr: "İade Kargonuz Hazır",
    en: "Return Shipment Ready",
    tone: "info",
  },
  return_in_transit: { tr: "İade Yolda", en: "Return In Transit", tone: "info" },
  return_delivered: {
    tr: "Satıcıya Ulaştı, Para İadesi Yapılıyor",
    en: "Reached Seller",
    tone: "info",
  },
  refunded: { tr: "İade Tamamlandı", en: "Refunded", tone: "success" },
  rejected: { tr: "Reddedildi", en: "Rejected", tone: "danger" },
  disputed: { tr: "İtirazlı (İnceleme)", en: "Under Dispute", tone: "warning" },
  cancelled: { tr: "İptal Edildi", en: "Cancelled", tone: "muted" },
};

const toneClass: Record<string, string> = {
  info: "bg-info-100 text-info-800 border-info-300",
  success: "bg-success-100 text-success-800 border-success-300",
  warning: "bg-warning-100 text-warning-800 border-warning-300",
  danger: "bg-danger-100 text-danger-800 border-danger-300",
  muted: "bg-surface-alt text-muted border-border-default",
};

const TIMELINE_STEPS = [
  "created",
  "approved",
  "return_shipment",
  "in_transit",
  "completed",
] as const;

type TimelineStep = (typeof TIMELINE_STEPS)[number];

const stepLabel: Record<TimelineStep, { tr: string; en: string }> = {
  created: { tr: "Talep Oluşturuldu", en: "Request Created" },
  approved: { tr: "Onaylandı", en: "Approved" },
  return_shipment: { tr: "İade Kargosu Hazır", en: "Return Shipment Ready" },
  in_transit: { tr: "Satıcıya Ulaşıyor", en: "Reaching Seller" },
  completed: { tr: "Para İade Edildi", en: "Refund Completed" },
};

function getCurrentStepIndex(status: string): number {
  switch (status) {
    case "pending_review":
    case "wait_for_delivery":
      return 0;
    case "approved":
      return 1;
    case "return_shipment_open":
      return 2;
    case "return_in_transit":
      return 3;
    case "return_delivered":
      return 4;
    case "refunded":
      return 5;
    default:
      return 0;
  }
}

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
      toast.success(locale === "en" ? "Request cancelled" : "Talep iptal edildi");
      queryClient.invalidateQueries({ queryKey: ["refund-request", refundId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Hata"),
  });

  const acceptMutation = useMutation({
    mutationFn: () => refundsApi.accept(refundId),
    onSuccess: () => {
      toast.success(locale === "en" ? "Request accepted" : "Talep kabul edildi");
      queryClient.invalidateQueries({ queryKey: ["refund-request", refundId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Hata"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => refundsApi.reject(refundId, rejectReason.trim()),
    onSuccess: () => {
      toast.success(locale === "en" ? "Request rejected" : "Talep reddedildi");
      setShowRejectModal(false);
      queryClient.invalidateQueries({ queryKey: ["refund-request", refundId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Hata"),
  });

  if (authLoading || isLoading || !rr) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const cfg = statusConfig[rr.status] ?? {
    tr: rr.status,
    en: rr.status,
    tone: "muted" as const,
  };
  const isBuyer = user?.id === rr.requesterId;
  const isSeller = user?.id === rr.order?.seller?.id;
  const reason = reasonLabel[rr.reason] ?? { tr: rr.reason, en: rr.reason };

  const isInstantRefund = rr.status === "refunded" && !rr.returnTrackingNumber;
  const isTerminal = ["refunded", "rejected", "cancelled"].includes(rr.status);
  const currentStepIdx = getCurrentStepIndex(rr.status);

  const canCancel =
    isBuyer && (rr.status === "pending_review" || rr.status === "wait_for_delivery");
  const canSellerDecide = isSeller && rr.status === "pending_review";

  const showReturnShipment =
    rr.returnTrackingNumber &&
    [
      "return_shipment_open",
      "return_in_transit",
      "return_delivered",
      "refunded",
    ].includes(rr.status);

  const productImage = rr.order?.product?.images?.[0];

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-3xl mx-auto px-4 py-6 pb-32 md:pb-8">
        <Link
          href="/refund-requests"
          className="inline-flex items-center gap-2 text-muted hover:text-heading mb-4 text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {locale === "en" ? "Back to refunds" : "İade taleplerime dön"}
        </Link>

        {/* Hero card */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-1">
                {locale === "en" ? "Refund Request" : "İade Talebi"}
              </p>
              <h1 className="text-2xl font-bold text-heading font-mono">
                {rr.refundNumber}
              </h1>
              <p className="text-sm text-muted mt-1">
                {new Date(rr.createdAt).toLocaleString(
                  locale === "en" ? "en-US" : "tr-TR",
                )}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border ${toneClass[cfg.tone]} whitespace-nowrap`}
            >
              {locale === "en" ? cfg.en : cfg.tr}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-border-default">
            <CurrencyDollarIcon className="w-5 h-5 text-success-600" />
            <span className="text-sm text-muted">
              {locale === "en" ? "Refund amount" : "İade tutarı"}:
            </span>
            <span className="text-lg font-bold text-success-700">
              ₺
              {Number(rr.amount).toLocaleString("tr-TR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Timeline (only meaningful for non-terminal cooling-off flows) */}
        {!isInstantRefund &&
          !["rejected", "cancelled"].includes(rr.status) && (
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mb-4">
              <h2 className="text-sm font-semibold text-heading mb-4">
                {locale === "en" ? "Progress" : "Süreç"}
              </h2>
              <div className="flex items-start justify-between gap-2 overflow-x-auto pb-1">
                {TIMELINE_STEPS.map((step, idx) => {
                  const isPast = idx < currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  const lbl = stepLabel[step];
                  return (
                    <div
                      key={step}
                      className="flex-1 min-w-[70px] flex flex-col items-center text-center relative"
                    >
                      {idx > 0 && (
                        <div
                          className={`absolute top-3 left-0 -translate-x-1/2 right-1/2 h-0.5 ${
                            isPast || isCurrent
                              ? "bg-primary-500"
                              : "bg-border-default"
                          }`}
                        />
                      )}
                      <div
                        className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isPast
                            ? "bg-primary-500 text-inverted"
                            : isCurrent
                              ? "bg-primary-500 text-inverted ring-4 ring-primary-100"
                              : "bg-surface-alt text-muted border border-border-default"
                        }`}
                      >
                        {isPast ? "✓" : idx + 1}
                      </div>
                      <p
                        className={`mt-2 text-xs leading-tight ${
                          isCurrent
                            ? "font-semibold text-primary-700"
                            : isPast
                              ? "text-body"
                              : "text-muted"
                        }`}
                      >
                        {locale === "en" ? lbl.en : lbl.tr}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Terminal state callout */}
        {rr.status === "refunded" && (
          <div className="bg-success-50 border border-success-200 rounded-xl p-5 mb-4 flex items-start gap-3">
            <CheckIcon className="w-6 h-6 text-success-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-success-800">
                {locale === "en"
                  ? "Refund completed successfully"
                  : "İadeniz başarıyla tamamlandı"}
              </p>
              <p className="text-sm text-success-700 mt-1">
                {locale === "en"
                  ? "Your money has been returned to the original payment method. It may take 1-3 business days to reflect on your statement."
                  : "Tutar ödediğiniz karta iade edildi. Banka ekstresinde görünmesi 1-3 iş günü sürebilir."}
              </p>
              {rr.refundedAt && (
                <p className="text-xs text-success-700 mt-2">
                  {locale === "en" ? "Refunded at: " : "İade tarihi: "}
                  {new Date(rr.refundedAt).toLocaleString(
                    locale === "en" ? "en-US" : "tr-TR",
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {rr.status === "rejected" && (
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-5 mb-4 flex items-start gap-3">
            <XCircleIcon className="w-6 h-6 text-danger-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-danger-800">
                {locale === "en" ? "Request rejected" : "Talep reddedildi"}
              </p>
              <p className="text-sm text-danger-700 mt-1">
                {locale === "en"
                  ? "If you disagree, please reach out to support."
                  : "Bu karara itiraz etmek için destek ekibimizle iletişime geçin."}
              </p>
            </div>
          </div>
        )}

        {rr.status === "disputed" && (
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-5 mb-4 flex items-start gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-warning-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-warning-800">
                {locale === "en"
                  ? "Under admin review"
                  : "Admin İncelemesinde"}
              </p>
              <p className="text-sm text-warning-700 mt-1">
                {locale === "en"
                  ? "The seller disputed this request. Our admin team will review the case and reach out within 1-3 business days."
                  : "Satıcı bu talebe itiraz etti. Admin ekibimiz dosyayı 1-3 iş günü içinde inceleyip size dönecek."}
              </p>
            </div>
          </div>
        )}

        {/* Return shipment card (most important card during return phase) */}
        {showReturnShipment && rr.status !== "refunded" && (
          <div className="bg-info-50 border-2 border-info-200 rounded-xl p-5 mb-4">
            <h2 className="text-base font-semibold text-info-900 mb-3 flex items-center gap-2">
              <TruckIcon className="w-5 h-5" />
              {locale === "en" ? "Your Return Shipment" : "İade Kargonuz"}
            </h2>

            {rr.status === "return_shipment_open" && (
              <p className="text-sm text-info-900 mb-3">
                {locale === "en"
                  ? "Take the package to any Sürat branch. The shipment is paid — give them this tracking number:"
                  : "Paketi en yakın Sürat şubesine bırakın. Kargo ücreti ödenmiştir — şubedeki personele bu numarayı verin:"}
              </p>
            )}
            {rr.status === "return_in_transit" && (
              <p className="text-sm text-info-900 mb-3">
                {locale === "en"
                  ? "Your package is on its way back to the seller. Once delivered, your refund will be processed automatically."
                  : "Paketiniz satıcıya ulaşmak üzere yolda. Teslim edildiği anda paranız otomatik iade edilecek."}
              </p>
            )}
            {rr.status === "return_delivered" && (
              <p className="text-sm text-info-900 mb-3">
                {locale === "en"
                  ? "The package has reached the seller. Your refund is being processed and will be on your card shortly."
                  : "Paket satıcıya ulaştı. Para iadeniz şu anda işleniyor, kartınıza kısa süre içinde geçecek."}
              </p>
            )}

            <div className="bg-surface-elevated rounded-lg p-4 flex items-center justify-between gap-3 mb-3">
              <span className="font-mono text-lg font-bold text-heading break-all">
                {rr.returnTrackingNumber}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(rr.returnTrackingNumber);
                  toast.success(locale === "en" ? "Copied" : "Kopyalandı");
                }}
                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap"
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

        {/* Order info */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-heading mb-3">
            {locale === "en" ? "Related Order" : "İlgili Sipariş"}
          </h2>
          <Link
            href={`/orders/${rr.order.id}`}
            className="flex items-center gap-3 hover:bg-surface -mx-2 px-2 py-2 rounded-lg transition-colors"
          >
            <div className="w-14 h-14 rounded-lg bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
              {productImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productImage}
                  alt={rr.order.product?.title ?? ""}
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
              <p className="text-sm text-muted">{rr.order.orderNumber}</p>
            </div>
            <span className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap">
              {locale === "en" ? "View →" : "Aç →"}
            </span>
          </Link>
        </div>

        {/* Reason & description */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-heading mb-3">
            {locale === "en" ? "Reason" : "Sebep"}
          </h2>
          <p className="text-base font-medium text-heading">
            {locale === "en" ? reason.en : reason.tr}
          </p>
          {rr.description && (
            <div className="mt-3 pt-3 border-t border-border-default">
              <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-1">
                {locale === "en" ? "Description" : "Açıklama"}
              </p>
              <p className="text-sm text-body whitespace-pre-wrap">
                {rr.description}
              </p>
            </div>
          )}
          {Array.isArray(rr.evidencePhotoUrls) &&
            rr.evidencePhotoUrls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border-default">
                <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-2">
                  {locale === "en" ? "Evidence" : "Kanıt"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {rr.evidencePhotoUrls.map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-20 h-20 rounded-lg overflow-hidden border border-border-default hover:opacity-80 transition-opacity"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${locale === "en" ? "Evidence" : "Kanıt"} ${i + 1}`}
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
          <div className="bg-warning-50 border border-warning-200 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold text-warning-900 mb-2">
              {locale === "en" ? "Seller's Response" : "Satıcı Yanıtı"}
            </h2>
            <p className="text-sm text-warning-900 whitespace-pre-wrap">
              {rr.sellerResponse}
            </p>
          </div>
        )}

        {/* What's next info card (only for non-terminal states) */}
        {!isTerminal && (
          <div className="bg-surface rounded-xl border border-border-default p-5 mb-4">
            <h2 className="text-sm font-semibold text-heading mb-2">
              {locale === "en" ? "What's next?" : "Sonraki Adım"}
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {rr.status === "pending_review" &&
                (locale === "en"
                  ? "The seller has 48 hours to respond. If they don't, the request will be auto-approved."
                  : "Satıcının 48 saat içinde cevap vermesi gerekiyor. Cevap gelmezse talep otomatik olarak onaylanacak.")}
              {rr.status === "wait_for_delivery" &&
                (locale === "en"
                  ? "Once your package is marked as delivered, we'll automatically open a free Sürat return shipment for you."
                  : "Ürünün size teslim edildiği anda otomatik olarak ücretsiz Sürat iade kargosu açılacak ve size takip numarası verilecek.")}
              {rr.status === "return_shipment_open" &&
                (locale === "en"
                  ? "Drop the package off at any Sürat branch. Once it reaches the seller, your refund will be triggered automatically."
                  : "Paketi en yakın Sürat şubesine bırakın. Satıcıya ulaştığı anda paranız otomatik iade edilecek.")}
              {rr.status === "return_in_transit" &&
                (locale === "en"
                  ? "Your package is on its way. Track it via the link above."
                  : "Paketiniz yolda — yukarıdaki Sürat takip linkinden ilerleyişi izleyebilirsiniz.")}
              {rr.status === "return_delivered" &&
                (locale === "en"
                  ? "The seller has received the package. Your refund is being processed."
                  : "Paket satıcıya teslim edildi. Para iadesi şu anda işleniyor — birkaç dakika içinde tamamlanır.")}
              {rr.status === "approved" &&
                (locale === "en"
                  ? "Your request was approved. Refund is being processed."
                  : "Talebiniz onaylandı, iade şu anda işleniyor.")}
              {rr.status === "disputed" &&
                (locale === "en"
                  ? "An admin will review the case and contact you within 1-3 business days."
                  : "Admin ekibimiz dosyayı inceleyip 1-3 iş günü içinde size dönecek.")}
            </p>
          </div>
        )}

        {/* Actions */}
        {(canCancel || canSellerDecide) && (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-5">
            <div className="flex flex-col sm:flex-row gap-2">
              {canSellerDecide && (
                <>
                  <Button
                    variant="primary"
                    onClick={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                    className="flex-1"
                  >
                    {locale === "en" ? "Accept Refund" : "İadeyi Kabul Et"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowRejectModal(true)}
                    className="flex-1"
                  >
                    {locale === "en" ? "Reject" : "Reddet"}
                  </Button>
                </>
              )}
              {canCancel && (
                <Button
                  variant="secondary"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {locale === "en" ? "Cancel This Request" : "Talebi İptal Et"}
                </Button>
              )}
            </div>
          </div>
        )}

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
                : "Net bir gerekçe yazın. İtirazınız admin tarafından incelenecektir."}
            </p>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={
                locale === "en"
                  ? "Reason (min 10 chars)"
                  : "Gerekçe (en az 10 karakter)"
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
