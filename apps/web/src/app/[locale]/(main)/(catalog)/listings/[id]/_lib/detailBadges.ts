/** @format */

import { isProductTradeBadgeVisible } from "@/lib/productCardBadges";
import { getProductDiscountPercent } from "@/lib/productPrice";
import type { Listing } from "./types";

/**
 * Detay badge satırındaki rozetler — sıra: %İndirim → Takas. "Satıldı" burada
 * YOK: hemen altındaki durum uyarısı (Alert) zaten söylüyor.
 */
export type DetailBadge = { kind: "sale"; percent: number } | { kind: "trade" };

/**
 * Başlık + fiyat bloğunun altındaki badge satırı. Kural kartlarla aynıdır:
 * yüzde `getProductDiscountPercent` (yalnız yuvarlanmış yüzde ≥ 1 iken rozet),
 * takas `isProductTradeBadgeVisible` (takas açık VE ilan satın alınabilir —
 * sold / reserved / stok 0 değil). Sahip de görür.
 */
export function getDetailBadges(listing: Listing): DetailBadge[] {
  const badges: DetailBadge[] = [];
  const percent = getProductDiscountPercent(listing);
  if (percent >= 1) badges.push({ kind: "sale", percent });
  if (isProductTradeBadgeVisible(listing)) badges.push({ kind: "trade" });
  return badges;
}
