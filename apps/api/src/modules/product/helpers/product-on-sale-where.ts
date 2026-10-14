import { Prisma } from "@prisma/client";

/**
 * `discountOnly` filtresinin TEK kaynağı — `resolveSalePrice`'ın isOnSale
 * kuralının WHERE karşılığı: çizili fiyat satış fiyatından büyük VE indirim
 * penceresi şu an açık. Kampanyalar vitrin fiyatını düşürmediği için (bkz.
 * discount-pricing) isOnSale'i yalnız ürünün kendi indirimi belirler.
 *
 * Filtre sorguda uygulanır; sayfalama ve total ondan SONRA hesaplanır, böylece
 * sonuç sıralamadan bağımsızdır (sayfa-sonrası filtre total'i sıraya bağlıyordu).
 */
export function onSaleWhere(
  now: Date,
  priceField: Prisma.FieldRef<"Product", "Decimal">,
): Prisma.ProductWhereInput {
  return {
    AND: [
      { oldPrice: { not: null } },
      { oldPrice: { gt: priceField } },
      { OR: [{ saleStartDate: null }, { saleStartDate: { lte: now } }] },
      { OR: [{ saleEndDate: null }, { saleEndDate: { gte: now } }] },
    ],
  };
}
