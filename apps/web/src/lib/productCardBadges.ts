/** @format */

import { getProductDiscountPercent } from "@/lib/productPrice";
import type { Product } from "@/types/product";

/**
 * Grid kartının görsel sol-üst badge yığınının TEK seçim kuralı (`ProductCard`
 * ve ana sayfadaki `HomeProductCard` aynısını kullanır; mobil kartla birebir).
 * İndirim yüzdesi `getProductDiscountPercent`'ten gelir. Sıra sabittir: %İndirim → Sponsorlu → Takas → Kampanya adı; uygun olanların
 * ilk `MAX_CARD_BADGES` tanesi gösterilir.
 */
export const MAX_CARD_BADGES = 2;

export type ProductCardBadge =
  | { kind: "sale"; percent: number }
  | { kind: "sponsored" }
  | { kind: "trade" }
  | { kind: "campaign"; label: string };

/**
 * `tradeAvailable` API'nin türettiği efektif değerdir (satıcının üyeliği
 * takas hakkını kaybettiyse false). Yoksa eski alanlara düşülür.
 */
export function isProductTradeEnabled(
  p: Pick<Product, "tradeAvailable" | "trade_available" | "isTradeEnabled">,
): boolean {
  return Boolean(p.tradeAvailable ?? (p.trade_available || p.isTradeEnabled));
}

export function selectProductCardBadges(
  p: Product,
  max: number = MAX_CARD_BADGES,
): ProductCardBadge[] {
  const badges: ProductCardBadge[] = [];
  // Yüzde 1'in altındaysa (ör. %0 / hatalı fiyat) indirim rozeti hiç yok.
  const percent = getProductDiscountPercent(p);
  if (percent >= 1) badges.push({ kind: "sale", percent });
  if (p.isBoosted === true) badges.push({ kind: "sponsored" });
  if (isProductTradeEnabled(p)) badges.push({ kind: "trade" });
  // Bedel kampanyaları fiyatı DEĞİŞTİRMEZ (komisyonu/kargoyu indirir), bu
  // yüzden vitrinde ancak rozetle görünürler; kartta yalnız ilk kampanya.
  const campaign = p.feeCampaigns?.find(Boolean);
  if (campaign) badges.push({ kind: "campaign", label: campaign });
  return badges.slice(0, max);
}
