import type { Prisma } from "@prisma/client";

/**
 * Hesap şeridi. Canlı ortamda test hesapları (mağaza incelemesi, mobil QA)
 * `test` şeridinde yaşar: yalnız birbirlerini görür ve birbirleriyle işlem
 * yapar. Anonim ziyaretçi ve misafir checkout her zaman `live` şerididir.
 *
 * Tek kaynak: `User.isTestAccount`. Sipariş/ödeme/takas satırlarındaki
 * `isTest` damgası DB trigger'ıyla bu bayraktan türetilir.
 */
export type AccountLane = "live" | "test";

export const LIVE_LANE: AccountLane = "live";

export function laneOf(
  user: { isTestAccount: boolean } | null | undefined,
): AccountLane {
  return user?.isTestAccount ? "test" : LIVE_LANE;
}

/** Prisma predicate: yalnız verilen şeritteki kullanıcılar. */
export function laneUserWhere(lane: AccountLane): Prisma.UserWhereInput {
  return { isTestAccount: lane === "test" };
}

/** Sipariş/ödeme/takas gibi damgalı tablolar için şerit predicate'i. */
export function laneRowWhere(lane: AccountLane): { isTest: boolean } {
  return { isTest: lane === "test" };
}
