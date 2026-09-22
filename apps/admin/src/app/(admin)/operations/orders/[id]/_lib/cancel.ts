import {
  isPreShipmentCancellable,
  preShipmentCancelBlocker,
  type AdminOrderCancelPreview,
  type AdminOrderLine,
  type AdminOrderListRow,
  type PreShipmentCancelBlocker,
} from "@tarodan/types";
import { rowSingleLine } from "../../_lib/rowView";
import {
  activeRefundOf,
  type OrderFileEntry,
  type OrderFileRefundRequest,
} from "./fileTypes";

/**
 * "Siparişi iptal et" uygunluğu — kural `@tarodan/types`'taki
 * `isPreShipmentCancellable`'dır, API de iptali aynı kuralla kabul/red eder.
 * Burada yalnız ekranların veri şekli o kuralın girdisine çevrilir.
 */

/** Gerekçe üst sınırı — API DTO'su (`AdminCancelOrderDto.reason`) ile aynı. */
export const CANCEL_REASON_MAX_LENGTH = 500;

/** Sipariş dosyasındaki kalemin kargo öncesi iptal engeli (yoksa null). */
export function fileEntryCancelBlocker(
  entry: OrderFileEntry,
): PreShipmentCancelBlocker | null {
  return preShipmentCancelBlocker({
    status: entry.status,
    shipment: entry.shipment,
    hasActiveRefund: activeRefundOf(entry) !== null,
  });
}

/** Sipariş dosyasındaki kalem kargo öncesi iptal edilebilir mi? */
export function canCancelFileEntry(entry: OrderFileEntry): boolean {
  return fileEntryCancelBlocker(entry) === null;
}

/**
 * Yarıda kalmış iptalin talebi: önceki iptal denemesi talebi açtı ama iade
 * tamamlanmadı (PSP hatası vb.) — İade Talepleri'nde elle sonuçlandırılır.
 */
export function pendingCancellationRefund(
  entry: OrderFileEntry,
): OrderFileRefundRequest | null {
  return fileEntryCancelBlocker(entry) === "pending_cancellation"
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
  return isPreShipmentCancellable({
    status: line.status,
    shipment: pkg?.shipment ?? null,
    hasActiveRefund: line.hasActiveRefund,
  })
    ? line
    : null;
}

/** Gönderilebilir gerekçe: boşluktan ibaret değil ve üst sınırı aşmıyor. */
export function isValidCancelReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= CANCEL_REASON_MAX_LENGTH;
}

/** Önizlemenin kargo notu — kargo dahil mi, paket yine gidiyor mu. */
export function cancelShippingNoteKey(
  preview: AdminOrderCancelPreview,
):
  | "admin.operations.orders.cancel.shippingIncluded"
  | "admin.operations.orders.cancel.shippingExcluded" {
  return preview.shippingRefunded
    ? "admin.operations.orders.cancel.shippingIncluded"
    : "admin.operations.orders.cancel.shippingExcluded";
}
