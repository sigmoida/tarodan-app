import { Prisma } from "@prisma/client";
import {
  rankingExecuteRaw,
  type RankingRow,
} from "../../../../test/test-utils/product-ranking-sql";
import {
  rankingWriteValues,
  writeProductRanking,
  type ProductRankingWrite,
} from "./product-ranking-write";
import {
  RELEVANCE_BOOST_BONUS,
  RELEVANCE_PREMIUM_BONUS,
  RELEVANCE_QUALITY_WEIGHT,
} from "./relevance-score";

/**
 * The ranking write decides the boosted tier from the row at write time, so a
 * boost activated after a ranker read the listing keeps tier 2 and its bonus.
 */
describe("writeProductRanking", () => {
  const NOW = new Date("2026-10-21T12:00:00.000Z");
  const input = (
    over: Partial<ProductRankingWrite> = {},
  ): ProductRankingWrite => ({
    productId: "p1",
    qualityScore: 40,
    popularityScore: 7,
    unboostedTier: 1,
    writePopularity: false,
    now: NOW,
    ...over,
  });

  it("computes both outcomes from one formula", () => {
    expect(rankingWriteValues(input())).toEqual({
      boosted: {
        rankTier: 2,
        relevanceScore:
          RELEVANCE_BOOST_BONUS + 40 * RELEVANCE_QUALITY_WEIGHT + 7,
      },
      unboosted: {
        rankTier: 1,
        relevanceScore:
          RELEVANCE_PREMIUM_BONUS + 40 * RELEVANCE_QUALITY_WEIGHT + 7,
      },
    });
  });

  it("pins the conditional statement", async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);

    await writeProductRanking({ $executeRaw: executeRaw } as never, input());

    const [strings, ...values] = executeRaw.mock.calls[0];
    const { text } = Prisma.sql(strings, ...values);
    const sql = text.replace(/\s+/g, " ").trim();
    expect(sql).toBe(
      'UPDATE "products" SET "quality_score" = $1::int, ' +
        '"rank_tier" = CASE WHEN "boosted_until" > $2 THEN $3::int ELSE $4::int END, ' +
        '"relevance_score" = CASE WHEN "boosted_until" > $5 THEN $6::int ELSE $7::int END, ' +
        '"updated_at" = $8 WHERE "id" = $9',
    );
  });

  it.each([
    ["boosted at write time", new Date(NOW.getTime() + 1000), 2],
    ["boost ended", new Date(NOW.getTime() - 1000), 1],
    ["never boosted", null, 1],
  ])("%s -> tier %p", async (_label, boostedUntil, tier) => {
    const rows = new Map<string, RankingRow>([["p1", { boostedUntil }]]);

    await writeProductRanking(
      { $executeRaw: rankingExecuteRaw(rows) } as never,
      input(),
    );

    const values = rankingWriteValues(input());
    expect(rows.get("p1")).toMatchObject({
      qualityScore: 40,
      rankTier: tier,
      relevanceScore:
        tier === 2
          ? values.boosted.relevanceScore
          : values.unboosted.relevanceScore,
    });
  });

  it("writes the popularity columns only when asked", async () => {
    const rows = new Map<string, RankingRow>([["p1", { boostedUntil: null }]]);
    const db = { $executeRaw: rankingExecuteRaw(rows) } as never;

    await writeProductRanking(db, input());
    expect(rows.get("p1")?.popularityUpdatedAt).toBeUndefined();

    await writeProductRanking(db, input({ writePopularity: true }));
    expect(rows.get("p1")).toMatchObject({
      popularityScore: 7,
      popularityUpdatedAt: NOW,
    });
  });
});
