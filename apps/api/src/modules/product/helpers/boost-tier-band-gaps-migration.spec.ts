import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { apiAppRoot, repoRoot } from "../../../common/helpers/app-root";
import {
  boostTierBandIsEmpty,
  boostTierBandsOverlap,
  boostTierCoversPrice,
  BoostTierRow,
  findBoostTierGaps,
  findBoostTierOverlaps,
} from "./boost-tier-band";

/**
 * `20261022165035_ad_package_tier_band_gaps` closes the gap the half-open band
 * rule left in the launch tiers (200-999 then 1000-5000 leaves [999, 1000)
 * without a tier). Every environment gets its ad package tiers from the launch
 * migration and then this one (no seed writes tiers), so these specs pin both
 * the SQL and the bands a new environment ends up with.
 *
 * `closeGaps` is the migration's rule in memory, condition for condition (the
 * SQL pins below tie the text to the same conditions); the property check runs
 * it on random tiers to show it never creates an overlap and is idempotent.
 */

const MIGRATION = "20261022165035_ad_package_tier_band_gaps";
const LAUNCH_MIGRATION = "20260726234552_ad_packages";
const migrationsDir = () => join(apiAppRoot(), "prisma/migrations");
const readMigration = (name: string) =>
  readFileSync(join(migrationsDir(), name, "migration.sql"), "utf8");
const withoutComments = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
/** Collapse whitespace so a pin does not depend on the SQL's line breaks. */
const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

type Row = BoostTierRow & { id: string; packageId: string };

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

/** The migration's UPDATE, on rows in memory. */
function closeGaps(rows: readonly Row[]): Row[] {
  const live = (row: Row) =>
    row.isActive !== false && !boostTierBandIsEmpty(row);
  const sibling = (a: Row, b: Row) =>
    a.packageId === b.packageId && a.durationDays === b.durationDays;
  return rows.map((tier) => {
    if (!live(tier) || tier.maxAmount == null) return tier;
    const max = D(tier.maxAmount);
    const starts = rows
      .filter((n) => sibling(n, tier) && live(n) && D(n.minAmount).gt(max))
      .map((n) => D(n.minAmount));
    if (starts.length === 0) return tier;
    const next = Prisma.Decimal.min(...starts);
    if (next.minus(max).gt(1)) return tier;
    const widened = { minAmount: tier.minAmount, maxAmount: next };
    const blocked = rows.some(
      (other) =>
        other.id !== tier.id &&
        sibling(other, tier) &&
        live(other) &&
        boostTierBandsOverlap(other, widened),
    );
    return blocked ? tier : { ...tier, maxAmount: next };
  });
}

const byPackage = (rows: readonly Row[]) => {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    groups.set(row.packageId, [...(groups.get(row.packageId) ?? []), row]);
  }
  return [...groups.values()];
};

const overlapKeys = (rows: readonly Row[]) =>
  new Set(
    byPackage(rows).flatMap((group) =>
      findBoostTierOverlaps(group).map(({ first, second }) =>
        [group[first].id, group[second].id].sort().join("|"),
      ),
    ),
  );

const bound = (value: Prisma.Decimal.Value | null | undefined) =>
  value == null ? null : D(value).toFixed(2);

/** The tier rows the launch migration inserts, from its SQL. */
function launchTiers(): Row[] {
  const sql = readMigration(LAUNCH_MIGRATION);
  const tuple =
    /\(gen_random_uuid\(\),'([^']+)',\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+|NULL)\s*,\s*\d+\s*,\s*(?:\d+|NULL)\s*,\s*(true|false)\s*,/g;
  return [...sql.matchAll(tuple)].map((match, index) => ({
    id: `launch-${index}`,
    packageId: match[1],
    durationDays: Number(match[2]),
    minAmount: D(match[3]),
    maxAmount: match[4] === "NULL" ? null : D(match[4]),
    isActive: match[5] === "true",
  }));
}

/**
 * The migration's conditions, whitespace collapsed. The runbook's dry-run
 * SELECT must carry the same ones, so the dry run lists what the UPDATE
 * writes.
 */
const PINS = {
  nextStart:
    'SELECT MIN(nxt."min_amount") FROM "ad_package_tiers" AS nxt ' +
    'WHERE nxt."package_id" = cur."package_id" ' +
    'AND nxt."duration_days" = cur."duration_days" ' +
    'AND nxt."is_active" ' +
    'AND (nxt."max_amount" IS NULL OR nxt."max_amount" > nxt."min_amount") ' +
    'AND nxt."min_amount" > cur."max_amount"',
  liveTier:
    'WHERE cur."is_active" AND cur."max_amount" IS NOT NULL ' +
    'AND cur."max_amount" > cur."min_amount"',
  gapLimit: 'gap."next_min" - t."max_amount" <= 1',
  overlapGuard:
    'AND NOT EXISTS ( SELECT 1 FROM "ad_package_tiers" AS other ' +
    'WHERE other."package_id" = t."package_id" ' +
    'AND other."duration_days" = t."duration_days" ' +
    'AND other."id" <> t."id" ' +
    'AND other."is_active" ' +
    'AND (other."max_amount" IS NULL OR other."max_amount" > other."min_amount") ' +
    'AND other."min_amount" < gap."next_min" ' +
    'AND (other."max_amount" IS NULL OR other."max_amount" > t."min_amount") )',
};

