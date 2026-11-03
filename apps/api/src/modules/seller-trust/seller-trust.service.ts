import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SELLER_TRUST_LEVEL_MIN_X100,
  type AdminSellerTrustView,
  type SellerTrustComponentsV1,
  type SellerTrustLevel,
  type SellerTrustView,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import {
  inBoundedWrite,
  type BoundedWriteLimits,
} from "../../common/helpers/bounded-transaction";
import {
  toAdminSellerTrustView,
  toSellerTrustView,
} from "./helpers/trust-view";

export interface SellerTrustScoreRow {
  userId: string;
  scoreX100: number | null;
  formulaVersion: number;
  components: SellerTrustComponentsV1;
}

/**
 * Background writes: give up on a lock wait after 2 s rather than queue; no
 * other writer touches the table, so a wait means something is wrong.
 */
const WRITE_LIMITS: BoundedWriteLimits = {
  lockTimeoutMs: 2_000,
  statementTimeoutMs: 10_000,
  transactionTimeoutMs: 15_000,
};

const SCORE_SELECT = {
  scoreX100: true,
  formulaVersion: true,
} as const satisfies Prisma.SellerTrustScoreSelect;

const STORED_ROW_SELECT = {
  userId: true,
  scoreX100: true,
  formulaVersion: true,
  components: true,
  computedAt: true,
} as const satisfies Prisma.SellerTrustScoreSelect;

/** A whole stored row, as read-only tools read it. */
export type StoredSellerTrustRow = Prisma.SellerTrustScoreGetPayload<{
  select: typeof STORED_ROW_SELECT;
}>;

/** Narrows stored rows by their stored level and counted transactions. */
export interface StoredSellerTrustFilter {
  levels?: readonly SellerTrustLevel[];
  minTransactions?: number;
}

/** `score_x100` range of each level, the same thresholds as `sellerTrustLevel`. */
function levelWhere(
  level: SellerTrustLevel,
): Prisma.SellerTrustScoreWhereInput {
  const min = SELLER_TRUST_LEVEL_MIN_X100;
  switch (level) {
    case "excellent":
      return { scoreX100: { gte: min.excellent } };
    case "trusted":
      return { scoreX100: { gte: min.trusted, lt: min.excellent } };
    case "fair":
      return { scoreX100: { gte: min.fair, lt: min.trusted } };
    case "developing":
      // `lt` never matches NULL, so `new` rows stay out.
      return { scoreX100: { lt: min.fair } };
    case "new":
      return { scoreX100: null };
  }
}

