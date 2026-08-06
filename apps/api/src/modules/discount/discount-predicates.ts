import { Prisma } from "@prisma/client";

/**
 * "Otomatik kampanya" nedir? — tek tanım.
 *
 * Otomatik kampanya, alıcının KOD GİRMEDEN yararlandığı indirimdir: vitrinde
 * fiyata yansır, sepette kendiliğinden uygulanır.
 *
 * `code === null` tek başına bu tanımı VERMEZ. Toplu üretilen voucher'ların
 * şablon kaydında da paylaşımlı bir `code` yoktur — kodlar `discount_codes`
 * altında tek tek durur ve şablon `isBatch = true` ile işaretlenir. Şablonu
 * yalnız `code: null` ile aramak, hediye kodlarının indirimini KOD GİRMEDEN
 * herkese uygulamak demekti: kullanım limiti, tek-kullanım kontrolü ve
 * voucher redemption'ın tamamı devre dışı kalıyordu.
 *
 * Bu yüzden koşul tek yerde durur ve fiyat çözümleyici, "İndirimdekiler"
 * filtresi ve ana sayfa kampanya listesi aynı ifadeyi kullanır.
 *
 * NOT: ideali `code === null` çıkarımı yerine modelde açık bir alan/tip
 * tutmaktır (ör. `kind: automatic | coupon | voucher_batch`); bu bir migration
 * gerektirdiği için ayrı bir işe bırakıldı. O gün geldiğinde değiştirilecek
 * TEK yer burasıdır.
 */
export const AUTOMATIC_CAMPAIGN_WHERE = {
  code: null,
  isBatch: false,
} satisfies Prisma.DiscountWhereInput;

/** Yürürlükteki otomatik kampanyalar — aktif ve tarih penceresi açık. */
export function activeAutomaticCampaignWhere(
  now: Date,
): Prisma.DiscountWhereInput {
  return {
    ...AUTOMATIC_CAMPAIGN_WHERE,
    isActive: true,
    startDate: { lte: now },
    endDate: { gte: now },
  };
}
