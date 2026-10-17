import type { Prisma } from "@prisma/client";

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
 * Pazarlama izni kapısı (Apple 4.5.4, İYS): pazarlama türündeki duyuru —
 * push, zil satırı ve e-posta — yalnız bu filtreyi geçen kullanıcılara gider.
 * İznin tek kaynağı `User.acceptsMarketingEmails` kolonudur (profil düğmesi,
 * kayıt onayı ve bülten çıkışı onu yazar). Sayaç da aynı filtreyi kullanır.
 */
export const MARKETING_CONSENT_WHERE = {
  acceptsMarketingEmails: true,
} as const satisfies Prisma.UserWhereInput;
