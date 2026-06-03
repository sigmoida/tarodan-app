"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import {
  Button,
  Modal,
  Spinner,
  StatusBadge,
  Textarea,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  TruckIcon,
  BanknotesIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {
  RefundPolicyCard,
  type ReturnShippingPayer,
} from "@/components/refunds/RefundPolicyCard";

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
    status: string;
    seller: { id: string; displayName: string; email: string; phone?: string | null };
    product: { id: string; title: string; images?: { url: string }[] };
    payment?: { id: string; status: string; amount: number | string } | null;
    shipment?: { status: string; deliveredAt?: string | null } | null;
  };
}

export default function RefundRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [rr, setRr] = useState<RefundRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolution, setResolution] = useState<"approve" | "reject">("approve");
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
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

  const handleResolve = async () => {
    const trimmed = notes.trim();
    if (trimmed.length < 10) {
      toast.error("Not en az 10 karakter olmalı");
      return;
    }
    setProcessing(true);
    try {
      await adminApi.resolveRefundDispute(id, { resolution, notes: trimmed });
      toast.success(resolution === "approve" ? "İtiraz onaylandı" : "İtiraz reddedildi");
      setShowResolveModal(false);
      setNotes("");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "İşlem başarısız");
    } finally {
      setProcessing(false);
    }
  };

  const handleForceFinalize = async () => {
    if (!confirm("Para iadesi manuel olarak tamamlanacak. Onaylıyor musunuz?")) return;
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

  const isDisputed = rr.status === "disputed";
  const canForceFinalize = rr.status === "return_delivered" && !rr.refundedAt;
  const history: HistoryEntry[] = Array.isArray(rr.metadata?.history)
    ? (rr.metadata!.history as HistoryEntry[])
    : [];

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
            Oluşturma: {new Date(rr.createdAt).toLocaleString("tr-TR")} — Tutar: ₺
            {Number(rr.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <StatusBadge status={rr.status} config={refundRequestStatusConfig} />
      </div>

      {/* counterfeit uyarısı (Faz 4B.3) */}
      {rr.reason === "counterfeit" && (
        <div className="bg-warning-50 border-2 border-warning-500 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-warning-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-warning-900">
                Sahte ürün şikayeti
              </div>
              <div className="text-sm text-warning-800">
                Satıcı yaptırımını değerlendirin (geçici askı, uyarı, fesh).
                İade onaylandıktan sonra satıcının diğer ürünleri için risk
                değerlendirmesi yapılmalı.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Senaryo D rozeti kaldırıldı — keyfi vazgeçme talebi artık kabul edilmiyor */}

      {/* Action panels */}
      {isDisputed && (
        <div className="bg-warning-50 border-2 border-warning-400 rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-8 w-8 text-warning-600 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-semibold text-warning-900">
                  İtiraz İncelemesi Gerekiyor
                </h2>
                <p className="text-sm text-warning-800 mt-1">
                  Satıcı talebi reddetti. Alıcının kanıtlarını ve satıcının yanıtını
                  inceleyip iade kargosunu açın (onayla) veya talebi kapatın (reddet).
                </p>
                {rr.sellerResponse && (
                  <p className="text-sm text-warning-900 mt-2">
                    <strong>Satıcı yanıtı:</strong> {rr.sellerResponse}
                  </p>
                )}
              </div>
            </div>
            <Button variant="primary" onClick={() => setShowResolveModal(true)}>
              İtirazı Çöz
            </Button>
          </div>
        </div>
      )}

      {canForceFinalize && (
        <div className="bg-info-50 border-2 border-info-400 rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <BanknotesIcon className="h-8 w-8 text-info-600 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-semibold text-info-900">
                  Para İadesi Bekleniyor
                </h2>
                <p className="text-sm text-info-800 mt-1">
                  İade kargosu satıcıya ulaştı ama para iadesi otomatik tamamlanmadı.
                  Manuel olarak tetikleyebilirsiniz.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleForceFinalize}
              isLoading={processingFinalize}
              disabled={processingFinalize}
            >
              Para İadesini Tamamla
            </Button>
          </div>
        </div>
      )}

      {/* Talep detayı */}
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

      <div className="bg-surface-elevated rounded-xl shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-semibold text-heading">Sipariş & Talep</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="font-medium text-body">Sipariş:</span>{" "}
            <Link
              href={`/orders/${rr.order.id}`}
              className="text-primary-600 hover:underline"
            >
              {rr.order.orderNumber}
            </Link>
          </div>
          <div>
            <span className="font-medium text-body">Ürün:</span> {rr.order.product.title}
          </div>
          <div>
            <span className="font-medium text-body">Sipariş tutarı:</span> ₺
            {Number(rr.order.totalAmount).toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}
          </div>
          <div>
            <span className="font-medium text-body">İade tutarı:</span> ₺
            {Number(rr.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
          <div>
            <span className="font-medium text-body">Sebep:</span> {rr.reason}
          </div>
          <div>
            <span className="font-medium text-body">Sipariş durumu:</span>{" "}
            {rr.order.status}
          </div>
        </div>
        {rr.description && (
          <div className="text-sm">
            <span className="font-medium text-body">Açıklama:</span>
            <p className="text-muted mt-1 whitespace-pre-wrap">{rr.description}</p>
          </div>
        )}
        {rr.evidencePhotoUrls && rr.evidencePhotoUrls.length > 0 && (
          <div>
            <span className="font-medium text-body block mb-2">Kanıt fotoğrafları:</span>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {rr.evidencePhotoUrls.map((url, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={i}
                  src={url}
                  alt={`Kanıt ${i + 1}`}
                  className="w-full h-24 object-cover rounded border border-border"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Return tracking */}
      {rr.returnTrackingNumber && (
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 space-y-2">
          <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
            <TruckIcon className="w-5 h-5" />
            İade Kargosu
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-medium text-body">Provider:</span>{" "}
              {rr.returnProvider}
            </div>
            <div>
              <span className="font-medium text-body">Takip no:</span>{" "}
              <span className="font-mono">{rr.returnTrackingNumber}</span>
            </div>
            <div>
              <span className="font-medium text-body">Durum:</span>{" "}
              {rr.returnStatus ?? "-"}
            </div>
            <div>
              <span className="font-medium text-body">Oluşturma:</span>{" "}
              {rr.returnCreatedAt
                ? new Date(rr.returnCreatedAt).toLocaleString("tr-TR")
                : "-"}
            </div>
            <div>
              <span className="font-medium text-body">Kargolama:</span>{" "}
              {rr.returnShippedAt
                ? new Date(rr.returnShippedAt).toLocaleString("tr-TR")
                : "-"}
            </div>
            <div>
              <span className="font-medium text-body">Teslim:</span>{" "}
              {rr.returnDeliveredAt
                ? new Date(rr.returnDeliveredAt).toLocaleString("tr-TR")
                : "-"}
            </div>
          </div>
        </div>
      )}

      {/* Refund result */}
      {rr.refundedAt && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="w-6 h-6 text-success-600" />
            <div>
              <div className="font-semibold text-success-900">Para İadesi Tamamlandı</div>
              <div className="text-sm text-success-800">
                {new Date(rr.refundedAt).toLocaleString("tr-TR")}
                {rr.providerRefundId && (
                  <>
                    {" — "}Provider Refund ID:{" "}
                    <span className="font-mono">{rr.providerRefundId}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* İade Politikası Kartı (Faz 4B.3) */}
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

      {/* Audit timeline */}
      {history.length > 0 && (
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-heading mb-4">Audit Trail</h2>
          <ol className="space-y-3">
            {history.map((h, i) => (
              <li key={i} className="border-l-2 border-primary-200 pl-4 py-1">
                <div className="text-sm font-medium">{h.action}</div>
                <div className="text-xs text-muted">
                  {new Date(h.at).toLocaleString("tr-TR")} — {h.by}
                </div>
                {h.details && Object.keys(h.details).length > 0 && (
                  <pre className="text-xs text-muted mt-1 whitespace-pre-wrap">
                    {JSON.stringify(h.details, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Resolve modal */}
      <Modal
        isOpen={showResolveModal}
        onClose={() => !processing && setShowResolveModal(false)}
        title="İtirazı Çöz"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={resolution === "approve" ? "primary" : "outline"}
              onClick={() => setResolution("approve")}
              disabled={processing}
            >
              <CheckCircleIcon className="h-5 w-5 mr-1" />
              Onayla (İade aç)
            </Button>
            <Button
              variant={resolution === "reject" ? "danger" : "outline"}
              onClick={() => setResolution("reject")}
              disabled={processing}
            >
              <XCircleIcon className="h-5 w-5 mr-1" />
              Reddet (Kapat)
            </Button>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              Karar Notu (en az 10 karakter)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Kararın gerekçesini özetleyin..."
              disabled={processing}
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowResolveModal(false)}
              disabled={processing}
            >
              İptal
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleResolve}
              isLoading={processing}
            >
              Çözümle
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
