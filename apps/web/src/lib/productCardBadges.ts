/** @format */

import {
  getProductDiscountPercent,
  isProductOutOfStock,
} from "@/lib/productPrice";
import type { Product } from "@/types/product";
import type { Translate } from "@/types/i18n";

/**
 * The one selection rule for the badge stack at the top left of a grid card's
 * image (`ProductCard` and the home `HomeProductCard` use it; the mobile card
 * mirrors it). The discount percent comes from `getProductDiscountPercent`.
 * The order is fixed: discount, boosted ("Öne Çıkan"), trade, campaign name;
 * the first `MAX_CARD_BADGES` that apply are shown.
 */
export const MAX_CARD_BADGES = 2;

export type ProductCardBadge =
  | { kind: "sale"; percent: number }
  | { kind: "boosted" }
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

/** The copy the badges need; build it with `productBadgeLabels(t)`. */
export interface ProductBadgeLabels {
  /** "indirim": read after the percent ("%38 indirim"). */
  discount: string;
  /** "Öne Çıkan": the visible boosted badge. */
  boosted: string;
  /**
   * "Satıcı bu ilanı ücretli olarak öne çıkardı": what a screen reader reads
   * for the boosted badge, and its tooltip (paid placement disclosure).
   */
  boostedHint: string;
  trade: string;
}

/**
 * The badge copy from the shared catalog, for server (`getTranslations`) and
 * client (`useTranslations`) cards alike. "Sponsorlu" (`product.sponsored`)
 * is the ads' text and never a listing badge.
 */
export function productBadgeLabels(t: Translate): ProductBadgeLabels {
  return {
    discount: t("product.discount"),
    boosted: t("product.boostedBadge"),
    boostedHint: t("product.boostedBadgeHint"),
    trade: t("faq.trade"),
  };
}

/**
 * The screen-reader text of the badges ("%38 indirim, Takas"): the visible
 * badges are `aria-hidden`, and the grid and list cards read this one text
 * inside their title link.
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
        case "boosted":
          return labels.boostedHint;
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
  if (p.isBoosted === true) badges.push({ kind: "boosted" });
  if (isProductTradeBadgeVisible(p)) badges.push({ kind: "trade" });
  // Bedel kampanyaları fiyatı DEĞİŞTİRMEZ (komisyonu/kargoyu indirir), bu
  // yüzden vitrinde ancak rozetle görünürler; kartta yalnız ilk kampanya.
  const campaign = p.feeCampaigns?.find(Boolean);
  if (campaign) badges.push({ kind: "campaign", label: campaign });
  return badges.slice(0, max);
}
