import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration lifecycle contract.
 *
 * Return statuses are custody facts, not merely review states. This source-level
 * regression test deliberately guards the SQL because a unit test of the
 * TypeScript service cannot detect a future migration edit that makes an
 * in-transit return cancellable again.
 */
describe("refund financial policy v2 migration", () => {
  const sql = readFileSync(
    join(
      __dirname,
      "../../../prisma/migrations/20260811120000_refund_financial_policy_v2/migration.sql",
    ),
    "utf8",
  );
  const movingStatuses = [
    "return_shipment_open",
    "return_in_transit",
    "return_delivered",
    "disputed",
  ];

  it("excludes physical return states from the pending-review reset", () => {
    const resetBlock = sql.slice(
      sql.indexOf('UPDATE "refund_requests" AS rr'),
      sql.indexOf("-- Safe records whose physical return has already started"),
    );

    expect(resetBlock).toContain("\"status\" = 'pending_review'");
    for (const status of movingStatuses) {
      expect(resetBlock).toContain(`'${status}'`);
    }
  });

  it("marks moving returns for v2 review without writing their status", () => {
    const commentStart = sql.indexOf(
      "-- Safe records whose physical return has already started",
    );
    const updateStart = sql.indexOf(
      'UPDATE "refund_requests" AS rr',
      commentStart,
    );
    const nextUpdate = sql.indexOf(
      'UPDATE "refund_requests" AS rr',
      updateStart + 1,
    );
    const lifecycleBlock = sql.slice(updateStart, nextUpdate);

    expect(lifecycleBlock).toContain('"policy_version" = 2');
    expect(lifecycleBlock).toContain('"financial_review_required" = true');
    expect(lifecycleBlock).not.toMatch(/SET[\s\S]*"status"\s*=/);
    for (const status of movingStatuses) {
      expect(lifecycleBlock).toContain(`'${status}'`);
    }
  });
});
