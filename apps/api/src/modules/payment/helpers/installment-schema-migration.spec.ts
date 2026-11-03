import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * Pins the installment schema migrations (ADR 0019, task A2): additive and
 * lock-safe on live data, the CHECKs and the payments FK validated in a
 * separate migration, and the DB guards the money code relies on. The
 * behaviour of the guards is pinned against a real database in
 * `test/e2e/installment-schema-guards.e2e-spec.ts`.
 */
const MIGRATIONS_DIR = join(apiAppRoot(), "prisma/migrations");
const SCHEMA = "20261103120000_installment_payments_schema";
const VALIDATE = "20261103120100_installment_payments_validate_constraints";
const INDEX = "20261103120200_installment_payments_charge_attempt_index";
/** The latest migration on `development` when these were written. */
const BASE = "20261023170000_refund_attempt_failure_count";

const read = (dir: string) =>
  readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8").replace(
    /--.*$/gm,
    "",
  );
const schemaSql = read(SCHEMA);
const validateSql = read(VALIDATE);
const indexSql = read(INDEX);

/** The ALTER TABLE statements on tables that existed before. */
const EXISTING_TABLES = ["payments", "orders", "refund_attempts"] as const;

describe(`migrations ${SCHEMA}, ${VALIDATE}, ${INDEX}`, () => {
  it("sort after the latest migration they were written on, schema before validation", () => {
    const dirs = readdirSync(MIGRATIONS_DIR)
      .filter((d) => /^\d{14}_/.test(d))
      .sort();
    expect(dirs.indexOf(SCHEMA)).toBeGreaterThan(dirs.indexOf(BASE));
    expect(dirs.indexOf(BASE)).toBeGreaterThan(-1);
    expect(dirs.indexOf(VALIDATE)).toBe(dirs.indexOf(SCHEMA) + 1);
    expect(dirs.indexOf(INDEX)).toBe(dirs.indexOf(SCHEMA) + 2);
  });

  it("are additive: no drop, rename, row write or NOT NULL without a default on an existing table", () => {
    for (const sql of [schemaSql, validateSql, indexSql]) {
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/\bRENAME\b/i);
      expect(sql).not.toMatch(/\bUPDATE\s+"?\w+"?\s+SET\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
    }
    for (const table of EXISTING_TABLES) {
      const alters = schemaSql.match(
        new RegExp(`ALTER TABLE "${table}"[\\s\\S]*?;`, "g"),
      );
      expect(alters).not.toBeNull();
      for (const statement of alters ?? []) {
        for (const column of statement.match(/ADD COLUMN[^\n]*/g) ?? []) {
          if (/NOT NULL/.test(column)) expect(column).toMatch(/DEFAULT 0\b/);
        }
      }
    }
  });

  it("alters the existing tables in the payment -> order lock order", () => {
    const first = (table: string) =>
      schemaSql.indexOf(`ALTER TABLE "${table}"`);
    expect(first("payments")).toBeGreaterThan(-1);
    expect(first("payments")).toBeLessThan(first("orders"));
    expect(first("orders")).toBeLessThan(first("refund_attempts"));
  });

  it("adds every constraint on an existing table NOT VALID and validates it in the next migration only", () => {
    const onExisting = [
      ["payments", "payments_charged_amount_check"],
      ["payments", "payments_installment_fee_amount_check"],
      ["payments", "payments_charge_attempt_id_fkey"],
      ["orders", "orders_installment_fee_amount_check"],
      ["refund_attempts", "refund_attempts_installment_fee_amount_check"],
    ] as const;
    for (const [table, name] of onExisting) {
      const added = new RegExp(
        `ALTER TABLE "${table}"\\s+ADD CONSTRAINT "${name}"[^;]*NOT VALID;`,
      );
      expect(schemaSql).toMatch(added);
      expect(validateSql).toContain(
        `ALTER TABLE "${table}" VALIDATE CONSTRAINT "${name}";`,
      );
    }
    expect(schemaSql).not.toMatch(/VALIDATE CONSTRAINT/);
    // The validation migration does nothing else.
    const statements = validateSql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(onExisting.length);
  });

  it("keeps the charged-amount rule: NULL (legacy, no fee) or exactly amount + fee, a fee only through an attempt", () => {
    expect(schemaSql.replace(/\s+/g, " ")).toContain(
      'CHECK (("charged_amount" IS NULL AND "installment_fee_amount" = 0) OR ("charged_amount" = "amount" + "installment_fee_amount" AND ("installment_fee_amount" = 0 OR "charge_attempt_id" IS NOT NULL))) NOT VALID',
    );
    expect(schemaSql).toMatch(/ADD COLUMN "charged_amount" DECIMAL\(10,2\),/);
  });

  it("adds the enum values without using them in the same migration", () => {
    for (const value of [
      "buyer_installment_fee",
      "installment_fee",
      "installment_platform_cost",
    ]) {
      expect(schemaSql.match(new RegExp(`'${value}'`, "g"))).toHaveLength(1);
    }
  });

  it("pins the immutable pricing snapshot, the rule versions and the capture link", () => {
    expect(schemaSql).toMatch(
      /CREATE TRIGGER installment_rules_guard\s+BEFORE UPDATE OR DELETE ON "installment_rules"/,
    );
    expect(schemaSql).toMatch(
      /CREATE TRIGGER installment_rate_snapshots_append_only\s+BEFORE UPDATE ON "installment_rate_snapshots"/,
    );
    expect(schemaSql).toMatch(
      /CREATE TRIGGER payment_charge_attempts_guard\s+BEFORE INSERT OR UPDATE OR DELETE ON "payment_charge_attempts"/,
    );
    // On INSERT (a new row cannot claim another payment's attempt) and when a
    // capture column is written; a no-op while charge_attempt_id is NULL.
    expect(schemaSql).toMatch(
      /CREATE TRIGGER payments_charge_attempt_guard\s+BEFORE INSERT OR UPDATE OF "charge_attempt_id", "charged_amount", "installment_fee_amount", "installment_count", "paytr_merchant" ON "payments"/,
    );
    expect(schemaSql).toMatch(
      /CREATE UNIQUE INDEX "installment_rules_one_live_version_per_lineage"\s+ON "installment_rules"\("lineage_id"\) WHERE "archived_at" IS NULL;/,
    );
  });

  it("opens attempt deletion only through the test-lane purge gate for test payments", () => {
    const guard = schemaSql.slice(
      schemaSql.indexOf("FUNCTION payment_charge_attempts_guard()"),
      schemaSql.indexOf("CREATE TRIGGER payment_charge_attempts_guard"),
    );
    expect(guard).toContain("current_setting('app.test_lane_purge', true)");
    expect(guard).toMatch(/p\."is_test"/);
    // The refund purge-gate function is not redefined here
    // (test-lane-migrations.spec.ts owns it).
    expect(schemaSql).not.toMatch(
      /prevent_refund_financial_component_mutation/,
    );
  });

  it("builds the payments unique index in its own migration, outside the ACCESS EXCLUSIVE window", () => {
    expect(schemaSql).not.toMatch(/CREATE (UNIQUE )?INDEX[^;]*ON "payments"/);
    const statements = indexSql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'CREATE UNIQUE INDEX "payments_charge_attempt_id_key" ON "payments"("charge_attempt_id")',
    ]);
  });

  it("restricts every financial reference (no cascade)", () => {
    expect(schemaSql).not.toMatch(/ON DELETE CASCADE/i);
    expect(schemaSql.match(/FOREIGN KEY/g)).toHaveLength(4);
    expect(schemaSql.match(/ON DELETE RESTRICT/g)).toHaveLength(4);
  });
});
