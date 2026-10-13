import type { Prisma } from "@prisma/client";
import { NotificationType } from "../../notification/dto/notification.dto";
import { categoryForType } from "../../notification/helpers/notification-preferences";

/** Kampanya (PROMOTION) kategorisinin `notificationSettings` anahtarı (tek kaynak: categoryForType). */
const PROMOTION_PREFERENCE_KEY =
  categoryForType(NotificationType.PROMOTION) ?? "marketingEmails";

/** `acceptsPromotion` kararı için gereken kullanıcı alanları. */
export const PROMOTION_PREFERENCE_SELECT = {
  id: true,
  notificationSettings: true,
  acceptsMarketingEmails: true,
} as const satisfies Prisma.UserSelect;

/**
 * Toplu bildirim kitlesinin `all` / `segment` karşılığı olan kullanıcı filtresi.
 * Anında gönderim, zamanlanmış gönderim ve alıcı sayacı aynı kuralı kullanır —
 * üç yerde ayrı yazılınca sayaç gerçekte gidenden sapıyordu.
 *
 * `user_ids` hedefi filtre değil açık kimlik listesidir; çağıran kendisi çözer.
 */
export function audienceUserWhere(
  targetType: "all" | "segment",
  segmentCriteria?: Record<string, any> | null,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { isBanned: false };
  if (targetType !== "segment" || !segmentCriteria) return where;
  if (segmentCriteria.isSeller !== undefined) {
    where.isSeller = segmentCriteria.isSeller;
  }
  if (segmentCriteria.membershipTier) {
    where.membership = {
      tier: { type: segmentCriteria.membershipTier as any },
    };
  }
  return where;
}

/**
 * Pazarlama E-POSTASI kapısı (Apple 4.5.4, İYS): pazarlama türündeki duyurunun
 * e-postası yalnız bu filtreyi geçen kullanıcılara gider. İznin tek kaynağı
 * `User.acceptsMarketingEmails` kolonudur (profil düğmesi, kayıt onayı ve
 * bülten çıkışı onu yazar). Push ve zil bu kapıya bağlı DEĞİLDİR — onlar
 * `PROMOTION_CANDIDATE_WHERE` + `acceptsPromotion` ile süzülür.
 */
export const MARKETING_CONSENT_WHERE = {
  acceptsMarketingEmails: true,
} as const satisfies Prisma.UserWhereInput;

/**
 * Pazarlama PUSH + ZİL kapısının veritabanı ön süzgeci (aday kümesi).
 * Kesin karar `acceptsPromotion` ile verilir (kampanya JSON anahtarı `true`,
 * ya da anahtar yokken e-posta izni kolonu `true`; anahtar açıkça `false`
 * ise gitmez) — JSON'da "anahtar yok" Prisma süzgecinde güvenle ifade
 * edilemediğinden aday kümesi geniş tutulur, eleme kodda yapılır. Gönderim
 * anındaki push worker aynı fonksiyonu kullandığından iki yer ayrışmaz.
 */
export const PROMOTION_CANDIDATE_WHERE = {
  OR: [
    { acceptsMarketingEmails: true },
    {
      notificationSettings: { path: [PROMOTION_PREFERENCE_KEY], equals: true },
    },
  ],
} as const satisfies Prisma.UserWhereInput;
