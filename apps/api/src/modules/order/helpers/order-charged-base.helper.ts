/**
 * Siparişin ÜRÜN TABANI — alıcıdan ürün için GERÇEKTEN tahsil edilen tutar.
 *
 * `Order.subtotal` bu tutardır. Komisyon, kargo kararı, vergiler, alıcı toplamı
 * (`buyerTotalOf`) ve satıcının hak edişi (`sellerNetAmountOf`) hep bu tabandan
 * türer — yani siparişin bütün parası tek sayıya bağlıdır.
 *
 * Eskiden `subtotal` kolonuna indirim ÖNCESİ liste fiyatı (`oldPrice × adet`)
 * yazılıyordu: `unitPrice` indirimli, `totalAmount` indirimli tabandan,
 * `subtotal` ise liste fiyatındandı. Aynı sipariş için admin ekranı "Alıcı
 * toplam ₺945,60" gösterirken alıcıdan ₺679,92 tahsil edilmişti; satıcı neti de
 * gerçek escrow hold'undan indirim kadar yüksek görünüyordu. Platform satışı
 * e-Arşiv faturası da kalemlerini bu kolondan kurduğu için indirimli satışta
 * tahsil edilenden fazla tutarla kesiliyordu.
 *
 * Liste fiyatı kaybolmaz; zaten üç yerde duruyor: `Order.discountAmount`,
 * `Order.discountBreakdown.originalPrice` ve
 * `Order.financialSnapshot.pricing.originalUnitPrice`.
 */

export interface ChargedProductBaseInput {
  /** Sipariş anındaki indirimli birim fiyat (kampanya uygulanmış hali). */
  unitPrice: number;
  /** Adet — verilmezse 1. */
  quantity?: number | null;
  /** Bu satıra düşen kupon indirimi. */
  couponDiscount?: number | null;
  /** Adet koşullu satıcı kampanyasının (bogo/bulk_quantity) satır indirimi. */
  quantityDiscount?: number | null;
}

const num = (value: number | null | undefined): number =>
  Number.isFinite(value) ? (value as number) : 0;

export function chargedProductBaseOf(input: ChargedProductBaseInput): number {
  const quantity = num(input.quantity ?? 1);
  const line =
    num(input.unitPrice) * quantity -
    num(input.quantityDiscount) -
    num(input.couponDiscount);
  // İndirimler bedeli aşarsa taban 0'dır — negatif tahsilat yazılamaz. Yuvarlama,
  // ham çarpımın kayan nokta artığını (0.1 × 3) kuruşa toplar.
  return Math.max(0, Math.round((line + Number.EPSILON) * 100) / 100);
}

/** Okuma tarafı: `subtotal` kolonu yazılmamış olabilecek KAYITLI sipariş. */
export interface StoredOrderBaseInput {
  subtotal?: unknown;
  totalAmount?: unknown;
  buyerShippingAmount?: unknown;
  /** Taraf bölüşümünden önceki kayıtlarda alıcı kargosu yalnız burada. */
  shippingCost?: unknown;
  buyerFeeAmount?: unknown;
  taxAmount?: unknown;
  buyerServiceTaxAmount?: unknown;
}

/** Prisma Decimal / string / number — hepsi sayıya. */
const decimal = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * KAYITLI siparişin ürün tabanı — okuyan her ekranın tek kaynağı.
 *
 * `subtotal` yazılıysa odur. Yazılmamış eski kayıtlarda alıcı toplamının
 * TANIMI tersten okunur (`buyerTotalOf`): toplamdan alıcı kalemleri düşülür.
 * Eskiden bu durumda ekranlar ham `totalAmount`'a düşüyordu — yani "ürün
 * bedeli" satırında kargo ve komisyon dahil tahsilatın tamamı görünüyordu.
 */
export function storedProductBaseOf(order: StoredOrderBaseInput): number {
  if (order.subtotal != null) return decimal(order.subtotal);

  const base =
    decimal(order.totalAmount) -
    Math.max(decimal(order.buyerShippingAmount), decimal(order.shippingCost)) -
    decimal(order.buyerFeeAmount) -
    decimal(order.taxAmount) -
    decimal(order.buyerServiceTaxAmount);

  return Math.max(0, Math.round((base + Number.EPSILON) * 100) / 100);
}
