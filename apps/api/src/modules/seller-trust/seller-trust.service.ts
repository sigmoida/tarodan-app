import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { SellerTrustComponentsV1 } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import {
  inBoundedWrite,
  type BoundedWriteLimits,
} from "../../common/helpers/bounded-transaction";

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

/**
 * Owner of `seller_trust_scores` (ADR 0014). A leaf: Prisma only, so every
 * domain that reads the score can import it without a cycle. Only the nightly
 * batch writes; profiles will read by primary key (ST2).
 */
@Injectable()
export class SellerTrustService {
  constructor(private readonly prisma: PrismaService) {}

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