describe("ad package tier band gaps migration", () => {
  const sql = withoutComments(readMigration(MIGRATION));
  const statement = flat(sql);

  describe("SQL", () => {
    it("is a migration folder that runs after the launch migration", () => {
      // Prisma applies folders in name order; the tiers it fixes are inserted
      // by the launch migration. (A new folder must also sort after every
      // folder already applied, prisma/CLAUDE.md; that is checked at merge.)
      const folders = readdirSync(migrationsDir())
        .filter((name) => /^\d{14}_/.test(name))
        .sort();
      expect(folders.indexOf(MIGRATION)).toBeGreaterThan(
        folders.indexOf(LAUNCH_MIGRATION),
      );
      expect(folders.indexOf(LAUNCH_MIGRATION)).toBeGreaterThanOrEqual(0);
    });

    it("is one UPDATE of ad_package_tiers that sets max_amount only", () => {
      expect(sql.split(";").filter((part) => part.trim() !== "")).toHaveLength(
        1,
      );
      expect(statement).toMatch(/^UPDATE "ad_package_tiers" AS t SET /);
      const setClause = statement.slice(
        statement.indexOf(" SET ") + 5,
        statement.indexOf(" FROM "),
      );
      expect(setClause).toBe('"max_amount" = gap."next_min"');
      expect(statement).not.toMatch(
        /\b(INSERT|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i,
      );
      expect(statement.match(/\bUPDATE\b/gi)).toHaveLength(1);
    });

    it("widens to the lowest later lower bound of an active, non-empty sibling", () => {
      expect(statement).toContain(PINS.nextStart);
      expect(statement).toContain(PINS.liveTier);
    });

    it("closes a gap of at most 1 only", () => {
      expect(statement).toContain(`AND ${PINS.gapLimit}`);
    });

    it("guards with NOT EXISTS against any sibling overlapping the widened band", () => {
      expect(statement).toContain(PINS.overlapGuard);
    });

    it("has a dry run in the runbook that selects with the same conditions", () => {
      const runbook = readFileSync(
        join(repoRoot(), "docs/OPERATIONS.md"),
        "utf8",
      );
      const section = runbook.slice(
        runbook.indexOf("### Check: ad package tier bands"),
      );
      const start = section.indexOf("```sql");
      const query = flat(
        section.slice(start + 6, section.indexOf("```", start + 6)),
      );
      expect(start).toBeGreaterThan(0);
      expect(query).toMatch(/^SELECT /);
      expect(query).not.toMatch(/\b(UPDATE|INSERT|DELETE|ALTER|DROP)\b/i);
      for (const pin of Object.values(PINS)) expect(query).toContain(pin);
    });

    it("carries the rollback in its header", () => {
      const header = readMigration(MIGRATION);
      expect(header).toMatch(/-- ROLLBACK:/);
      expect(header).toMatch(
        /--\s+UPDATE "ad_package_tiers" SET "max_amount" = 999/,
      );
    });
  });

  describe("tiers of a new environment", () => {
    it("the launch rows leave [999, 1000) without a tier per duration", () => {
      const rows = launchTiers();
      expect(rows).toHaveLength(12);
      const gaps = byPackage(rows).flatMap((group) =>
        findBoostTierGaps(group).map((gap) => [
          gap.durationDays,
          gap.from.toNumber(),
          gap.to.toNumber(),
        ]),
      );
      expect(gaps).toEqual([
        [7, 999, 1000],
        [30, 999, 1000],
        [7, 999, 1000],
        [30, 999, 1000],
      ]);
    });

    it("after the migration the bands are 200-1000, 1000-5000, 5000-(none): no gap, no overlap", () => {
      const after = closeGaps(launchTiers());
      for (const group of byPackage(after)) {
        expect(findBoostTierGaps(group)).toEqual([]);
        expect(findBoostTierOverlaps(group)).toEqual([]);
        for (const durationDays of [7, 30]) {
          const bands = group
            .filter((tier) => tier.durationDays === durationDays)
            .map((tier) => [bound(tier.minAmount), bound(tier.maxAmount)]);
          expect(bands).toEqual([
            ["200.00", "1000.00"],
            ["1000.00", "5000.00"],
            ["5000.00", null],
          ]);
          for (const price of [200, 999, 999.99, 1000, 4999.99, 5000]) {
            expect(
              group.filter(
                (tier) =>
                  tier.durationDays === durationDays &&
                  boostTierCoversPrice(tier, price),
              ),
            ).toHaveLength(1);
          }
        }
      }
    });

    it("no seed or seed data writes ad packages, so the migrations are the only source", () => {
      // Every seed layer and its data under prisma/ (seed-edge/, uat/,
      // data/launch/), not the migrations. A nested write
      // (`adPackage.create({ data: { tiers } })`) names the package model too.
      const prismaDir = join(apiAppRoot(), "prisma");
      const sources = (
        readdirSync(prismaDir, { recursive: true }) as string[]
      ).filter(
        (path) => /\.(ts|json)$/.test(path) && !path.startsWith("migrations"),
      );
      expect(sources).toEqual(
        expect.arrayContaining(["seed.ts", "seed-production.ts"]),
      );
      // A seed that writes tiers must use contiguous half-open bands and be
      // covered here like the launch rows.
      const writers = sources.filter((path) =>
        /adPackage|ad_package/i.test(
          readFileSync(join(prismaDir, path), "utf8"),
        ),
      );
      expect(writers).toEqual([]);
    });
  });

  describe("rule", () => {
    const row = (
      id: string,
      minAmount: number,
      maxAmount: number | null,
      extra: Partial<Row> = {},
    ): Row => ({
      id,
      packageId: "p",
      durationDays: 7,
      minAmount: D(minAmount),
      maxAmount: maxAmount == null ? null : D(maxAmount),
      ...extra,
    });
    const maxOf = (rows: Row[], id: string) =>
      bound(rows.find((r) => r.id === id)?.maxAmount);

    it("leaves a gap wider than 1, inactive and empty tiers alone", () => {
      const after = closeGaps([
        row("wide", 200, 998.99),
        row("next", 1000, null),
        row("inactive", 0, 199.5, { isActive: false }),
        row("empty", 199, 199),
        row("other-duration", 0, 999.5, { durationDays: 30 }),
      ]);
      expect(maxOf(after, "wide")).toBe("998.99");
      expect(maxOf(after, "inactive")).toBe("199.50");
      expect(maxOf(after, "empty")).toBe("199.00");
      expect(maxOf(after, "other-duration")).toBe("999.50");
    });

    it("widens to the nearest later start and refuses an overlap with an active sibling", () => {
      const blocked = closeGaps([
        row("t", 200, 999),
        row("inside", 999.5, 999.8),
        row("next", 1000, null),
      ]);
      // "inside" starts above 999, so t would widen to 999.50 at most.
      expect(maxOf(blocked, "t")).toBe("999.50");
      const overlapping = closeGaps([
        row("t", 200, 999),
        row("cover", 100, 300),
        row("next", 1000, null),
      ]);
      expect(maxOf(overlapping, "t")).toBe("999.00");
      const inactiveCover = closeGaps([
        row("t", 200, 999),
        row("cover", 100, 300, { isActive: false }),
        row("next", 1000, null),
      ]);
      expect(maxOf(inactiveCover, "t")).toBe("1000.00");
    });

    it("never creates an overlap and changes nothing on a second run (random tiers)", () => {
      // mulberry32: deterministic, so a failure is reproducible.
      let seed = 0x5eed;
      const random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const pick = <T>(values: readonly T[]) =>
        values[Math.floor(random() * values.length)];
      // Bounds on a 0.5 grid so gaps of 0.5, 1 and 1.5 all occur.
      const amount = () => Math.floor(random() * 16) / 2;

      let widened = 0;
      for (let run = 0; run < 2000; run++) {
        const rows: Row[] = Array.from(
          { length: 2 + Math.floor(random() * 5) },
          (_, index) => {
            const min = amount();
            return {
              id: `r${index}`,
              packageId: pick(["a", "b"]),
              durationDays: pick([7, 30]),
              minAmount: D(min),
              maxAmount: random() < 0.2 ? null : D(min + amount()),
              isActive: random() > 0.2,
            };
          },
        );
        const once = closeGaps(rows);
        const twice = closeGaps(once);

        const before = overlapKeys(rows);
        for (const key of overlapKeys(once)) expect(before).toContain(key);
        expect(twice.map((r) => bound(r.maxAmount))).toEqual(
          once.map((r) => bound(r.maxAmount)),
        );
        once.forEach((tier, index) => {
          const old = rows[index];
          expect({ ...tier, maxAmount: null }).toEqual({
            ...old,
            maxAmount: null,
          });
          if (bound(tier.maxAmount) !== bound(old.maxAmount)) {
            widened++;
            const grew = D(tier.maxAmount!).minus(D(old.maxAmount!));
            expect(grew.gt(0) && grew.lte(1)).toBe(true);
            expect(boostTierBandIsEmpty(tier)).toBe(false);
          }
        });
      }
      // The random tiers exercise the widening, not only the no-op paths.
      expect(widened).toBeGreaterThan(100);
    });
  });
});
