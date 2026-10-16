/** @format */

import {
  getProductDiscountPercent,
  isProductOutOfStock,
} from "@/lib/productPrice";
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

/**
 * Takas rozetinin TEK koşulu (kart grid yığını, liste ikonu + erişilebilir ad ve
 * ilan detayı aynısını kullanır): takas açık VE ilan satın alınabilir — aktif,
 * rezerve/satılmış değil, stok > 0. Yetki/niyet bayrağı için `isProductTradeEnabled`.
 */
export function isProductTradeBadgeVisible(
  p: Pick<Product, "tradeAvailable" | "trade_available" | "isTradeEnabled"> & {
    status?: string | null;
    availableQuantity?: number | null;
    quantity?: number | null;
  },
): boolean {
  return (
    isProductTradeEnabled(p) &&
    !isProductOutOfStock({
      status: p.status,
      availableQuantity: p.availableQuantity ?? p.quantity,
    })
  );
}

export interface ProductBadgeLabels {
  /** "indirim" — yüzdenin yanındaki erişilebilir ad ("%38 indirim"). */
  discount: string;
  sponsored: string;
  trade: string;
}

/**
 * Rozetlerin ekran okuyucu metni ("%38 indirim, Takas"): rozetler görsel olarak
 * `aria-hidden`'dır; grid ve liste kartı AYNI biçimde bunu okutur.
 */
export function describeProductBadges(
  badges: ProductCardBadge[],
  labels: ProductBadgeLabels,
): string {
  return badges
    .map((badge) => {
      switch (badge.kind) {
        case "sale":
          return `%${badge.percent} ${labels.discount}`;
        case "sponsored":
          return labels.sponsored;
        case "trade":
          return labels.trade;
        case "campaign":
          return badge.label;
      }
    })
    .join(", ");
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
  if (isProductTradeBadgeVisible(p)) badges.push({ kind: "trade" });
  // Bedel kampanyaları fiyatı DEĞİŞTİRMEZ (komisyonu/kargoyu indirir), bu
  // yüzden vitrinde ancak rozetle görünürler; kartta yalnız ilk kampanya.
  const campaign = p.feeCampaigns?.find(Boolean);
  if (campaign) badges.push({ kind: "campaign", label: campaign });
  return badges.slice(0, max);
}
