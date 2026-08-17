import { calculatePackageDesi } from "../../shipping/helpers/shipping-tariff.helper";

/**
 * Bir takas kolisinin desisi.
 *
 * Takas kolileri taşıyıcıya uzun süre sabit `1 desi` olarak bildirildi: sipariş
 * ve iade akışları gerçek desiyi gönderirken takasın beş çağrı yerinin hiçbiri
 * `desi` parametresini geçmiyordu. Satıcı ilanda Küçük/Orta/Büyük seçiyor ve
 * `productShippingTierData` bunu `Product.shippingDesi`'ye türetiyor — veri
 * zaten vardı, yalnız payload'a bağlanmamıştı.
 *
 * Toplama için YENİ formül yazılmıyor: `calculatePackageDesi`, takas
 * fiyatlamasının tarafın kargo bedelini hesaplarken kullandığı fonksiyonun ta
 * kendisi (`trade-pricing.helper.ts`). Aynı fonksiyonu kullanmak, kullanıcıdan
 * TAHSİL EDİLEN desi ile taşıyıcıya BİLDİRİLEN desiyi tek kaynağa bağlar; iki
 * ayrı hesap zamanla kaçınılmaz olarak ayrışırdı.
 */

/** Takasın iki tarafı — `TradeItem.side` bu iki değeri alır. */
export type TradeItemSide = "initiator" | "receiver";

export interface TradeDesiItem {
  side: string;
  quantity: number;
  product: { shippingDesi: number } | null;
}

/**
 * Verilen tarafın ÜRÜNLERİNİN birleşik desisi.
 *
 * Dikkat: hangi tarafın ürünlerinin sorulacağı koliye göre değişir ve alıcıyla
 * aynı şey DEĞİLDİR. Depoya girişte taraf kendi ürününü yollar; depodan çıkışta
 * kullanıcıya KARŞI tarafın ürünü gider; redde ise kendi ürünü geri döner.
 * Bu yüzden taraf parametre olarak alınır, alıcıdan türetilmez.
 *
 * Ürünü çözülemeyen bir takasta 1'e düşer — eski davranış — çünkü desi
 * bilinmiyor diye takas kargosunu bloke etmek orantısız olur.
 */
export function tradeSideBillableDesi(
  items: TradeDesiItem[],
  side: TradeItemSide,
): number {
  const lines = items
    .filter((item) => item.side === side && item.product)
    .map((item) => ({
      shippingDesi: item.product!.shippingDesi,
      quantity: item.quantity,
    }));
  if (lines.length === 0) return 1;
  return Math.max(1, calculatePackageDesi(lines));
}

/** Takas kolisi seçimleri için Prisma `select` parçası — tek kaynak. */
export const TRADE_DESI_ITEM_SELECT = {
  side: true,
  quantity: true,
  product: { select: { shippingDesi: true } },
} as const;
