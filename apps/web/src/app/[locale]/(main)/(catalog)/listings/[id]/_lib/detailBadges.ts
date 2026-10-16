/** @format */

import {
  getProductDiscountPercent,
  isProductOnSaleDisplay,
  isProductOutOfStock,
} from "@/lib/productPrice";
import type { Listing } from "./types";

/** Detay badge satırındaki rozetler — sıra: Satıldı → %İndirim → Takas. */
export type DetailBadge =
  { kind: "sold" } | { kind: "sale"; percent: number } | { kind: "trade" };

type TradeFields = Pick<
  Listing,
  "tradeAvailable" | "trade_available" | "isTradeEnabled"
>;

/**
 * İlan takasa açık mı (niyet VE yetki). `tradeAvailable` API'nin türettiği
 * efektif değerdir; yoksa eski alanlara düşülür. Takas butonu ve rozet aynı
 * kaynağı kullanır.
 */
export function resolveTradeFlag(listing: TradeFields | null | undefined) {
  return (
    listing?.tradeAvailable ??
    (listing?.trade_available || listing?.isTradeEnabled || false)
  );
}

/**
 * Başlık + fiyat bloğunun altındaki badge satırı. Takas rozeti yalnız ilan
 * satın alınabilirken görünür (sold / reserved / stok 0 değil); sahip de görür.
 */
export function getDetailBadges(listing: Listing): DetailBadge[] {
  const badges: DetailBadge[] = [];
  if (listing.status === "sold") badges.push({ kind: "sold" });

  if (isProductOnSaleDisplay(listing)) {
    const percent = getProductDiscountPercent(listing);
    if (percent > 0) badges.push({ kind: "sale", percent });
  }

  const purchasable = !isProductOutOfStock({
    status: listing.status,
    availableQuantity: listing.availableQuantity ?? listing.quantity,
  });
  if (resolveTradeFlag(listing) && purchasable) badges.push({ kind: "trade" });
  return badges;
}
