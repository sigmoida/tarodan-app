import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import { AdminDashboardStockService } from "./dashboard/admin-dashboard-stock.service";
import { AnalyticsCatalogService } from "./insights/analytics-catalog.service";
import { AnalyticsMembershipService } from "./insights/analytics-membership.service";
import { AnalyticsQualityService } from "./insights/analytics-quality.service";
import { AnalyticsSalesService } from "./insights/analytics-sales.service";
import { AnalyticsTradeService } from "./insights/analytics-trade.service";
import {
  resolveAnalyticsRange,
  type ResolvedAnalyticsRange,
} from "./insights/analytics-range.helper";

/**
 * Test şeridi RAPORLARA girmez (bkz. account-lane/live-lane.where): PayTR test
 * modunda ödenen siparişte tahsilat yoktur; ciroya, hak edişe, üyelik/öne
 * çıkarma gelirine ya da stok sayılarına karışırsa rakam yalan söyler.
 *
 * Bu spec sorguların KENDİSİNİ yakalar: her Prisma çağrısının `where`'i ve her
 * ham SQL'in metni bir şerit koşulu taşımak zorunda. Yeni bir metrik şerit
 * filtresi unutularak eklenirse burada kırmızıya döner.
 */

interface Captured {
  model: string;
  method: string;
  args: unknown;
}

/** Nested `Prisma.Sql` değerleri dahil ham SQL'in düz metni. */
function sqlText(strings: readonly string[], values: unknown[]): string {
  return strings
    .map((part, index) => {
      const value = values[index];
      // Prisma.Sql şekli (`sql` metni): iç içe parçalar oluşturulurken düzleşir.
      const rendered =
        value && typeof value === "object" && "sql" in value
          ? String((value as { sql: unknown }).sql)
          : "";
      return part + rendered;
    })
    .join("");
}

function capturingPrisma() {
  const calls: Captured[] = [];
  const raws: string[] = [];

  const resultOf = (method: string): unknown => {
    switch (method) {
      case "count":
        return 0;
      case "aggregate":
        return { _sum: {}, _avg: {}, _min: {}, _count: { _all: 0, id: 0 } };
      case "groupBy":
      case "findMany":
        return [];
      default:
        return null;
    }
  };

  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => (args: unknown) => {
          calls.push({ model, method, args });
          return Promise.resolve(resultOf(method));
        },
      },
    );

  const prisma = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        if (property === "$queryRaw") {
          return (strings: TemplateStringsArray, ...values: unknown[]) => {
            raws.push(sqlText(strings, values));
            return Promise.resolve([]);
          };
        }
        if (property === "$transaction") {
          return (queries: Array<Promise<unknown>>) => Promise.all(queries);
        }
        return delegate(property);
      },
    },
  );

  return { prisma, calls, raws };
}

const cache = {
  getOrSet: <T>(_key: string, factory: () => Promise<T>) => factory(),
  delPattern: jest.fn(),
  del: jest.fn(),
};

const LANE_IN_WHERE = /"isTest(Account)?":(false|true)/;
const LANE_IN_SQL = /"is_test(_account)?" = (false|true)/;

function expectLaneEverywhere(calls: Captured[], raws: string[]) {
  const unfiltered = calls
    .filter(({ method }) => method !== "findUnique")
    .filter(({ args }) => !LANE_IN_WHERE.test(JSON.stringify(args ?? {})))
    .map(
      ({ model, method, args }) => `${model}.${method} ${JSON.stringify(args)}`,
    );
  expect(unfiltered).toEqual([]);

  const unfilteredSql = raws.filter((sql) => !LANE_IN_SQL.test(sql));
  expect(unfilteredSql).toEqual([]);
}

const NOW = new Date("2026-09-22T09:00:00.000Z");
const RANGE: ResolvedAnalyticsRange = resolveAnalyticsRange(undefined, NOW);

type Computable = { compute(range: ResolvedAnalyticsRange): Promise<unknown> };

describe("test lane is excluded from analytics insights", () => {
  it.each([
    ["sales", AnalyticsSalesService],
    ["trade", AnalyticsTradeService],
    ["catalog", AnalyticsCatalogService],
    ["quality", AnalyticsQualityService],
    ["membership", AnalyticsMembershipService],
  ] as const)("%s tab filters every query", async (_tab, Service) => {
    const { prisma, calls, raws } = capturingPrisma();
    const service = new Service(prisma as never, cache as never);
    await (service as unknown as Computable).compute(RANGE);

    expect(calls.length + raws.length).toBeGreaterThan(0);
    expectLaneEverywhere(calls, raws);
  });
});

describe("test lane is excluded from the dashboard", () => {
  const window = { gte: new Date("2026-09-01T00:00:00Z"), lte: NOW };

  it.each([
    ["a period window", window],
    ["all time", undefined],
  ] as const)(
    "every period-summary metric definition filters the lane (%s)",
    async (_label, w) => {
      const { prisma, calls, raws } = capturingPrisma();
      const service = new AdminAnalyticsDashboardService(
        prisma as never,
        {} as never,
        cache as never,
      );
      const definitions = (
        service as unknown as {
          metricDefinitions(): Record<
            string,
            { query: (w: unknown) => unknown }
          >;
        }
      ).metricDefinitions();

      for (const definition of Object.values(definitions)) {
        await definition.query(w);
      }

      expect(Object.keys(definitions).length).toBeGreaterThan(20);
      expectLaneEverywhere(calls, raws);
    },
  );

  it("the dashboard widgets (recent orders, top products/sellers) skip test rows", async () => {
    const { prisma, calls, raws } = capturingPrisma();
    const service = new AdminAnalyticsDashboardService(
      prisma as never,
      { resolveProductImageUrl: () => null } as never,
      cache as never,
    );
    await service.getRecentOrders(5);
    await service.getTopProducts(5);
    await service.getTopSellers(5);
    await service.getCommissionRevenue({});
    expectLaneEverywhere(calls, raws);
  });

  it("the stock zone counts live escrow, listings, memberships and boosts only", async () => {
    const { prisma, calls, raws } = capturingPrisma();
    const service = new AdminDashboardStockService(
      prisma as never,
      cache as never,
    );
    await service.getStock();
    // Satıcı borcu (adjustment) satıcıya Prisma ilişkisi taşımıyor — şerit
    // süzülemiyor; test şeridinde payout olmadığı için borç da pratikte doğmaz.
    const lanes = calls.filter(
      ({ model }) =>
        model !== "membershipTier" && model !== "sellerAccountAdjustment",
    );
    expectLaneEverywhere(lanes, raws);
  });
});