/** The `where` of a filter; exported for its spec. */
export function storedFilterWhere(
  filter: StoredSellerTrustFilter,
): Prisma.SellerTrustScoreWhereInput {
  const and: Prisma.SellerTrustScoreWhereInput[] = [];
  // An empty level list means every level, like an absent one.
  if (filter.levels && filter.levels.length > 0) {
    and.push({ OR: [...new Set(filter.levels)].map(levelWhere) });
  }
  if (filter.minTransactions !== undefined) {
    and.push({
      components: {
        path: ["volume", "transactions"],
        gte: filter.minTransactions,
      },
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

/**
 * Owner of `seller_trust_scores` (ADR 0014). A leaf: Prisma only, so every
 * domain that reads the score can import it without a cycle. Only the nightly
 * batch writes; reads are primary-key lookups (the admin lab also pages the
 * table in primary-key order, on its read-only snapshot) and never compute.
 */
@Injectable()
export class SellerTrustService {
  constructor(private readonly prisma: PrismaService) {}

  /** One seller's stored score (one primary-key lookup). No row is `new`. */
  async getForUser(userId: string): Promise<SellerTrustView> {
    const row = await this.prisma.sellerTrustScore.findUnique({
      where: { userId },
      select: SCORE_SELECT,
    });
    return toSellerTrustView(row);
  }

  /**
   * Many sellers in one query, for lists and the ranking job. The map has an
   * entry for every requested id; ids without a row map to `new`.
   */
  async getForUsers(userIds: string[]): Promise<Map<string, SellerTrustView>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.sellerTrustScore.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, ...SCORE_SELECT },
    });
    const byId = new Map(rows.map((r) => [r.userId, r]));
    return new Map(
      ids.map((id) => [id, toSellerTrustView(byId.get(id) ?? null)]),
    );
  }

  /** Admin support: the view plus the stored breakdown and its time. */
  async getAdminView(userId: string): Promise<AdminSellerTrustView> {
    const row = await this.prisma.sellerTrustScore.findUnique({
      where: { userId },
      select: { ...SCORE_SELECT, components: true, computedAt: true },
    });
    return toAdminSellerTrustView(row);
  }

  /**
   * One seller's whole row, on the caller's read-only snapshot (the admin
   * lab). Primary-key lookup.
   */
  readStoredRow(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<StoredSellerTrustRow | null> {
    return tx.sellerTrustScore.findUnique({
      where: { userId },
      select: STORED_ROW_SELECT,
    });
  }

  /** Rows matching `filter`, on the caller's read-only snapshot. */
  countStored(
    tx: Prisma.TransactionClient,
    filter: StoredSellerTrustFilter,
  ): Promise<number> {
    return tx.sellerTrustScore.count({ where: storedFilterWhere(filter) });
  }

  /**
   * One page of rows matching `filter`, in primary-key order after
   * `afterUserId` (keyset paging: each page is one primary-key range scan),
   * on the caller's read-only snapshot.
   */
  readStoredPage(
    tx: Prisma.TransactionClient,
    filter: StoredSellerTrustFilter,
    afterUserId: string | null,
    take: number,
  ): Promise<StoredSellerTrustRow[]> {
    const where = storedFilterWhere(filter);
    return tx.sellerTrustScore.findMany({
      where:
        afterUserId === null
          ? where
          : { AND: [where, { userId: { gt: afterUserId } }] },
      orderBy: { userId: "asc" },
      take,
      select: STORED_ROW_SELECT,
    });
  }

  /** True when the table has no row at all (first deploy: enqueue a run). */
  async isEmpty(): Promise<boolean> {
    const row = await this.prisma.sellerTrustScore.findFirst({
      select: { userId: true },
    });
    return row === null;
  }

  /**
   * One multi-row upsert keyed by `user_id`, stamped with the run's `asOf`.
   * Re-running with the same inputs writes the same row (idempotent). Only
   * the primary key is indexed and the table has fillfactor 90, so updates
   * are HOT.
   */
  async upsertBatch(rows: SellerTrustScoreRow[], asOf: Date): Promise<number> {
    if (rows.length === 0) return 0;
    const values = Prisma.join(
      rows.map(
        (r) =>
          Prisma.sql`(${r.userId}, ${r.scoreX100}::smallint, ${r.formulaVersion}::smallint, ${JSON.stringify(r.components)}::jsonb, ${asOf})`,
      ),
    );
    return inBoundedWrite(
      this.prisma,
      WRITE_LIMITS,
      (tx) =>
        tx.$executeRaw`
        INSERT INTO "seller_trust_scores"
          ("user_id", "score_x100", "formula_version", "components", "computed_at")
        VALUES ${values}
        ON CONFLICT ("user_id") DO UPDATE SET
          "score_x100" = EXCLUDED."score_x100",
          "formula_version" = EXCLUDED."formula_version",
          "components" = EXCLUDED."components",
          "computed_at" = EXCLUDED."computed_at"`,
    );
  }

  /**
   * Removes the rows a run did not write: sellers that dropped out of every
   * window, or were banned, deleted or moved to the test lane. Call it only
   * after a run in which every batch succeeded, or a failed batch would wipe
   * its sellers' scores.
   */
  async deleteStale(asOf: Date): Promise<number> {
    return inBoundedWrite(
      this.prisma,
      WRITE_LIMITS,
      (tx) =>
        tx.$executeRaw`DELETE FROM "seller_trust_scores" WHERE "computed_at" < ${asOf}`,
    );
  }
}
