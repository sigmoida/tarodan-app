/**
 * Yeni ilanın indirim fiyatlaması.
 *
 * Fiyat modeli (A + oldPrice): `price` HER ZAMAN güncel satış fiyatıdır,
 * `oldPrice` ise indirim öncesi (çizili) fiyattır; indirim yoksa null'dır.
 * Güncelleme yolu (`product-update.service`) bu kuralı zaten uyguluyordu ama
 * oluşturma yolu indirimi hiç kabul etmiyordu: yeni ilan formunda indirim bölümü
 * bulunmadığı için satıcı ilanı indirimli açamıyor, açtıktan hemen sonra
 * düzenleme ekranına girmek zorunda kalıyordu.
 */

export interface CreateSalePricingInput {
  /** Formdaki "Fiyat" — indirim ÖNCESİ fiyat. */
  price: number;
  /** İndirim öncesi fiyat ayrıca girildiyse. */
  originalPrice?: number | null;
  salePrice?: number | null;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
}

export interface CreateSalePricing {
  price: number;
  oldPrice: number | null;
  saleStartDate: Date | null;
  saleEndDate: Date | null;
}

/** Geçerli bir tarih ya da null — bozuk girdi indirimi düşürmez. */
function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveCreateSalePricing(
  input: CreateSalePricingInput,
): CreateSalePricing {
  const sale = Number(input.salePrice ?? 0);
  // İndirim öncesi fiyat, girilen fiyattan küçük olamaz: aksi halde ürün
  // "indirimli" görünürken çizili fiyat daha düşük çıkardı.
  const original = Math.max(Number(input.originalPrice ?? 0), input.price);
  const hasSale = sale > 0 && sale < original;

  if (!hasSale) {
    return {
      price: input.price,
      oldPrice: null,
      saleStartDate: null,
      saleEndDate: null,
    };
  }

  return {
    price: sale,
    oldPrice: original,
    saleStartDate: dateOrNull(input.saleStartDate),
    saleEndDate: dateOrNull(input.saleEndDate),
  };
}
