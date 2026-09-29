import { Prisma } from "@prisma/client";

/**
 * Teklif siparişinin `financialSnapshot.offer` bölümü: kabul anındaki ilan
 * fiyatı ve pazarlık tutarı. Yazan `buildOfferFinancialSnapshot`, okuyan bu
 * dosya — anahtar ikisinin ortak tek tanımıdır.
 *
 * Bu bölüm sonradan eklendi; daha önce kabul edilmiş tekliflerde yoktur ve
 * ekran o zaman ürünün GÜNCEL fiyatına düşer (yaklaşık olduğunu işaretleyerek).
 */
export const OFFER_SNAPSHOT_KEY = "offer";

export function readOfferListingUnitPrice(
  financialSnapshot: unknown,
): number | null {
  if (!financialSnapshot || typeof financialSnapshot !== "object") return null;
  const section = (financialSnapshot as Record<string, unknown>)[
    OFFER_SNAPSHOT_KEY
  ];
  if (!section || typeof section !== "object") return null;
  const value = (section as Record<string, unknown>).listingUnitPrice;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface OfferPriceComparison {
  listingPrice: number | null;
  /** Teklif anı fiyatı saklanmamış; güncel ilan fiyatı kullanıldı. */
  approximate: boolean;
  /** İlan fiyatı − teklif: pozitif = ilanın altında pazarlık. */
  difference: number | null;
}

export function compareOfferToListing(params: {
  financialSnapshot: unknown;
  currentListingPrice: number | null;
  offerAmount: number;
}): OfferPriceComparison {
  const frozen = readOfferListingUnitPrice(params.financialSnapshot);
  const listingPrice = frozen ?? params.currentListingPrice;
  if (listingPrice === null) {
    return { listingPrice: null, approximate: false, difference: null };
  }
  return {
    listingPrice,
    approximate: frozen === null,
    difference: new Prisma.Decimal(listingPrice)
      .minus(params.offerAmount)
      .toNumber(),
  };
}
