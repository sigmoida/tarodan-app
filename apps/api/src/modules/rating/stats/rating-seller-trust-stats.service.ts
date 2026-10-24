import { Injectable } from "@nestjs/common";
import { OrderOrigin, Prisma, TradeStatus } from "@prisma/client";
import { PUBLIC_RATING_STATUS } from "../../../common/helpers/public-rating";
import type { StatsWindow } from "../../../common/helpers/stats-window";
import { liveRowSql } from "../../account-lane/live-lane.where";

export interface SellerRatingRow {
  userId: string;
  /** Distinct givers whose ratings count. */
  raters: number;
  /** Sum over those givers of each giver's mean score. */
  sumOfGiverMeans: number;
}

/**
 * Rating input of the seller trust score (ADR 0014, `docs/SELLER_TRUST.md`).
 *
 * Counts published ratings (`PUBLIC_RATING_STATUS`) the user received:
 * - **as seller**: the rated order's `seller_id` is the receiver. Ratings are
 *   two-way, so a seller's rating of a buyer never counts for the buyer.
 *   Live-lane orders only, never platform service orders.
 * - **on a completed trade** (live lane), from the other participant.
 *
 * One vote per person: each giver's ratings are averaged first. Banned givers
 * are left out. Reporting SQL in the rating domain; it joins the referenced
 * order, trade and giver rows (`apps/api/CLAUDE.md`, raw SQL for reporting).
 * Index probe on `ratings(receiver_id)`, then primary-key joins.
 */
@Injectable()
export class RatingSellerTrustStatsService {
  async sellerRatingStats(
    tx: Prisma.TransactionClient,
    userIds: string[],
    window: StatsWindow,
  ): Promise<SellerRatingRow[]> {
    if (userIds.length === 0) return [];
    return tx.$queryRaw<SellerRatingRow[]>`
      WITH counted AS (
        SELECT r."receiver_id", r."giver_id", r."score"
        FROM "ratings" r
        JOIN "users" g ON g."id" = r."giver_id"
        LEFT JOIN "orders" o ON o."id" = r."order_id"
        LEFT JOIN "trades" t ON t."id" = r."trade_id"
        WHERE r."receiver_id" = ANY(${userIds}::text[])
          AND r."status" = ${PUBLIC_RATING_STATUS}::"RatingStatus"
          AND r."created_at" >= ${window.since}
          AND r."created_at" < ${window.until}
          AND g."is_banned" = false
          AND (
            (
              o."id" IS NOT NULL
              AND o."seller_id" = r."receiver_id"
              AND ${liveRowSql("o")}
              AND o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
            )
            OR (
              t."id" IS NOT NULL
              AND t."status" = ${TradeStatus.completed}::"TradeStatus"
              AND ${liveRowSql("t")}
            )
          )
      ),
      per_giver AS (
        SELECT "receiver_id", "giver_id", AVG("score")::float8 AS "mean"
        FROM counted
        GROUP BY 1, 2
      )
      SELECT
        "receiver_id" AS "userId",
        COUNT(*)::int AS "raters",
        SUM("mean")::float8 AS "sumOfGiverMeans"
      FROM per_giver
      GROUP BY 1`;
  }
}
