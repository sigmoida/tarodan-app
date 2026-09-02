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
  createdAt: string;
  paymentStatus?: string | null;
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
  amount: number;
  /** Görünen durum (süresi geçmiş pending → expired). */
  status: OfferStatus;
  rawStatus: OfferStatus;
  buyerMustAccept: boolean;
  message?: string | null;
  cancelReason?: string | null;
  version: number;
  expiresAt: string;
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

/**
 * Admin iptali kuralı (API ile aynı): teklif pending veya accepted; bağlı
 * sipariş yok ya da henüz ödenmemiş/iptal. Ödenmiş sipariş → iade akışı.
 */
export function canCancelOffer(offer: {
  status: OfferStatus;
  order: { status: string } | null;
}): boolean {
  if (offer.status !== "pending" && offer.status !== "accepted") return false;
  if (!offer.order) return true;
  return (
    offer.order.status === "pending_payment" ||
    offer.order.status === "cancelled"
  );
}

/** Teklifin iptali ödeme bekleyen bir siparişi de kapatır mı? */
export function cancelClosesOrder(offer: {
  order: { status: string } | null;
}): boolean {
  return offer.order?.status === "pending_payment";
}

/** Teklif tutarının liste fiyatına oranı (yüzde, tam sayı). */
export function offerPercentOfList(offer: {
  amount: number;
  product: { listPrice: number };
}): number | null {
  if (!offer.product.listPrice) return null;
  return Math.round((offer.amount / offer.product.listPrice) * 100);
}
