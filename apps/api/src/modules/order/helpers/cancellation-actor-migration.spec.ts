import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";
import {
  OFFER_ADMIN_CANCEL_PREFIX,
  TRADE_CANCEL_REASON,
} from "../../trade/helpers/trade-cancel-reasons";
import { ORDER_CANCEL_REASON } from "./order-cancel-reasons";

/**
 * Migration contract: `cancelled_by` lands on LIVE production data.
 *
 * The migration must stay additive (no rewrite, no drop, no NOT NULL) and its
 * backfill must be conservative and re-runnable: it only fills rows that were
 * stamped as cancelled and have no actor yet, and it only writes the actor.
 * The backfill matches reason texts the code writes — if a constant were
 * reworded, the SQL would silently stop matching, so the literals are pinned
 * to the constants here.
 */
describe("cancellation actor migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20260922100000_cancellation_actor/migration.sql",
    ),
    "utf8",
  );
  /** Statements without `--` comments, so prose cannot satisfy an assertion. */
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const updates = statements.filter((statement) =>
    statement.startsWith("UPDATE"),
  );

  it("is additive only: new enum, nullable columns without default, indexes", () => {
    expect(statements).toContain(
      `CREATE TYPE "CancellationActor" AS ENUM ('buyer', 'seller', 'platform', 'system')`,
    );
    expect(statements).toContain(
      'ALTER TABLE "orders" ADD COLUMN "cancelled_by" "CancellationActor"',
    );
    expect(statements).toContain(
      'ALTER TABLE "trades" ADD COLUMN "cancelled_by" "CancellationActor"',
    );
    const body = statements.join("\n");
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bRENAME\b/i);
    expect(body).not.toMatch(/ADD COLUMN[^\n]*NOT NULL|SET NOT NULL/i);
    expect(body).not.toMatch(/\bDEFAULT\b/i);
    expect(body).not.toMatch(/\bDELETE\b/i);
    expect(
      statements.every((statement) =>
        /^(CREATE TYPE|ALTER TABLE "(orders|trades)" ADD COLUMN|UPDATE|CREATE INDEX)/.test(
          statement,
        ),
      ),
    ).toBe(true);
  });

  it("backfills orders and trades with a rule per certain actor", () => {
    expect(updates.filter((u) => u.startsWith('UPDATE "orders"'))).toHaveLength(
      6,
    );
    expect(updates.filter((u) => u.startsWith('UPDATE "trades"'))).toHaveLength(
      4,
    );
  });

  it.each([["orders"], ["trades"]])(
    "every %s update touches only stamped, actor-less, still-cancelled rows",
    (table) => {
      const tableUpdates = updates.filter((u) =>
        u.startsWith(`UPDATE "${table}"`),
      );
      for (const update of tableUpdates) {
        expect(update).toMatch(/"cancelled_by" IS NULL/);
        expect(update).toMatch(/"cancelled_at" IS NOT NULL/);
        expect(update).toMatch(/"status" = '(cancelled|rejected)'/);
      }
    },
  );

  it("writes nothing but the actor", () => {
    for (const update of updates) {
      const set = update.slice(update.indexOf("SET"), update.indexOf("WHERE"));
      expect(set).toMatch(
        /^SET "cancelled_by" = '(buyer|seller|platform|system)'\s*$/,
      );
    }
  });

  it("orders: never infers an actor from a reason an offer order can carry stale", () => {
    // Teklif siparişi reactivate ile canlanır ve gerekçe temizlenmez; ödenmemiş
    // siparişlerin sistem metinleri yalnız teklifsiz satırlarda güvenilir.
    const unpaidSystem = updates.find((u) =>
      u.includes(`'${ORDER_CANCEL_REASON.paymentWindowExpired}'`),
    );
    expect(unpaidSystem).toBeDefined();
    expect(unpaidSystem).toContain('"offer_id" IS NULL');
    for (const reason of [
      ORDER_CANCEL_REASON.stockDepleted,
      ORDER_CANCEL_REASON.stockReservedForTrade,
      ORDER_CANCEL_REASON.replacedByNewCheckout,
    ]) {
      expect(unpaidSystem).toContain(`'${reason}'`);
    }
  });

  it("matches the reason constants the code writes, verbatim", () => {
    const body = updates.join("\n");
    for (const reason of Object.values(ORDER_CANCEL_REASON)) {
      expect(body).toContain(`'${reason}'`);
    }
    expect(body).toContain(`LIKE '${OFFER_ADMIN_CANCEL_PREFIX}: %'`);
    for (const reason of [
      TRADE_CANCEL_REASON.autoExpired,
      TRADE_CANCEL_REASON.stockDepleted,
      TRADE_CANCEL_REASON.lostParcel,
      TRADE_CANCEL_REASON.membershipDowngraded,
      TRADE_CANCEL_REASON.accountBanned,
    ]) {
      expect(body).toContain(`'${reason}'`);
    }
    expect(body).toContain(
      `LIKE '${TRADE_CANCEL_REASON.adminForceCancelStuck("%")}'`,
    );
  });

  it("builds the actor tab indexes after the backfill", () => {
    const lastUpdate = sql.lastIndexOf("UPDATE ");
    expect(sql.indexOf("CREATE INDEX")).toBeGreaterThan(lastUpdate);
    expect(statements).toContain(
      'CREATE INDEX "orders_cancelled_by_cancelled_at_idx" ON "orders"("cancelled_by", "cancelled_at")',
    );
    expect(statements).toContain(
      'CREATE INDEX "trades_cancelled_by_cancelled_at_idx" ON "trades"("cancelled_by", "cancelled_at")',
    );
  });
});
