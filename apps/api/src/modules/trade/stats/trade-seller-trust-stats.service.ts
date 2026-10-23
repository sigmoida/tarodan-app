import { Injectable } from "@nestjs/common";
import { Prisma, TradeStatus } from "@prisma/client";
import type { StatsWindow } from "../../../common/helpers/stats-window";
import { liveRowSql } from "../../account-lane/live-lane.where";

export interface TradeCounterpartyRow {
  userId: string;
  /** The other participant's user id. */
  counterpartyKey: string;
  count: number;
}

/**
 * Trade-side inputs of the seller trust score (ADR 0014,
 * `docs/SELLER_TRUST.md`): completed live-lane trades, for both participants.
 */
@Injectable()
export class TradeSellerTrustStatsService {
  /**
   * Participants of trades completed since `since`. Range scan on
   * `trades(completed_at)`. Ordered so the caller's batches are stable.
   */
  async activeTraderIds(
    tx: Prisma.TransactionClient,
    since: Date,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT p."id" FROM (
        SELECT t."initiator_id" AS "id" FROM "trades" t
        WHERE t."status" = ${TradeStatus.completed}::"TradeStatus"
          AND t."completed_at" >= ${since}
          AND ${liveRowSql("t")}
        UNION
        SELECT t."receiver_id" FROM "trades" t
        WHERE t."status" = ${TradeStatus.completed}::"TradeStatus"
          AND t."completed_at" >= ${since}
          AND ${liveRowSql("t")}
      ) p
      ORDER BY 1`;
    return rows.map((r) => r.id);
  }

  /**
   * Completed trades per (user, other participant) in the window, so the
   * caller can cap each counterparty across sales and trades. Index probes on
   * `trades(initiator_id)` and `trades(receiver_id)`.
   */
  async tradeCounterparties(
    tx: Prisma.TransactionClient,
    userIds: string[],
    window: StatsWindow,
  ): Promise<TradeCounterpartyRow[]> {
    if (userIds.length === 0) return [];
    return tx.$queryRaw<TradeCounterpartyRow[]>`
      SELECT p."userId", p."counterpartyKey", COUNT(*)::int AS "count"
      FROM (
        SELECT t."initiator_id" AS "userId", t."receiver_id" AS "counterpartyKey"
        FROM "trades" t
        WHERE t."initiator_id" = ANY(${userIds}::text[])
          AND t."status" = ${TradeStatus.completed}::"TradeStatus"
          AND t."completed_at" >= ${window.since}
          AND t."completed_at" < ${window.until}
          AND ${liveRowSql("t")}
        UNION ALL
        SELECT t."receiver_id", t."initiator_id"
        FROM "trades" t
        WHERE t."receiver_id" = ANY(${userIds}::text[])
          AND t."status" = ${TradeStatus.completed}::"TradeStatus"
          AND t."completed_at" >= ${window.since}
          AND t."completed_at" < ${window.until}
          AND ${liveRowSql("t")}
      ) p
      GROUP BY 1, 2`;
  }
}
