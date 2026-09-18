import { OfferStatus } from "@prisma/client";

/**
 * "Bir teklifi cevaplamak" ne demek — TEK tanım.
 *
 * Teklif cevap oranı ("satıcı kaç teklife dönüyor, ne kadar sürede") teklifin
 * kendi cevap damgası olmadan ölçülemezdi: `updatedAt` sonraki her dokunuşla
 * kayıyor, `status` ise "şu an ne" sorusunu yanıtlıyor — "bu dönemde cevap
 * verildi mi" sorusunu değil.
 *
 * Cevap = kabul, ret veya karşı teklifle kapanış. Süre dolması (`expired`) ve
 * teklifi verenin geri çekmesi (`cancelled`) cevap DEĞİLDİR: cevap oranının
 * paydasına girerler, payına değil.
 *
 * @param status Cevabın sonucu — `accepted` ya da `rejected`.
 * @param at Cevap anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function offerRespondedData<
  S extends typeof OfferStatus.accepted | typeof OfferStatus.rejected,
>(status: S, at: Date = new Date()): { status: S; respondedAt: Date } {
  return { status, respondedAt: at };
}

/**
 * Ödeme penceresi dolduğu için `payment_expired`a düşen teklifin yeniden
 * `accepted`a alınması. İKİNCİ bir cevap değildir — anlaşma zaten çok önce
 * yapıldı — bu yüzden `respondedAt` ilk cevabın anında kalır.
 *
 * Ayrı bir yardımcı, çünkü kaynak seviyesindeki koruma `status: accepted`
 * yazan her yolu yakalar; bu yol da adıyla kendini açıklamak zorunda.
 */
export function offerReacceptedData(): {
  status: typeof OfferStatus.accepted;
} {
  return { status: OfferStatus.accepted };
}
