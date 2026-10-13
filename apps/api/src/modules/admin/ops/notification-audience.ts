import type { Prisma } from "@prisma/client";
import { NotificationType } from "../../notification/dto/notification.dto";
import { categoryForType } from "../../notification/helpers/notification-preferences";

/** Kampanya (PROMOTION) kategorisinin `notificationSettings` anahtarı (tek kaynak: categoryForType). */
const PROMOTION_PREFERENCE_KEY =
  categoryForType(NotificationType.PROMOTION) ?? "marketingEmails";

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
 * `PROMOTION_PREFERENCE_WHERE` ile süzülür.
 */
export const MARKETING_CONSENT_WHERE = {
  acceptsMarketingEmails: true,
} as const satisfies Prisma.UserWhereInput;

/**
 * Pazarlama PUSH + ZİL kapısı: kullanıcının kampanya (PROMOTION) bildirim
 * tercihi. Gönderim yolundaki karar (`shouldDeliver`) ile aynı anahtarı okur
 * (`categoryForType(PROMOTION)` → `marketingEmails`) ve aynı varsayılanı
 * uygular: kayıtlı tercihi olmayan kullanıcı `DEFAULT_NOTIFICATION_SETTINGS`
 * değerini alır. Varsayılan kapalı olduğundan yalnız açıkça `true` yazmış
 * kullanıcı eşleşir (JSON'u boş / anahtarı eksik kullanıcı eşleşmez).
 * Varsayılan açık yapılırsa bu filtre de değişmeli; spec bunu zorlar.
 */
export const PROMOTION_PREFERENCE_WHERE = {
  notificationSettings: {
    path: [PROMOTION_PREFERENCE_KEY],
    equals: true,
  },
} as const satisfies Prisma.UserWhereInput;
