import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot, repoRoot } from "../../common/helpers/app-root";

/**
 * Test şeridi migrasyonları PR #494'te 8–16 Eylül damgalarıyla yazıldı ama hiçbir
 * ortama uygulanmadan development'ın 22 Eylül migrasyonlarının gerisinde kaldı.
 * `prisma migrate deploy` sırayı klasör adından okur; geriye tarihli bir klasör
 * canlıda "uygulanmamış eski migrasyon" olarak ya atlanır ya da deploy'u kilitler.
 * Bu yüzden dördü de en yeni development migrasyonunun ARDINA taşındı —
 * kendi aralarındaki sıra korunarak (damga → ledger → ledger refs → purge gate).
 */
const MIGRATIONS_DIR = join(apiAppRoot(), "prisma/migrations");

const TEST_LANE_MIGRATIONS = [
  "20260922120000_production_test_lane",
  "20260922130000_test_lane_ledger",
  "20260922140000_test_lane_ledger_refs",
  "20260922150000_test_lane_purge_gate",
] as const;

const OLD_NAMES = [
  "20260908100000_production_test_lane",
  "20260908110000_test_lane_ledger",
  "20260916120000_test_lane_ledger_refs",
  "20260916130000_test_lane_purge_gate",
];

/** Test şeridinin dayandığı son development migrasyonu. */
const LAST_BASE_MIGRATION = "20260922110000_product_inactive_reason";

const migrationDirs = () =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

const sqlOf = (dir: string) =>
  readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");

describe("test lane migrations", () => {
  it("exist under their new names and the old folders are gone", () => {
    for (const dir of TEST_LANE_MIGRATIONS) {
      expect(existsSync(join(MIGRATIONS_DIR, dir, "migration.sql"))).toBe(true);
    }
    for (const dir of OLD_NAMES) {
      expect(existsSync(join(MIGRATIONS_DIR, dir))).toBe(false);
    }
  });

  it("sort after the latest base migration, in their original relative order", () => {
    const dirs = migrationDirs();
    const base = dirs.indexOf(LAST_BASE_MIGRATION);
    expect(base).toBeGreaterThanOrEqual(0);
    const positions = TEST_LANE_MIGRATIONS.map((d) => dirs.indexOf(d));
    expect(positions.every((p) => p > base)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("the purge gate is the LAST definition of the refund component guard", () => {
    // Guard fonksiyonu iki tabloyu korur (refund_financial_components +
    // package_shipping_settlements). Purge gate onu CREATE OR REPLACE ile
    // yeniden tanımlıyor; daha sonra gelen bir migrasyon fonksiyonu tekrar
    // yazarsa ya tahliye kapısını siler ya da o değişikliği ezeriz.
    const definers = migrationDirs().filter((dir) =>
      /CREATE OR REPLACE FUNCTION prevent_refund_financial_component_mutation/.test(
        sqlOf(dir),
      ),
    );
    expect(definers[definers.length - 1]).toBe(
      "20260922150000_test_lane_purge_gate",
    );
  });

  it("the purge gate keeps the guard closed for UPDATE and for live rows", () => {
    const sql = sqlOf("20260922150000_test_lane_purge_gate");
    expect(sql).toContain("IF TG_OP = 'DELETE' THEN");
    expect(sql).toContain("current_setting('app.test_lane_purge', true)");
    expect(sql).toContain('o."is_test"');
    expect(sql).toContain(
      "RAISE EXCEPTION 'refund financial components are immutable'",
    );
  });

  it("no source or doc still points at the pre-rename folder names", () => {
    const files = [
      join(apiAppRoot(), "src/modules/admin-test-tools/test-lane.service.ts"),
      join(repoRoot(), "docs/OPERATIONS.md"),
      join(repoRoot(), "docs/mobile-parity/21-test-lane-2026-09-08.md"),
      ...TEST_LANE_MIGRATIONS.map((d) =>
        join(MIGRATIONS_DIR, d, "migration.sql"),
      ),
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const old of OLD_NAMES) expect(text).not.toContain(old);
    }
  });
});
