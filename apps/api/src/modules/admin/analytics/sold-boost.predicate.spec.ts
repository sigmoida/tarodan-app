import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import { AnalyticsCatalogService } from "./insights/analytics-catalog.service";
import { resolveAnalyticsRange } from "./insights/analytics-range.helper";
import { SOLD_BOOST, soldBoostSql } from "./sold-boost.predicate";

/**
 * A free staff grant is no boost sale (decision D3): every boost count,
 * revenue and uplift query of the dashboard and the catalog tab reads bought
 * boosts only. This spec captures the queries themselves, so a new boost
 * metric that forgets the rule turns it red.
 */

function sqlOf(strings: readonly string[], values: unknown[]): string {
  return strings
    .map((part, i) => {
      const value = values[i];
      // A nested Prisma.Sql fragment renders its own text.
      return (
        part +
        (value && typeof value === "object" && "sql" in value
          ? String((value as { sql: unknown }).sql)
          : "")
      );
    })
    .join("");
}

function capturingPrisma() {
  const boostCalls: unknown[] = [];
  const raws: string[] = [];
  const result = (method: string) =>
    method === "count"
      ? 0
      : method === "aggregate"
        ? { _sum: {}, _avg: {}, _count: { _all: 0 } }
        : method === "findMany" || method === "groupBy"
          ? []
          : null;
  const prisma = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === "$queryRaw") {
          return (strings: TemplateStringsArray, ...values: unknown[]) => {
            raws.push(sqlOf(strings, values));
            return Promise.resolve([]);
          };
        }
        if (model === "$transaction") {
          return (queries: Array<Promise<unknown>>) => Promise.all(queries);
        }
        return new Proxy(
          {},
          {
            get: (_m, method: string) => (args: unknown) => {
              if (model === "productBoost") boostCalls.push(args);
              return Promise.resolve(result(method));
            },
          },
        );
      },
    },
  );
  return { prisma, boostCalls, raws };
}

const cache = {
  getOrSet: <T>(_key: string, factory: () => Promise<T>) => factory(),
};

describe("sold boost predicate", () => {
  it("is a bought boost, in Prisma and in SQL", () => {
    expect(SOLD_BOOST).toEqual({ source: "purchase" });
    const sql = soldBoostSql("b");
    expect(sql.text).toBe('"b"."source" = $1::"BoostSource"');
    expect(sql.values).toEqual(["purchase"]);
  });

  it("the catalog tab counts, sums and averages bought boosts only", async () => {
    const { prisma, boostCalls, raws } = capturingPrisma();
    const service = new AnalyticsCatalogService(
      prisma as never,
      cache as never,
    );

    await (
      service as unknown as { compute(range: unknown): Promise<unknown> }
    ).compute(
      resolveAnalyticsRange(undefined, new Date("2026-10-21T12:00:00Z")),
    );

    expect(boostCalls.length).toBeGreaterThan(0);
    for (const args of boostCalls) {
      expect(JSON.stringify(args)).toContain('"source":"purchase"');
    }
    const boostSql = raws.filter((sql) => sql.includes('"product_boosts"'));
    // Uplift, the revenue series and the package breakdown.
    expect(boostSql).toHaveLength(3);
    for (const sql of boostSql) expect(sql).toMatch(/"source" = /);
  });

  it("the dashboard's boost revenue and count read bought boosts only", async () => {
    const { prisma, boostCalls } = capturingPrisma();
    const service = new AdminAnalyticsDashboardService(
      prisma as never,
      {} as never,
      cache as never,
    );
    const definitions = (
      service as unknown as {
        metricDefinitions(): Record<string, { query: (w: unknown) => unknown }>;
      }
    ).metricDefinitions();

    await definitions.boostRevenue.query(undefined);
    await definitions.boostCount.query(undefined);

    expect(boostCalls).toHaveLength(2);
    for (const args of boostCalls) {
      expect(JSON.stringify(args)).toContain('"source":"purchase"');
    }
  });
});
