import { SubscriptionStatus } from "@prisma/client";

/**
 * "Bir üyeliğin ödemesiz kalması" ne demek — TEK tanım.
 *
 * `status = past_due` yazmak yetmez: düşüşün kendi zaman damgası olmadan
 * "bu dönemde kaç üyelik ödemesiz kaldı" sorusu yanıtlanamaz. Elde yalnız
 * dönem SONUNDAKİ fotoğraf kalır — bir ay boyunca düşüp geri toparlanan
 * üyelikler hiç görünmez. `updatedAt` de kullanılamaz: düşüşten sonraki her
 * dokunuş (self-heal denemesi, kart güncellemesi, tier planı) onu kaydırır.
 *
 * DİKKAT — bugün hiçbir kod yolu `past_due` YAZMIYOR. Dayanıklı ödeme
 * niyetleri (`MembershipPaymentIntent`) o geçişin yerini aldı; mevcut
 * `past_due` satırları eski kayıtlardan ve seed'den geliyor. Yardımcı yine de
 * şimdi var olsun ki geçişi geri getiren ilk kod yolu ölçümü sessizce
 * kaybetmek yerine buradan geçmek zorunda kalsın — kaynak seviyesindeki
 * koruma (`membership-past-due.spec.ts`) bunu zorlar.
 *
 * @param at Düşüş anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function membershipPastDueData(at: Date = new Date()): {
  status: typeof SubscriptionStatus.past_due;
  pastDueAt: Date;
} {
  return { status: SubscriptionStatus.past_due, pastDueAt: at };
}
