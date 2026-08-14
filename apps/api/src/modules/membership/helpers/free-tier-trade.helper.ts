import { MembershipTierType } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { isTest } from "../../../config/environment";

/**
 * Ücretsiz katmanın `canTrade` bayrağı — takas yetkisi türetmesinin tek dış
 * girdisi (bkz. `canTradeFromMembership` / `tradeCapableSellerWhere`).
 *
 * Tek satırlık, nadiren değişen bir değer; ürün listeleme gibi sıcak yollarda
 * her istekte sorgulamamak için kısa süre cache'lenir. Aynı kalıp RolesGuard'ın
 * izin matrisi cache'inde de kullanılıyor.
 */
const CACHE_TTL_MS = 60_000;

let cached: { value: boolean; at: number } | null = null;

export async function getFreeTierCanTrade(
  prisma: PrismaService,
): Promise<boolean> {
  const now = Date.now();
  // Testlerde katman satırı test içinde değiştirilebiliyor → cache'i atla.
  const ttl = isTest() ? 0 : CACHE_TTL_MS;
  if (cached && now - cached.at < ttl) return cached.value;

  const freeTier = await prisma.membershipTier.findUnique({
    where: { type: MembershipTierType.free },
    select: { canTrade: true },
  });
  const value = freeTier?.canTrade === true;
  cached = { value, at: now };
  return value;
}

/** Katman güncellendiğinde (admin panelinden) cache'i düşür. */
export function invalidateFreeTierCanTradeCache(): void {
  cached = null;
}
