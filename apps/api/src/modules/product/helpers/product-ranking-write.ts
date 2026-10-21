import { Prisma } from "@prisma/client";
import { computeRelevanceScore } from "./relevance-score";

/** Rank tier of a listing with a running boost. */
export const BOOSTED_RANK_TIER = 2;

export interface ProductRankingWrite {
  productId: string;
  qualityScore: number;
  popularityScore: number | null;
  /** The tier when the listing is not boosted: 1 for a premium seller, else 0. */
  unboostedTier: 0 | 1;
  /** Also writes `popularityScore` and stamps `popularityUpdatedAt` (nightly job). */
  writePopularity: boolean;
  now: Date;
}

/** The tier and relevance for both cases; the row decides at write time. */
export function rankingWriteValues(w: ProductRankingWrite) {
  const scores = {
    qualityScore: w.qualityScore,
    popularityScore: w.popularityScore,
  };
  return {
    boosted: {
      rankTier: BOOSTED_RANK_TIER,
      relevanceScore: computeRelevanceScore({
        rankTier: BOOSTED_RANK_TIER,
        ...scores,
      }),
    },
    unboosted: {
      rankTier: w.unboostedTier,
      relevanceScore: computeRelevanceScore({
        rankTier: w.unboostedTier,
        ...scores,
      }),
    },
  };
}

/**
 * Writes a listing's quality score, rank tier and relevance score, choosing
 * the boosted or the unboosted tier (and the boost bonus in the relevance)
 * from `boosted_until` **of the row at write time**, not from a value read
 * earlier.
 *
 * The rankers read many listings, compute, and write later. A boost activated
 * in between (BoostTimelineService.activate, under the listing lock) would
 * otherwise be overwritten with tier 0/1 and no boost bonus while
 * `boosted_until` stays set, and the expiry downgrade never repairs a listing
 * that is still boosted. One UPDATE per listing, no extra lock: the UPDATE
 * waits for a transaction holding the listing row and then evaluates the CASE
 * on the committed row (Postgres READ COMMITTED).
 *
 * @returns the number of rows written (0 when the listing is gone).
 */
export function writeProductRanking(
  db: Pick<Prisma.TransactionClient, "$executeRaw">,
  w: ProductRankingWrite,
): Promise<number> {
  const { boosted, unboosted } = rankingWriteValues(w);
  const popularity = w.writePopularity
    ? Prisma.sql`, "popularity_score" = ${w.popularityScore}::int, "popularity_updated_at" = ${w.now}`
    : Prisma.empty;
  return db.$executeRaw`
    UPDATE "products" SET
      "quality_score" = ${w.qualityScore}::int,
      "rank_tier" = CASE WHEN "boosted_until" > ${w.now}
        THEN ${boosted.rankTier}::int ELSE ${unboosted.rankTier}::int END,
      "relevance_score" = CASE WHEN "boosted_until" > ${w.now}
        THEN ${boosted.relevanceScore}::int ELSE ${unboosted.relevanceScore}::int END,
      "updated_at" = ${w.now}${popularity}
    WHERE "id" = ${w.productId}
  `;
}
