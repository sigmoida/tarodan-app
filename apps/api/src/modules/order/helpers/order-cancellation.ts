import { CancellationActor, OrderStatus } from "@prisma/client";

/**
 * "Bir siparişi iptal etmek" ne demek — TEK tanım.
 *
 * `status = cancelled` yazmak yetmiyordu: iptalin kendi zaman damgası yoktu ve
 * dönemsel "iptal edilen sipariş" metriği siparişin OLUŞTUĞU tarihe bakmak
 * zorunda kalıyordu (mart'ta açılıp nisan'da iptal edilen sipariş mart'a
 * yazılıyordu). `updatedAt` de kullanılamaz — iptalden sonraki her dokunuş
 * (bildirim, fatura alanı, stok sentinel'ı) onu kaydırır.
 *
 * Aynı sebeple iptali KİMİN yaptığı da burada yazılır: admin "İptal & İade"
 * ekranı iptalleri alıcı / satıcı / Tarodan diye ayırır ve serbest metin
 * `cancelReason` bunu güvenle söyleyemez. Aktör ZORUNLU parametredir — yeni
 * bir iptal yolu onu unutamaz, derleyici durdurur.
 *
 * İptal yazan HER yol bu yardımcıyı kullanır; ikisi sessizce ayrışamaz.
 *
 * @param by İptali yapan taraf (bkz. `CancellationActor`).
 * @param at İptal anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function orderCancelledData(
  by: CancellationActor,
  at: Date = new Date(),
): {
  status: typeof OrderStatus.cancelled;
  cancelledAt: Date;
  cancelledBy: CancellationActor;
} {
  return { status: OrderStatus.cancelled, cancelledAt: at, cancelledBy: by };
}
