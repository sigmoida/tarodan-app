/** @format */

import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";
import { isTlAmountRefused, parseTlAmount } from "@tarodan/shared";
import { saleDataToPayload } from "./sale-data";
import type { SaleData } from "./cards/DiscountCard";

/**
 * Platform ilan fiyat sınırları (admin: min_product_price / max_product_price).
 *
 * Sunucu tek yetkilidir; istemci aynı kuralı YALNIZ kullanıcı daha formdayken
 * görsün diye uygular. Kural sunucuyla birebir aynıdır:
 *  - Ayar boşsa kural yoktur (`null`).
 *  - Sınır GERİYE DÖNÜK İŞLEMEZ: kayıtlı fiyatıyla aynı kalan fiyat denetlenmez
 *    (sınırın altındaki eski ilan, fiyatına dokunmadan düzenlenebilir).
 *  - İndirimli fiyat da aynı alt sınıra tabidir.
 *  - Teklifte yalnız alt sınır vardır (`offerPriceFloor`).
 */
export interface PriceLimits {
  minPrice: number | null;
  maxPrice: number | null;
}

export const NO_PRICE_LIMITS: PriceLimits = { minPrice: null, maxPrice: null };

const asLimit = (raw: unknown): number | null => {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/** `GET /admin/settings/public` yanıtından sınırlar; anahtar yoksa/sayı değilse null. */
export function parsePriceLimits(raw: unknown): PriceLimits {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    minPrice: asLimit(source.min_product_price),
    maxPrice: asLimit(source.max_product_price),
  };
}

export interface PriceLimitViolation {
  type: "minimum" | "maximum";
  limit: number;
}

export function priceLimitViolation(
  price: number,
  limits: PriceLimits,
): PriceLimitViolation | null {
  if (limits.minPrice != null && price < limits.minPrice) {
    return { type: "minimum", limit: limits.minPrice };
  }
  if (limits.maxPrice != null && price > limits.maxPrice) {
    return { type: "maximum", limit: limits.maxPrice };
  }
  return null;
}

/** Aday fiyat, ilanın KAYITLI fiyatlarından biriyle aynı mı (kuruş hassasiyeti)? */
export function isStoredPrice(
  candidate: number,
  storedPrices: ReadonlyArray<number | null | undefined>,
): boolean {
  return storedPrices.some(
    (value) => value != null && Math.abs(value - candidate) < 0.005,
  );
}

/** Aday fiyat için ihlal; kayıtlı fiyatla aynıysa (değişmediyse) null. */
export function checkListingPrice(
  candidate: number,
  limits: PriceLimits,
  storedPrices: ReadonlyArray<number | null | undefined> = [],
): PriceLimitViolation | null {
  if (!Number.isFinite(candidate)) return null;
  if (isStoredPrice(candidate, storedPrices)) return null;
  return priceLimitViolation(candidate, limits);
}

/**
 * Teklif tutarının alt sınırı. `effectivePrice` ilanın güncel satış fiyatıdır
 * (indirim aktifse indirimli). Alt sınır varsa VE ilan fiyatı ona eşit ya da
 * üstündeyse taban alt sınırdır; ilan zaten sınırın altındaysa (eski ilan)
 * taban YOKTUR — aksi halde o ilan pazarlığa tamamen kapanırdı. Üst sınır
 * teklife uygulanmaz. Sunucudaki `offerPriceFloor` ile aynı kural.
 */
export function offerPriceFloor(
  minPrice: number | null,
  effectivePrice: number,
): number | null {
  return minPrice != null && effectivePrice >= minPrice ? minPrice : null;
}

/**
 * Fiyat sınırı iletileri. Tutar sunucu iletisiyle AYNI metinden
 * (`server.product.*`) gelir; web ve sunucu aynı cümleyi söyler.
 */
