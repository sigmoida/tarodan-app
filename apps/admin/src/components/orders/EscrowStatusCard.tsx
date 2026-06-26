"use client";

import { BanknotesIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import {
  computeEstimatedReleaseAt,
  computeRefundWindowEnd,
  describeHoldReason,
  cancellationTypeLabel,
  REFUND_WINDOW_DAYS,
  PAYOUT_GRACE_DAYS,
} from "@/lib/escrow";

/**
 * Yeni escrow modeli — sipariş detayında satıcıya ödeme (payout) durumu.
 *
 * Gösterilenler:
 *  - Tahmini serbest bırakma tarihi (teslim + 14 + 1 gün)
 *  - İade penceresi bitişi (teslim + 14 gün)
 *  - "Açık iade nedeniyle bekletiliyor / frozen" rozeti
 *  - Order.cancellationType (iptal | iade) rozeti
 *
 * Salt-okunur; aksiyon yok. Aksiyonlar Satıcı Ödemeleri (payouts) sayfasında.
 */
export interface EscrowStatusCardProps {
  status: string;
  deliveredAt?: string | null;
  completedAt?: string | null;
  cancellationType?: string | null;
  /** Sipariş için açık iade var mı (status=refund_requested veya talep listesi). */
  hasOpenRefund?: boolean;
}

const toneStyles: Record<string, { wrap: string; label: string }> = {
  danger: { wrap: "bg-danger-50 border-danger-200", label: "text-danger-700" },
  warning: { wrap: "bg-warning-50 border-warning-200", label: "text-warning-700" },
  info: { wrap: "bg-info-50 border-info-200", label: "text-info-700" },
  success: { wrap: "bg-success-50 border-success-200", label: "text-success-700" },
};

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("tr-TR", { dateStyle: "medium" }) : "—";
}

export function EscrowStatusCard({
  status,
  deliveredAt,
  completedAt,
  cancellationType,
  hasOpenRefund,
}: EscrowStatusCardProps) {
  // İptal edilmiş siparişte escrow yok; sadece iptal/iade tipini gösterelim.
  const isCancelled = status === "cancelled";
  const isRefunded = status === "refunded";
  const openRefund = hasOpenRefund || status === "refund_requested";

  const releaseAt = computeEstimatedReleaseAt(deliveredAt);
  const windowEnd = computeRefundWindowEnd(deliveredAt);
  const cancelType = cancellationTypeLabel(cancellationType);

  const reason = describeHoldReason({
    hasOpenRefund: openRefund,
    deliveredAt: deliveredAt ?? null,
  });
  const tone = toneStyles[reason.tone] ?? toneStyles.info;

  return (
    <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
        <BanknotesIcon className="w-5 h-5" />
        Satıcı Ödemesi (Escrow)
      </h2>

      {/* İptal/iade tipi rozeti */}
      {cancelType && (
        <div className="mb-4 flex items-start gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium ${
              cancellationType === "iade"
                ? "bg-warning-100 text-warning-700"
                : "bg-surface-alt text-muted"
            }`}
          >
            {cancelType.label}
          </span>
          {cancelType.detail && (
            <span className="text-xs text-muted mt-1">{cancelType.detail}</span>
          )}
        </div>
      )}

      {isCancelled ? (
        <p className="text-sm text-muted">
          Sipariş iptal edildi — satıcıya ödeme (payout) oluşmaz.
        </p>
      ) : isRefunded ? (
        <p className="text-sm text-muted">
          Sipariş iade edildi — ödeme alıcıya geri döndü, satıcıya payout yapılmadı.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Donduruldu / açık iade rozeti */}
          {openRefund && (
            <div className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
              <LockClosedIcon className="w-5 h-5 text-danger-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-danger-700">
                  Açık iade nedeniyle bekletiliyor (frozen)
                </p>
                <p className="text-xs text-danger-600 mt-0.5">
                  Hold, açık iade talebi sonuçlanana kadar kilitli — serbest bırakılamaz.
                </p>
              </div>
            </div>
          )}

          {/* Hold durumu özeti */}
          {!openRefund && (
            <div className={`rounded-lg border px-3 py-2 ${tone.wrap}`}>
              <p className={`text-sm font-medium ${tone.label}`}>{reason.label}</p>
              <p className="text-xs text-muted mt-0.5">{reason.detail}</p>
            </div>
          )}

          {/* Tarih kırılımı */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <span className="text-muted">Teslim tarihi</span>
              <p className="font-medium text-heading">
                {deliveredAt
                  ? new Date(deliveredAt).toLocaleString("tr-TR")
                  : "Henüz teslim edilmedi"}
              </p>
            </div>
            <div>
              <span className="text-muted">
                İade penceresi bitişi (teslim + {REFUND_WINDOW_DAYS} gün)
              </span>
              <p className="font-medium text-heading">{fmtDate(windowEnd)}</p>
            </div>
            <div>
              <span className="text-muted">
                Tahmini serbest bırakma (+{PAYOUT_GRACE_DAYS} gün grace)
              </span>
              <p className="font-medium text-heading">{fmtDate(releaseAt)}</p>
            </div>
            {completedAt && (
              <div>
                <span className="text-muted">Tamamlanma</span>
                <p className="font-medium text-heading">
                  {new Date(completedAt).toLocaleString("tr-TR")}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted">
            Ödeme satıcıya teslimden {REFUND_WINDOW_DAYS} gün sonra (iade penceresi)
            otomatik aktarılır; alıcı onayı ödemeyi erkene almaz. Tarihler tahminidir —
            kesin tarih ve aksiyon için Satıcı Ödemeleri sayfasına bakın.
          </p>
        </div>
      )}
    </div>
  );
}
