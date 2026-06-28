"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import {
  Spinner,
  StatusBadge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
  orderStatusConfig,
  shipmentStatusConfig,
  shipmentProviderConfig,
} from "@tarodan/ui";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  TruckIcon,
  UserIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {
  RefundPolicyCard,
  type ReturnShippingPayer,
} from "@/components/refunds/RefundPolicyCard";
import { RefundStatusStepper } from "@/components/refunds/RefundStatusStepper";
import { RefundNextActionPanel } from "@/components/refunds/RefundNextActionPanel";
import { payerLabels, refundActionLabel } from "@/components/refunds/refund-guidance";
import { useConfirm } from "@/components/ConfirmProvider";

interface HistoryEntry {
  action: string;
  by: string;
  at: string;
  details?: Record<string, any>;
}

interface RefundRequestDetail {
  id: string;
  refundNumber: string;
  status: string;
  amount: number | string;
  // Adet bazlı kısmi iade: order.quantity'nin kaç adedi iade ediliyor (default = tümü).
  refundQuantity?: number | null;
  reason: string;
  description?: string | null;
  evidencePhotoUrls?: string[];
  sellerResponse?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  returnProvider?: string | null;
  returnTrackingNumber?: string | null;
  returnStatus?: string | null;
  returnShippedAt?: string | null;
  returnDeliveredAt?: string | null;
  returnCreatedAt?: string | null;
  refundedAt?: string | null;
  providerRefundId?: string | null;
  metadata?: { history?: HistoryEntry[] } | null;
  // Policy override alanları (Faz 1.5)
  refundProductAmount?: boolean;
  refundShippingFee?: boolean;
  refundBuyerFee?: boolean;
  refundSellerCommission?: boolean;
  returnShippingPayer?: "buyer" | "seller" | "platform" | null;
  buyerInitiatedAmicable?: boolean;
  createdAt: string;
  requester: { id: string; displayName: string; email: string; phone?: string | null };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: number | string;
    subtotal?: number | string | null;
    shippingCost?: number | string;
    buyerFeeAmount?: number | string;
    commissionAmount?: number | string;
    // Sipariş adedi + birim fiyat — adet bazlı kısmi iade kırılımı için.
    quantity?: number | null;
    unitPrice?: number | string | null;
    status: string;
    seller: { id: string; displayName: string; email: string; phone?: string | null };
    product: { id: string; title: string; images?: { url: string }[] };
    payment?: { id: string; status: string; amount: number | string } | null;
    shipment?: { status: string; deliveredAt?: string | null } | null;
  };
}

