import {
  adminOrderCancelEligibility,
  type AdminOrderCancelEligibility,
  type CancellationActorValue,
} from "@tarodan/types";
import { offerStatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";
import { statusFilterOptions } from "@/lib/utils";

type T = ReturnType<typeof useTranslations<never>>;

export type OfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "payment_expired";

export interface OfferParty {
  id: string;
  displayName: string;
  email?: string | null;
}

export interface OfferLinkedOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  cancelReason?: string | null;
  cancellationType?: string | null;
  cancelledBy?: CancellationActorValue | null;
  adminCancelReasonCode?: string | null;
  createdAt: string;
  paymentStatus?: string | null;
  /** Yönetici iptali uygunluğunun girdileri (sipariş dosyasıyla aynı). */
  shipment: { status: string; shippedAt: string | null } | null;
  hasActiveRefund: boolean;
}

/** API `AdminOfferQueryService.formatRow` satırı. */
export interface OfferRow {
  id: string;
  productId: string;
  product: {
    id: string;
    title: string;
    listPrice: number;
    status: string;
    imageUrl: string | null;
  };
  buyer: OfferParty;
  seller: OfferParty;
  /** Test şeridi teklifi (taraflardan biri test hesabı) — "TEST" rozeti. */
  isTest: boolean;
  amount: number;
  /** Görünen durum (süresi geçmiş pending → expired). */
  status: OfferStatus;
  rawStatus: OfferStatus;
  buyerMustAccept: boolean;
  message?: string | null;
  cancelReason?: string | null;
  version: number;
  expiresAt: string;
  /** extend_once: süre bir kez uzatıldıysa uzatma anı (null = hak kullanılmadı). */
  extendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: OfferLinkedOrder | null;
}

/** Filtre seçenekleri — `countered` DB durumu değildir, listelenmez. */
export const OFFER_FILTER_STATUSES: OfferStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
  "payment_expired",
];

export const offerStatusOptions = (t: T) =>
  statusFilterOptions(offerStatusConfig, t, { keys: OFFER_FILTER_STATUSES });

/** Teklifin canlı (iptal edilmemiş) bağlı siparişi; yoksa null. */
function liveOrderOf<O extends { status: string }>(offer: {
  order: O | null;
}): O | null {
  return offer.order && offer.order.status !== "cancelled" ? offer.order : null;
}

/**
 * Teklif iptali kuralı (API `AdminOfferService` ile aynı): SİPARİŞİ OLMAYAN
 * teklif — pending ya da siparişi kapanmış accepted. Canlı siparişi olan
 * teklif sipariş üzerinden iptal edilir (`offerCancelAction`).
 */
export function canCancelOffer(offer: {
  status: OfferStatus;
  order: { status: string } | null;
}): boolean {
  if (offer.status !== "pending" && offer.status !== "accepted") return false;
  return liveOrderOf(offer) === null;
}

/** Teklifin bağlı siparişinin yönetici iptali uygunluğu; canlı sipariş yoksa null. */
export function linkedOrderCancelEligibility(offer: {
  order: OfferLinkedOrder | null;
}): AdminOrderCancelEligibility | null {
  const order = liveOrderOf(offer);
  return order
    ? adminOrderCancelEligibility({
        status: order.status,
        shipment: order.shipment,
        hasActiveRefund: order.hasActiveRefund,
      })
    : null;
}

/**
 * Teklif ekranının iptal işlemi — TEK karar: canlı sipariş varsa sipariş
 * iptali (sepet siparişiyle aynı diyalog ve uç), yoksa teklif iptali; hiçbiri
 * uygun değilse null.
 */
export type OfferCancelAction =
  { kind: "order"; order: OfferLinkedOrder } | { kind: "offer" } | null;

export function offerCancelAction(offer: {
  status: OfferStatus;
  order: OfferLinkedOrder | null;
}): OfferCancelAction {
  const order = liveOrderOf(offer);
  if (order) {
    return linkedOrderCancelEligibility(offer)?.allowed
      ? { kind: "order", order }
      : null;
  }
  return canCancelOffer(offer) ? { kind: "offer" } : null;
}

/** Teklif tutarının liste fiyatına oranı (yüzde, tam sayı). */
export function offerPercentOfList(offer: {
  amount: number;
  product: { listPrice: number };
}): number | null {
  if (!offer.product.listPrice) return null;
  return Math.round((offer.amount / offer.product.listPrice) * 100);
}
