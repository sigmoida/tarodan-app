import {
  ADMIN_CANCEL_REASON_CODES,
  ADMIN_CANCEL_REASON_I18N_KEYS,
  ADMIN_ORDER_CANCEL_BLOCKER_I18N_KEYS,
  adminCancelRequestProblem,
  adminOrderCancelBlockerOf,
  adminOrderCancelEligibility,
  isAdminCancelReasonCode,
  type AdminCancelReasonCode,
  type AdminCancelRequest,
  type AdminOrderCancelBlocker,
  type AdminOrderCancelEligibility,
  type AdminOrderCancelPreview,
  type AdminOrderLine,
  type AdminOrderListRow,
  type CancellationActorValue,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import { cancelReasonLabel } from "@/lib/utils";
import { rowSingleLine } from "../../_lib/rowView";
import {
  activeRefundOf,
  type OrderFileEntry,
  type OrderFileRefundRequest,
} from "./fileTypes";

/**
 * "Siparişi iptal et" uygunluğu — kural `@tarodan/types`'taki
 * `adminOrderCancelEligibility`'dir, API de iptali aynı kuralla kabul/red
 * eder (ödenmemiş, kargo öncesi ödenmiş, teklif siparişi). Burada yalnız
 * ekranların veri şekli o kuralın girdisine çevrilir.
 */

/** Sipariş dosyasındaki kalemin uygunluğu. */
export function fileEntryCancelEligibility(
  entry: OrderFileEntry,
): AdminOrderCancelEligibility {
  return adminOrderCancelEligibility({
    status: entry.status,
    shipment: entry.shipment,
    hasActiveRefund: activeRefundOf(entry) !== null,
  });
}

/** Sipariş dosyasındaki kalem yönetici tarafından iptal edilebilir mi? */
export function canCancelFileEntry(entry: OrderFileEntry): boolean {
  return fileEntryCancelEligibility(entry).allowed;
}

/**
 * Dosyada gösterilecek engel: iptal kapalıysa nedeni. Zaten kapanmış
 * (`closed`) sipariş için metin gösterilmez — iptal/iade durumu rozetten
 * okunur; yarıda kalmış iptalin kendi uyarısı vardır.
 */
export function fileEntryVisibleBlocker(
  entry: OrderFileEntry,
): AdminOrderCancelBlocker | null {
  const blocker = adminOrderCancelBlockerOf(fileEntryCancelEligibility(entry));
  return blocker === "closed" || blocker === "pending_cancellation"
    ? null
    : blocker;
}

/** Engelin panel metni ("Yönetici iptali kapalı: …"). */
export function cancelBlockerText(
  blocker: AdminOrderCancelBlocker,
  t: Translate,
): string {
  return t("admin.operations.orders.cancel.blocked", {
    reason: t(ADMIN_ORDER_CANCEL_BLOCKER_I18N_KEYS[blocker]),
  });
}

/**
 * Yarıda kalmış iptalin talebi: önceki iptal denemesi talebi açtı ama iade
 * tamamlanmadı (PSP hatası vb.) — İade Talepleri'nde elle sonuçlandırılır.
 */
export function pendingCancellationRefund(
  entry: OrderFileEntry,
): OrderFileRefundRequest | null {
  return adminOrderCancelBlockerOf(fileEntryCancelEligibility(entry)) ===
    "pending_cancellation"
    ? activeRefundOf(entry)
    : null;
}

/**
 * Liste satırı menüsünün iptal edeceği kalem: yalnız TEK kalemli satırda
 * (çok kalemli sepette hangi kalemin kastedildiği belirsizdir — iptal dosyada
 * kalem seçilerek yapılır) ve kalem uygunsa.
 */
export function cancellableRowLine(
  row: AdminOrderListRow,
): AdminOrderLine | null {
  const line = rowSingleLine(row);
  if (!line) return null;
  const pkg = row.packages.find((p) =>
    p.lines.some((l) => l.orderId === line.orderId),
  );
  return adminOrderCancelEligibility({
    status: line.status,
    shipment: pkg?.shipment ?? null,
    hasActiveRefund: line.hasActiveRefund,
  }).allowed
    ? line
    : null;
}

/** Gönderilebilir istek: katalogdan bir neden; "Diğer"de iç not (paylaşılan kural). */
export function isCancelRequestReady(request: Partial<AdminCancelRequest>) {
  return adminCancelRequestProblem(request) === null;
}

/** "Diğer" seçiliyken not zorunlu ama boş mu (alan hatası için). */
export function isNoteMissing(request: Partial<AdminCancelRequest>): boolean {
  return adminCancelRequestProblem(request) === "note_required";
}

/** Neden seçicisinin seçenekleri — paylaşılan katalogdan, katalog sırasıyla. */
export function cancelReasonOptions(
  t: Translate,
): { value: AdminCancelReasonCode; label: string }[] {
  return ADMIN_CANCEL_REASON_CODES.map((code) => ({
    value: code,
    label: t(ADMIN_CANCEL_REASON_I18N_KEYS[code]),
  }));
}

/** Önizlemenin kargo notu — kargo dahil mi, paket yine gidiyor mu. */
export function cancelShippingNoteKey(
  preview: Extract<AdminOrderCancelPreview, { kind: "paid_pre_handover" }>,
):
  | "admin.operations.orders.cancel.shippingIncluded"
  | "admin.operations.orders.cancel.shippingExcluded" {
  return preview.shippingRefunded
    ? "admin.operations.orders.cancel.shippingIncluded"
    : "admin.operations.orders.cancel.shippingExcluded";
}

/**
 * İptal edilmiş siparişin görünen nedeni: yönetici iptalinde katalog etiketi,
 * diğerlerinde kayıtlı gerekçenin etiketi. Yöneticinin iç notu panelde de
 * yalnız denetim kaydındadır.
 */
export function orderCancelReasonText(
  order: {
    cancelledBy?: CancellationActorValue | null;
    adminCancelReasonCode?: string | null;
    cancelReason?: string | null;
  },
  t: Translate,
): string | null {
  const code = order.adminCancelReasonCode;
  if (order.cancelledBy === "platform" && isAdminCancelReasonCode(code)) {
    return t(ADMIN_CANCEL_REASON_I18N_KEYS[code]);
  }
  return cancelReasonLabel(order.cancelReason, t);
}
