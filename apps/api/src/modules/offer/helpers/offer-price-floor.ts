import { BadRequestException } from "@nestjs/common";
import type { ProductPriceLimits } from "../../product/helpers/product-price-limits";
import { i18nMessage } from "../../i18n";

/**
 * Teklif tutarının platform alt sınırı (`min_product_price`).
 *
 * Teklif/karşı teklif de ilan fiyatı gibi sınırın altına inemez; üst sınır
 * teklife UYGULANMAZ (tavan zaten ilanın güncel fiyatıdır). Ayar boşsa kural
 * yoktur (null).
 *
 * Kural: `p` ilanın güncel satış fiyatı (indirim aktifse indirimli, değilse
 * normal) olsun. Alt sınır varsa VE `p >= alt sınır` ise teklif `>= alt sınır`
 * olmalıdır. `p < alt sınır` ise (sınırın altında kalmış, geriye dönük
 * işlemeyen eski ilan) taban YOKTUR ve teklif kuralları eskisi gibi kalır —
 * aksi halde bu ilanlar pazarlığa tamamen kapanırdı. Alıcı teklifi,
 * satıcı karşı teklifi ve alıcı karşı teklifi AYNI kuraldan geçer.
 */
export function offerPriceFloor(
  minPrice: number | null,
  effectivePrice: number,
): number | null {
  return minPrice != null && effectivePrice >= minPrice ? minPrice : null;
}

/** Tutar tabanın altındaysa kullanıcıya dönecek 400'ü atar. */
export function assertOfferAmountAboveFloor(
  amount: number,
  limits: ProductPriceLimits,
  effectivePrice: number,
): void {
  const floor = offerPriceFloor(limits.minPrice, effectivePrice);
  if (floor != null && amount < floor) {
    throw new BadRequestException(
      i18nMessage("server.offer.amountBelowMinimum", { minPrice: floor }),
    );
  }
}
