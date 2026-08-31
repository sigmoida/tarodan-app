/** @format */

import type { SaleData } from "./cards/DiscountCard";

/**
 * İndirim bölümünün form durumu ile API payload'ı arasındaki dönüşüm.
 *
 * İki form da aynı kuralı kullanır (A + oldPrice): formdaki "Fiyat" indirim
 * ÖNCESİ fiyattır, indirim bölümündeki "indirimli fiyat" ondan küçükse indirim
 * uygulanır. Kural iki yerde ayrı yazıldığında yeni ilan ile düzenleme aynı
 * girdide farklı sonuç üretebiliyordu.
 */

export const createEmptySaleData = (): SaleData => ({
  originalPrice: "",
  salePrice: "",
  saleStartDate: new Date().toISOString().split("T")[0],
  saleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
});

export interface SalePayload {
  originalPrice: number | null;
  salePrice: number | null;
  saleStartDate: string | null;
  saleEndDate: string | null;
}

/**
 * @param formPrice Formdaki "Fiyat" (indirim öncesi).
 * @returns İndirim yoksa tüm alanlar null — sunucu böylece varsa eski indirimi temizler.
 */
export function saleDataToPayload(
  saleData: SaleData,
  formPrice: number,
): SalePayload {
  const original = saleData.originalPrice
    ? Number(saleData.originalPrice)
    : formPrice;
  const sale = saleData.salePrice ? Number(saleData.salePrice) : 0;
  // İndirim öncesi fiyat girilen fiyattan küçük olamaz; aksi halde ürün
  // "indirimli" görünürken çizili fiyat daha düşük çıkardı.
  const effectiveOriginal = Math.max(original, formPrice);
  const hasSale = sale > 0 && effectiveOriginal > sale && sale !== formPrice;

  if (!hasSale) {
    return {
      originalPrice: null,
      salePrice: null,
      saleStartDate: null,
      saleEndDate: null,
    };
  }

  const asIso = (day: string): string | null =>
    day ? new Date(day).toISOString() : null;

  return {
    originalPrice: effectiveOriginal,
    salePrice: sale,
    saleStartDate: asIso(saleData.saleStartDate),
    saleEndDate: asIso(saleData.saleEndDate),
  };
}