function fmtTry(n: number | string): string {
  return `₺${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d?: string | null): string {
  return d ? new Date(d).toLocaleString("tr-TR") : "—";
}

export default function RefundRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();

  const [rr, setRr] = useState<RefundRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingFinalize, setProcessingFinalize] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getRefundRequest(id);
      const data = res.data?.data ?? res.data;
      setRr(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Talep yüklenemedi");
      router.push("/refund-requests");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleForceFinalize = async () => {
    if (!(await confirm({ description: "Para iadesi manuel olarak tamamlanacak. Onaylıyor musunuz?", destructive: true }))) return;
    setProcessingFinalize(true);
    try {
      await adminApi.forceFinalizeRefund(id);
      toast.success("Para iadesi tamamlandı");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "İşlem başarısız");
    } finally {
      setProcessingFinalize(false);
    }
  };

  // Policy override (Faz 4B.3)
  const handleSavePolicy = async (payload: {
    refundProductAmount?: boolean;
    refundShippingFee?: boolean;
    refundBuyerFee?: boolean;
    refundSellerCommission?: boolean;
  }) => {
    await adminApi.overrideRefundPolicy(id, payload);
    toast.success("İade politikası güncellendi");
    await load();
  };

  const handleSavePayer = async (payer: ReturnShippingPayer) => {
    await adminApi.setReturnShippingPayer(id, payer);
    toast.success("İade kargo tarafı güncellendi");
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="xl" color="border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!rr) {
    return <div className="text-center py-12 text-muted">Talep bulunamadı</div>;
  }

  const canForceFinalize = rr.status === "return_delivered" && !rr.refundedAt;
  const history: HistoryEntry[] = Array.isArray(rr.metadata?.history)
    ? (rr.metadata!.history as HistoryEntry[])
    : [];

  // Adet bazlı kısmi iade kırılımı.
  const orderQty = rr.order.quantity != null ? Number(rr.order.quantity) : 1;
  const refundQty = rr.refundQuantity != null ? Number(rr.refundQuantity) : orderQty;
  const isPartialQty = orderQty > 1 && refundQty < orderQty;
  const unitPrice =
    rr.order.unitPrice != null
      ? Number(rr.order.unitPrice)
      : rr.order.subtotal != null && orderQty > 0
        ? Number(rr.order.subtotal) / orderQty
        : null;

  const payer = rr.returnShippingPayer ? payerLabels[rr.returnShippingPayer] : null;
  const providerLabel =
    rr.returnProvider === "manual"
      ? "Manuel"
      : enumLabel(shipmentProviderConfig, rr.returnProvider ?? undefined, rr.returnProvider ?? "—");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/refund-requests"
          className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-6 h-6 text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-heading">
            İade Talebi <span className="font-mono text-base text-muted ml-2">{rr.refundNumber}</span>
          </h1>
          <p className="text-sm text-muted">
            Oluşturma: {fmtDate(rr.createdAt)} — İade tutarı: {fmtTry(rr.amount)}
          </p>
        </div>
        <StatusBadge status={rr.status} config={refundRequestStatusConfig} />
      </div>

      {/* Durum çizelgesi */}
      <RefundStatusStepper status={rr.status} />

      {/* Şimdi ne yapmalısınız? */}
      <RefundNextActionPanel
        status={rr.status}
        reason={rr.reason}
        amount={Number(rr.amount)}
        canForceFinalize={canForceFinalize}
        finalizing={processingFinalize}
        onFinalize={handleForceFinalize}
      />

      {/* Kim — Alıcı & Satıcı */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
            <UserIcon className="w-5 h-5" />
            Alıcı (Talep Eden)
          </h2>
          <Link
            href={`/users/${rr.requester.id}`}
            className="text-primary-600 hover:underline block"
          >
            {rr.requester.displayName}
          </Link>
          <div className="text-sm text-muted">{rr.requester.email}</div>
          {rr.requester.phone && (
            <div className="text-sm text-muted">{rr.requester.phone}</div>
          )}
        </div>

        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
            <UserIcon className="w-5 h-5" />
            Satıcı
          </h2>
          <Link
            href={`/users/${rr.order.seller.id}`}
            className="text-primary-600 hover:underline block"
          >
            {rr.order.seller.displayName}
          </Link>
          <div className="text-sm text-muted">{rr.order.seller.email}</div>
          {rr.order.seller.phone && (
            <div className="text-sm text-muted">{rr.order.seller.phone}</div>
          )}
        </div>
      </div>

      {/* Neden — Sipariş & Talep */}
      <div className="bg-surface-elevated rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-heading">Neden iade isteniyor?</h2>

        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg bg-surface-alt flex items-center justify-center overflow-hidden flex-shrink-0">
            {rr.order.product.images?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rr.order.product.images[0].url}
                alt={rr.order.product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl">📦</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-body truncate">{rr.order.product.title}</div>
            <Link
              href={`/orders/${rr.order.id}`}
              className="text-sm text-primary-600 hover:underline font-mono"
            >
              {rr.order.orderNumber}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="İade sebebi">
            <StatusBadge status={rr.reason} config={refundReasonConfig} />
          </Field>
          <Field label="Sipariş durumu">
            <StatusBadge status={rr.order.status} config={orderStatusConfig} />
          </Field>
          <Field label="Sipariş tutarı">{fmtTry(rr.order.totalAmount)}</Field>
          <Field label="İade tutarı">
            <span className="font-semibold">{fmtTry(rr.amount)}</span>
          </Field>
          <Field label="İade adedi">
            <span className={isPartialQty ? "font-semibold text-warning-700" : ""}>
              {refundQty} / {orderQty} adet
              {isPartialQty && " (kısmi iade)"}
            </span>
          </Field>
          {unitPrice != null && (
            <Field label="Birim fiyat">{fmtTry(unitPrice)}</Field>
          )}
        </div>

        {/* Adet bazlı kısmi iade kırılımı — "3 al 2 iade" gibi */}
        {isPartialQty && unitPrice != null && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm space-y-1">
            <div className="font-medium text-warning-800">Kısmi iade kırılımı</div>
            <div className="flex justify-between text-warning-900">
              <span>
                İade edilen ürün bedeli ({refundQty} × {fmtTry(unitPrice)})
              </span>
              <span className="font-semibold">{fmtTry(unitPrice * refundQty)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>
                Satıcıda kalan ({orderQty - refundQty} × {fmtTry(unitPrice)})
              </span>
              <span>{fmtTry(unitPrice * (orderQty - refundQty))}</span>
            </div>
            <p className="text-xs text-warning-700 pt-1">
              {orderQty} adetlik siparişin {refundQty} adedi iade ediliyor; kalan{" "}
              {orderQty - refundQty} adet siparişte kalır.
            </p>
          </div>
        )}

        {rr.description && (
          <div className="text-sm">
            <span className="font-medium text-body">Alıcının açıklaması:</span>
            <p className="text-muted mt-1 whitespace-pre-wrap">{rr.description}</p>
          </div>
        )}

        {rr.evidencePhotoUrls && rr.evidencePhotoUrls.length > 0 && (
          <div>
            <span className="font-medium text-body block mb-2">Kanıt fotoğrafları:</span>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {rr.evidencePhotoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Kanıt ${i + 1}`}
                    className="w-full h-24 object-cover rounded border border-border hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Kargo nasıl çalışacak — İade kargosu */}
      <div className="bg-surface-elevated rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
          <TruckIcon className="w-5 h-5" />
          İade Kargosu
        </h2>
        <p className="text-sm text-muted">
          Alıcı ürünü satıcıya geri gönderir. Ürün satıcıya ulaştığında para iadesi otomatik başlatılır.
        </p>

        <div className="rounded-lg bg-surface-alt p-3 text-sm">
          <span className="font-medium text-body">İade kargosunu kim öder? </span>
          {payer ? (
            <>
              <span className="font-semibold">{payer.label}</span>
              <span className="text-muted"> — {payer.helper}</span>
            </>
          ) : (
            <span className="text-muted">Henüz belirlenmedi (aşağıdaki “İade Politikası” bölümünden seçin).</span>
          )}
        </div>

        {rr.returnTrackingNumber ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Kargo firması">{providerLabel}</Field>
            <Field label="Takip no">
              <span className="font-mono">{rr.returnTrackingNumber}</span>
            </Field>
            <Field label="Kargo durumu">
              {rr.returnStatus ? (
                <StatusBadge status={rr.returnStatus} config={shipmentStatusConfig} />
              ) : (
                "—"
              )}
            </Field>
            <Field label="Kargo oluşturma">{fmtDate(rr.returnCreatedAt)}</Field>
            <Field label="Kargoya verildi">{fmtDate(rr.returnShippedAt)}</Field>
            <Field label="Satıcıya ulaştı">{fmtDate(rr.returnDeliveredAt)}</Field>
          </div>
        ) : (
          <div className="text-sm text-muted">
            İade kargosu henüz oluşturulmadı — talep onaylandığında otomatik açılır.
          </div>
        )}
      </div>

      {/* Para nasıl iade edilecek — sonuç + politika */}
      {rr.refundedAt && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="w-6 h-6 text-success-600 flex-shrink-0" />
            <div>
              <div className="font-semibold text-success-900">
                Para iadesi tamamlandı — {fmtTry(rr.amount)}
              </div>
              <div className="text-sm text-success-800">{fmtDate(rr.refundedAt)}</div>
            </div>
          </div>
        </div>
      )}

      <RefundPolicyCard
        initial={{
          refundProductAmount: rr.refundProductAmount ?? true,
          refundShippingFee: rr.refundShippingFee ?? true,
          refundBuyerFee: rr.refundBuyerFee ?? true,
          refundSellerCommission: rr.refundSellerCommission ?? true,
          returnShippingPayer: rr.returnShippingPayer ?? null,
        }}
        order={{
          subtotal:
            rr.order.subtotal != null ? Number(rr.order.subtotal) : null,
          shippingCost: Number(rr.order.shippingCost ?? 0),
          buyerFeeAmount: Number(rr.order.buyerFeeAmount ?? 0),
          commissionAmount: Number(rr.order.commissionAmount ?? 0),
        }}
        onSavePolicy={handleSavePolicy}
        onSavePayer={handleSavePayer}
        disabled={rr.status === "refunded" || rr.status === "cancelled"}
      />

      {/* İşlem geçmişi */}
      {history.length > 0 && (
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
            <ClockIcon className="w-5 h-5" />
            İşlem Geçmişi
          </h2>
          <ol className="space-y-3">
            {history
              .slice()
              .reverse()
              .map((h, i) => {
                const a = refundActionLabel(h.action);
                return (
                  <li key={i} className="border-l-2 border-primary-200 pl-4 py-1">
                    <div className="text-sm font-medium text-body">{a.label}</div>
                    <div className="text-xs text-muted">
                      {fmtDate(h.at)} — {a.actor}
                    </div>
                  </li>
                );
              })}
          </ol>
        </div>
      )}

      {/* Teknik detaylar (varsayılan kapalı) */}
      <details className="bg-surface-elevated rounded-xl shadow-sm p-6">
        <summary className="cursor-pointer text-sm font-medium text-muted select-none">
          Teknik detaylar
        </summary>
        <div className="mt-4 space-y-2 text-xs">
          <TechRow label="Talep ID" value={rr.id} mono />
          <TechRow label="İade kargo sağlayıcı (ham)" value={rr.returnProvider} mono />
          <TechRow label="Provider Refund ID" value={rr.providerRefundId} mono />
          {history.length > 0 && (
            <div>
              <div className="font-medium text-body mb-1">Ham işlem geçmişi</div>
              <pre className="whitespace-pre-wrap rounded bg-surface-alt p-3 text-muted overflow-x-auto">
                {JSON.stringify(history, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-body">{label}:</span>
      <span>{children}</span>
    </div>
  );
}

function TechRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="font-medium text-body">{label}:</span>
      <span className={mono ? "font-mono text-muted break-all" : "text-muted"}>
        {value || "—"}
      </span>
    </div>
  );
}
