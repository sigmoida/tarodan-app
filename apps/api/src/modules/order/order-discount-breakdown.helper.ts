import { DiscountFundedBy } from "@prisma/client";
import type { ResolvedUnitPrice } from "../discount/product-price-resolver.service";

/**
 * Bir sipariş satırının indirim dökümü — üç checkout yolunun TEK kaynağı.
 *
 * İki indirim katmanı BİRBİRİNDEN AYRI tutulur, çünkü maliyetlerini farklı
 * taraflar üstlenir:
 *
 *  - `saleDiscount`  : satıcının kendi fiyat indirimi (liste → satış fiyatı).
 *                      Her zaman satıcıya aittir; platform payı yoktur.
 *  - `campaignDiscount`: otomatik kampanya. Maliyeti kampanyanın `fundedBy`
 *                      alanına göre platform, satıcı ya da ikisi paylaşır.
 *
 * Eskiden ikisi tek bir `productDiscount` içinde toplanıyor ve
 * `platformFundedDiscount` yalnız KUPONDAN hesaplanıyordu: platform-fonlu bir
 * kampanyanın maliyeti sessizce satıcıya kalıyor, shared kampanyanın oranı
 * tamamen kayboluyordu. Uygulanan kampanyanın kimliği de siparişte
 * durmadığı için finansal mutabakat ve iade dağıtımı yapılamıyordu.
 */

export interface OrderDiscountInput {
  /** Fiyat çözümleyicinin bu ürün için verdiği sonuç. */
  resolved: Pick<
    ResolvedUnitPrice,
    "originalUnitPrice" | "saleUnitPrice" | "unitPrice" | "campaign"
  >;
  quantity: number;
  /** Bu satıra düşen kupon indirimi (allocateCoupon payı). */
  couponDiscount?: number;
  /** Kuponun platform payı [0,1]. */
  couponPlatformFundedShare?: number;
}

export interface OrderDiscountBreakdown {
  /** Satıcının kendi fiyat indirimi — satıcı üstlenir. */
  saleDiscount: number;
  /** Otomatik kampanya indirimi (adet dahil). */
  campaignDiscount: number;
  /** Uygulanan kampanyanın kimliği — mutabakat ve iade dağıtımı için. */
  campaignId: string | null;
  campaignFundedBy: DiscountFundedBy | null;
  campaignPlatformFundedShare: number;
  couponDiscount: number;
  couponPlatformFundedShare: number;
  /** Liste fiyatına göre TOPLAM indirim → `Order.discountAmount`. */
  totalDiscount: number;
  /**
   * Kampanya ve kuponun PLATFORM tarafından üstlenilen kısmı →
   * `Order.platformFundedDiscount`. Escrow bunu satıcı hak edişine geri ekler.
   */
  platformFundedDiscount: number;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function buildOrderDiscountBreakdown(
  input: OrderDiscountInput,
): OrderDiscountBreakdown {
  const { resolved } = input;
  const quantity = input.quantity > 0 ? input.quantity : 1;
  const couponDiscount = Math.max(0, input.couponDiscount ?? 0);
  const couponPlatformFundedShare = clampShare(
    input.couponPlatformFundedShare ?? 0,
  );

  const saleDiscount = round2(
    Math.max(0, resolved.originalUnitPrice - resolved.saleUnitPrice) * quantity,
  );
  // Kampanya BİRİM başına iner; satır tutarı adetle çarpılır.
  const campaignDiscount = round2(
    Math.max(0, resolved.campaign?.discountPerUnit ?? 0) * quantity,
  );
  const campaignPlatformFundedShare = clampShare(
    resolved.campaign?.platformFundedShare ?? 0,
  );

  return {
    saleDiscount,
    campaignDiscount,
    campaignId: resolved.campaign?.discountId ?? null,
    campaignFundedBy: resolved.campaign?.fundedBy ?? null,
    campaignPlatformFundedShare,
    couponDiscount: round2(couponDiscount),
    couponPlatformFundedShare,
    totalDiscount: round2(saleDiscount + campaignDiscount + couponDiscount),
    platformFundedDiscount: round2(
      campaignDiscount * campaignPlatformFundedShare +
        couponDiscount * couponPlatformFundedShare,
    ),
  };
}

/** Bozuk oran (negatif ya da 1'den büyük) güvenli aralığa çekilir. */
function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0;
  return Math.min(1, Math.max(0, share));
}
