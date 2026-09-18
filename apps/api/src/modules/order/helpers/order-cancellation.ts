import { OrderStatus } from "@prisma/client";

/**
 * "Bir siparişi iptal etmek" ne demek — TEK tanım.
 *
 * `status = cancelled` yazmak yetmiyordu: iptalin kendi zaman damgası yoktu ve
 * dönemsel "iptal edilen sipariş" metriği siparişin OLUŞTUĞU tarihe bakmak
 * zorunda kalıyordu (mart'ta açılıp nisan'da iptal edilen sipariş mart'a
 * yazılıyordu). `updatedAt` de kullanılamaz — iptalden sonraki her dokunuş
 * (bildirim, fatura alanı, stok sentinel'ı) onu kaydırır.
 *
 * İptal yazan HER yol bu yardımcıyı kullanır; ikisi sessizce ayrışamaz.
 *
 * @param at İptal anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function orderCancelledData(at: Date = new Date()): {
  status: typeof OrderStatus.cancelled;
  cancelledAt: Date;
} {
  return { status: OrderStatus.cancelled, cancelledAt: at };
}
