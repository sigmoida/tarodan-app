import { ProductStatus } from "@prisma/client";

/**
 * "Bir ilanın satılması" ne demek — TEK tanım.
 *
 * İlan hunisinin (oluşturuldu → yayına girdi → satıldı) son adımı ve "satışa
 * kadar geçen süre" ölçümünün ikinci ucu. `status = sold` yazmak yetmiyordu:
 * satışın kendi damgası yoktu ve dönemsel "satılan ilan" ancak `updatedAt`ten
 * okunabiliyordu — o da satıştan sonraki her dokunuşla (görüntülenme sayacı,
 * sıralama skoru, moderasyon alanı) kayıyor.
 *
 * @param at Satış anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function productSoldData(at: Date = new Date()): {
  status: typeof ProductStatus.sold;
  soldAt: Date;
} {
  return { status: ProductStatus.sold, soldAt: at };
}
