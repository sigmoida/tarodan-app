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
