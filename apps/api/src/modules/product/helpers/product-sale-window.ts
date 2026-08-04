/**
 * İndirim penceresinin TEK kaynağı — ürünün o anda geçerli satış fiyatı.
 *
 * A + oldPrice modelinde `price` her zaman güncel satış fiyatıdır ve satıcı
 * indirimi kaydettiği anda indirimli değere yazılır (`product-update.service`).
 * `saleStartDate` / `saleEndDate` ise yalnız GÖSTERİMİ etkiliyordu: pencere
 * kapandığında çizili fiyat ve indirim rozeti kayboluyor, ama ürün indirimli
 * fiyattan satılmaya DEVAM ediyordu — pencere açılmadan önce de indirim çoktan
 * geçerliydi. Fiyatı geri alan bir cron yok; tek dönüş yolu satıcının ilanı
 * elle güncellemesiydi.
 *
 * Çözüm zamanlı bir iş değil, OKUMA anında uygulanan bir kural: pencere
 * dışındaysa satış fiyatı indirim öncesi fiyattır. Böylece vitrin, sepet,
 * checkout quote'u ve tahsilat aynı sayıyı görür.
 */

export interface ProductSaleWindow {
  /** Güncel satış fiyatı (Prisma Decimal / string / number). */
  price: unknown;
  /** İndirim öncesi (çizili) fiyat; indirim yoksa null. */
  oldPrice?: unknown;
  saleStartDate?: Date | string | null;
  saleEndDate?: Date | string | null;
}

export interface ResolvedSalePrice {
  /** O anda geçerli satış fiyatı — tahsilat bunun üzerinden yapılır. */
  price: number;
  /** Çizili gösterilecek fiyat; indirim geçerli değilse null. */
  oldPrice: number | null;
  isOnSale: boolean;
}

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Geçersiz tarih pencereyi kapatmaz — sınır yokmuş gibi davranılır. */
const dateOrNull = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function resolveSalePrice(
  product: ProductSaleWindow,
  now: Date = new Date(),
): ResolvedSalePrice {
  const price = num(product.price);
  const previous = product.oldPrice != null ? num(product.oldPrice) : null;

  if (previous == null) return { price, oldPrice: null, isOnSale: false };

  const start = dateOrNull(product.saleStartDate);
  const end = dateOrNull(product.saleEndDate);
  const withinWindow = (!start || now >= start) && (!end || now <= end);

  // Pencere dışında ürün indirim ÖNCESİ fiyatından satılır.
  if (!withinWindow)
    return { price: previous, oldPrice: null, isOnSale: false };

  // Bozuk veri koruması: çizili fiyat satış fiyatından küçükse indirim yoktur.
  return previous > price
    ? { price, oldPrice: previous, isOnSale: true }
    : { price, oldPrice: null, isOnSale: false };
}
