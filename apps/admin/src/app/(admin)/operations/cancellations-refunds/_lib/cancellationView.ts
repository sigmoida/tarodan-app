import {
  cancellationActorI18nKey,
  cancellationReasonMessage,
  type AdminCancellationInfo,
  type AdminCancellationRefundState,
  type AdminCancellationRow,
  type CancellationActorValue,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { Translate } from "@/lib/statusLabels";

/**
 * İptaller sekmesinin saf görünüm türetmeleri — hücreler bunları okur, kural
 * tek yerde durur. Etiketlerin katalog anahtarları `@tarodan/types`'tadır
 * (API'nin Excel'i de aynı anahtarları okur).
 */

/** Satırın dosyası: takas dosyası ya da sipariş dosyası (grup buradan çözülür). */
export function cancellationDetailHref(row: AdminCancellationRow): string {
  if (row.tradeId) return `/operations/trades/${row.tradeId}`;
  return `/operations/orders/${row.detailOrderId ?? row.id}`;
}

/** Kalemin iptal bilgisi; satırda yoksa (beklenmez) boş. */
export function lineCancellation(
  row: AdminCancellationRow,
  lineId: string,
): AdminCancellationInfo | undefined {
  return row.cancellations[lineId];
}

/** Kısmen iptal edilmiş sepet: satırda iptal edilmemiş kalemler de var. */
export function isPartialCancellation(row: AdminCancellationRow): boolean {
  return row.lineCounts.cancelled < row.lineCounts.total;
}

/** İptal nedeninin metni: alıcı kodu etiketi, "Süresi Dolan", metin ya da "—". */
export function cancellationReasonLabel(
  info: AdminCancellationInfo | undefined,
  t: Translate,
): string {
  if (!info) return "—";
  const message = cancellationReasonMessage(info.reason);
  return "key" in message ? t(message.key as MessageKey) : message.text;
}

/** İptal edenin etiketi; aktörü damgalanmamış iptal "Bilinmiyor"dur. */
export function cancellationActorLabel(
  actor: CancellationActorValue | null | undefined,
  t: Translate,
): string {
  return t(cancellationActorI18nKey(actor ?? null) as MessageKey);
}

/** İade durumunun rozet tonu: bekleyen/başarısız dikkat ister. */
export function refundStateVariant(
  state: AdminCancellationRefundState,
): "success" | "warning" | "danger" | "info" | "default" {
  switch (state) {
    case "refunded":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
    case "in_review":
      return "info";
    default:
      return "default";
  }
}

/** Satır durumunun katalog anahtarı (sipariş iptali / takas reddi / karışık). */
export function cancellationStatusKey(status: string): MessageKey {
  const known = ["cancelled", "rejected", "mixed"];
  return `admin.operations.cancellations.status.${
    known.includes(status) ? status : "cancelled"
  }` as MessageKey;
}
