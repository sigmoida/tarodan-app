import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../common/helpers/app-root";

/**
 * Pins the load-bearing parts of the migration that ties a trade consent to
 * its cash payment: the partial unique index (the API turns its violation into
 * "already recorded"), the SET NULL foreign key and the append-only guard that
 * must let both the FK's SET NULL and the backfill's fill through, and nothing
 * else.
 */
const MIGRATIONS_DIR = join(apiAppRoot(), "prisma/migrations");
const MIGRATION = "20261022180000_consent_records_trade_cash_payment";
const UNIQUE_INDEX = "consent_records_trade_cash_payment_granted_key";

const withoutComments = (sql: string) => sql.replace(/--.*$/gm, "");
const sqlOf = (dir: string) =>
  withoutComments(
    readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"),
  );
const migrationDirs = () =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

describe(`migration ${MIGRATION}`, () => {
  const sql = sqlOf(MIGRATION);

  it("is additive only (no DROP / RENAME / NOT NULL)", () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX|TRIGGER)\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN[^;]*SET\s+NOT\s+NULL/i);
    expect(sql).not.toMatch(/ADD\s+COLUMN[^;]*NOT\s+NULL/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"?consent_records"?\s+SET\b/i);
  });

  it("adds a nullable column with a SET NULL foreign key to the cash payment", () => {
    expect(sql).toMatch(
      /ALTER TABLE "consent_records" ADD COLUMN "trade_cash_payment_id" TEXT;/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("trade_cash_payment_id"\) REFERENCES "trade_cash_payments"\("id"\) ON DELETE SET NULL/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "consent_records_trade_cash_payment_id_idx"\s+ON "consent_records"\("trade_cash_payment_id"\)/,
    );
  });

  it("keeps one granted distance sales row per trade cash payment", () => {
    const index = new RegExp(
      `CREATE UNIQUE INDEX "${UNIQUE_INDEX}"\\s+ON "consent_records"\\("trade_cash_payment_id"\\)\\s+WHERE ([^;]+);`,
    ).exec(sql);
    expect(index).not.toBeNull();
    const predicate = index![1];
    expect(predicate).toMatch(/"document" = 'distance_sales'/);
    expect(predicate).toMatch(/"action" = 'granted'/);
    expect(predicate).toMatch(/"trade_cash_payment_id" IS NOT NULL/);
  });

  describe("append-only guard", () => {
    const fn =
      /CREATE OR REPLACE FUNCTION consent_records_append_only\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/.exec(
        sql,
      )?.[0] ?? "";

    it("is redefined here", () => {
      expect(fn).not.toBe("");
    });

    it("still refuses DELETE and keeps the purge session flag", () => {
      expect(fn).toMatch(
        /IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION[\s\S]*?restrict_violation/,
      );
      expect(fn).toMatch(
        /current_setting\('tarodan\.allow_consent_purge', true\) = 'on'/,
      );
    });

    it("lets the trade cash payment link become NULL (the FK's SET NULL)", () => {
      expect(fn).toMatch(/NEW\.trade_cash_payment_id IS NULL\s+OR/);
    });

    it("lets the link be filled only with the row's own details reference", () => {
      expect(fn).toMatch(
        /OLD\.trade_cash_payment_id IS NULL\s+AND NEW\.trade_cash_payment_id = OLD\.details ->> 'tradeCashPaymentId'/,
      );
    });

    // The pieces above can each still match a guard that was loosened next to
    // them (an extra `OR TRUE`, a DELETE that returns early, a cart or order
    // link that may change freely). The whole body is pinned, whitespace
    // collapsed, so any change to the guard's control flow fails here and is
    // reviewed on purpose.
    it("pins the whole guard body (every exemption, nothing more)", () => {
      const body =
        /CREATE OR REPLACE FUNCTION consent_records_append_only\(\) RETURNS trigger AS \$\$([\s\S]*?)\$\$ LANGUAGE plpgsql;/.exec(
          sql,
        )?.[1] ?? "";
      expect(body.replace(/\s+/g, " ").trim()).toBe(
        [
          "BEGIN",
          "IF current_setting('tarodan.allow_consent_purge', true) = 'on' THEN",
          "IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;",
          "RETURN NEW;",
          "END IF;",
          "IF TG_OP = 'DELETE' THEN",
          "RAISE EXCEPTION 'consent_records: DELETE refused (consent records are append-only)'",
          "USING ERRCODE = 'restrict_violation';",
          "END IF;",
          "IF (NEW.checkout_group_id IS NULL OR NEW.checkout_group_id IS NOT DISTINCT FROM OLD.checkout_group_id)",
          "AND (NEW.order_id IS NULL OR NEW.order_id IS NOT DISTINCT FROM OLD.order_id)",
          "AND (",
          "NEW.trade_cash_payment_id IS NULL",
          "OR NEW.trade_cash_payment_id IS NOT DISTINCT FROM OLD.trade_cash_payment_id",
          "OR (",
          "OLD.trade_cash_payment_id IS NULL",
          "AND NEW.trade_cash_payment_id = OLD.details ->> 'tradeCashPaymentId'",
          ")",
          ")",
          "AND (to_jsonb(NEW) - 'checkout_group_id' - 'order_id' - 'trade_cash_payment_id')",
          "= (to_jsonb(OLD) - 'checkout_group_id' - 'order_id' - 'trade_cash_payment_id')",
          "THEN",
          "RETURN NEW;",
          "END IF;",
          "RAISE EXCEPTION 'consent_records: UPDATE refused (only a deleted cart, order or trade cash payment link may become NULL, or the trade cash payment link may be filled from details)'",
          "USING ERRCODE = 'restrict_violation';",
          "END;",
        ].join(" "),
      );
    });

    it("keeps every other column immutable", () => {
      expect(fn).toMatch(
        /\(to_jsonb\(NEW\) - 'checkout_group_id' - 'order_id' - 'trade_cash_payment_id'\)\s+= \(to_jsonb\(OLD\) - 'checkout_group_id' - 'order_id' - 'trade_cash_payment_id'\)/,
      );
    });
  });

  it("sorts after the migration that created the guard", () => {
    const dirs = migrationDirs();
    expect(dirs.indexOf(MIGRATION)).toBeGreaterThan(
      dirs.indexOf("20261005100000_consent_records"),
    );
  });

  // A later migration that redefines the guard without the new column would
  // make every SET NULL of a deleted cash payment (test-lane purge) fail.
  it("the LAST definition of consent_records_append_only keeps the trade cash payment link", () => {
    const definers = migrationDirs().filter(
      (dir) =>
        existsSync(join(MIGRATIONS_DIR, dir, "migration.sql")) &&
        /CREATE OR REPLACE FUNCTION consent_records_append_only\(\)/.test(
          sqlOf(dir),
        ),
    );
    expect(definers).toContain(MIGRATION);
    const latest = sqlOf(definers[definers.length - 1]);
    expect(latest).toMatch(/NEW\.trade_cash_payment_id IS NULL/);
    expect(latest).toMatch(/- 'trade_cash_payment_id'\)/);
  });
});