export const priceLimitMessages = (locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return {
    priceBelowMinimum: (minPrice: number) =>
      t("server.product.priceBelowMinimum", { minPrice }),
    priceAboveMaximum: (maxPrice: number) =>
      t("server.product.priceAboveMaximum", { maxPrice }),
    salePriceBelowMinimum: (minPrice: number) =>
      t("listing.salePriceBelowMinimum", { minPrice }),
    amountFormatRefused: t("validation.amountFormatRefused"),
  };
};

export type PriceLimitMessages = ReturnType<typeof priceLimitMessages>;

/**
 * The offer ceiling used for the "no offer possible" decision: the whole
 * amount just below the listing price. The web offer field (`OfferModal`) is
 * a text field without a `max` attribute; its schema refuses an amount at or
 * above the price.
 */
export function maxOfferAmount(effectivePrice: number): number {
  return Math.max(0, Math.round(effectivePrice) - 1);
}

/**
 * Hiçbir geçerli teklif yok mu? Taban, teklif alanının tavanını aşıyorsa (ör.
 * ilan tam alt sınırda: taban fiyata eşit, teklif ise fiyatın ALTINDA olmak
 * zorunda) teklif girişi gösterilmez.
 */
export function isOfferImpossible(
  floor: number | null,
  effectivePrice: number,
): boolean {
  return floor != null && floor > maxOfferAmount(effectivePrice);
}

/** Sınırlar + (düzenlemede) ilanın kayıtlı fiyatları. */
export interface ListingPriceRules {
  limits: PriceLimits;
  /** Düzenlemede ilanın kayıtlı fiyatları: bunlardan biri aynen kalırsa denetlenmez. */
  storedPrices?: ReadonlyArray<number | null | undefined>;
}

/**
 * Sınırlar sorgudan, kayıtlı fiyatlar ilan kaydından gelir — şema ikisinden de
 * önce kurulur; bu yüzden doğrulama ANINDA okunan getter (bkz.
 * `RequiredGroupSlugsSource`). Sınırlar yüklenemediyse `NO_PRICE_LIMITS`:
 * form engellenmez, sunucu yetkili kalır.
 */
export type PriceRulesSource = () => ListingPriceRules;

/** superRefine: "Fiyat" alanı alt/üst sınırı aşıyorsa alanda hata gösterir. */
export function priceLimitsRefine(
  getRules: PriceRulesSource,
  msg: PriceLimitMessages,
) {
  return (val: { price: string }, ctx: z.RefinementCtx) => {
    // Text that is not a price is reported by the field itself
    // (`baseListingFields`); there is no amount to hold against a limit.
    const parsed = parseTlAmount(val.price);
    if (parsed.status !== "ok") return;
    const { limits, storedPrices } = getRules();
    const violation = checkListingPrice(parsed.amount, limits, storedPrices);
    if (!violation) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["price"],
      message:
        violation.type === "minimum"
          ? msg.priceBelowMinimum(violation.limit)
          : msg.priceAboveMaximum(violation.limit),
    });
  };
}

/**
 * The discount section error that blocks the submit, or null. Its fields are
 * not form fields, so the schema does not see them; the screen and the submit
 * use this instead.
 *
 * Text that is not an amount comes first: `saleDataToPayload` would read it as
 * "no discount" and silently clear the sale. Then the price limits, checked
 * only for a discount that will apply (the same decision as
 * `saleDataToPayload`).
 */
export function saleDataError(
  saleData: SaleData,
  formPrice: number,
  rules: ListingPriceRules,
  msg: PriceLimitMessages,
): string | null {
  if (
    isTlAmountRefused(saleData.salePrice) ||
    isTlAmountRefused(saleData.originalPrice)
  ) {
    return msg.amountFormatRefused;
  }
  const { salePrice } = saleDataToPayload(saleData, formPrice);
  if (salePrice == null) return null;
  const violation = checkListingPrice(
    salePrice,
    rules.limits,
    rules.storedPrices,
  );
  if (!violation) return null;
  return violation.type === "minimum"
    ? msg.salePriceBelowMinimum(violation.limit)
    : msg.priceAboveMaximum(violation.limit);
}
