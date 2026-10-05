import { ListingRemovalReason } from "@prisma/client";
import { LISTING_REMOVAL_REASONS } from "@tarodan/types";
import {
  AdminDashboardRemovalsService,
  buildListingRemovalBreakdown,
} from "./admin-dashboard-removals.service";
import { resolveDashboardRange } from "../dashboard-period.helper";
import { istanbulDayStart } from "../../../../common/helpers/tr-calendar";

/**
 * Zone C kırılımı: seçili dönemde vitrinden düşen ilanlar, nedene ve (başka
 * platformda satışta) platforma göre. OLAY damgası (`createdAt` = kaldırma
 * anı) ile sayılır, sunucu tarafında gruplanır, test şeridi hariç.
 */
describe("buildListingRemovalBreakdown", () => {
  const now = new Date("2026-10-05T09:00:00.000Z");
  const range = resolveDashboardRange({ period: "daily" }, now);
  const counted = (n: number) => ({ _count: { _all: n } });

  it("her nedeni katalog sırasıyla, sıfırlar dahil ve aktörüyle döner; toplam = olay sayısı", () => {
    const result = buildListingRemovalBreakdown(range, {
      byReason: [
        { reason: "sold_elsewhere", ...counted(4) },
        { reason: "expired", ...counted(2) },
        { reason: "policy_violation", ...counted(1) },
      ],
      byPlatform: [],
      byViolation: [],
    });

    expect(result.byReason.map((row) => row.reason)).toEqual([
      ...LISTING_REMOVAL_REASONS,
    ]);
    expect(result.byReason.find((r) => r.reason === "sold_elsewhere")).toEqual({
      reason: "sold_elsewhere",
      actor: "seller",
      count: 4,
    });
    expect(result.byReason.find((r) => r.reason === "expired")).toEqual({
      reason: "expired",
      actor: "system",
      count: 2,
    });
    expect(
      result.byReason.find((r) => r.reason === "changed_mind")?.count,
    ).toBe(0);
    expect(result.total).toBe(7);
    expect(result.range).toEqual({
      type: "daily",
      from: range.current.gte.toISOString(),
      to: range.current.lte.toISOString(),
    });
  });

  it("başka platformda satış her platformu gösterir; katalog dışı/boş platform 'other'a eklenir", () => {
    const result = buildListingRemovalBreakdown(range, {
      byReason: [{ reason: "sold_elsewhere", ...counted(6) }],
      byPlatform: [
        { platform: "dolap", ...counted(3) },
        { platform: "letgo", ...counted(1) },
        { platform: "other", ...counted(1) },
        { platform: "removed_from_catalog", ...counted(1) },
      ],
      byViolation: [],
    });

    expect(result.soldElsewhereByPlatform).toEqual([
      { platform: "letgo", count: 1 },
      { platform: "instagram", count: 0 },
      { platform: "dolap", count: 3 },
      { platform: "sahibinden", count: 0 },
      { platform: "in_person", count: 0 },
      { platform: "other", count: 2 },
    ]);
  });

  it("süresi dolup sonra 'başka platformda sattım' diye silinen ilan: toplamda bir kez (süresi doldu), platform kırılımında bir kez", () => {
    // Sorgu katmanı: toplam yalnız vitrinden düşüşü (expired) görür; platform
    // sorgusu geç cevabı da görür. İki ayrı gruplama sonucu birleşince:
    const result = buildListingRemovalBreakdown(range, {
      byReason: [{ reason: "expired", ...counted(1) }],
      byPlatform: [{ platform: "dolap", ...counted(1) }],
      byViolation: [],
    });

    expect(result.total).toBe(1);
    expect(result.byReason.find((r) => r.reason === "expired")?.count).toBe(1);
    expect(
      result.byReason.find((r) => r.reason === "sold_elsewhere")?.count,
    ).toBe(0);
    expect(
      result.soldElsewhereByPlatform.find((p) => p.platform === "dolap")?.count,
    ).toBe(1);
  });

  it("takasla düşen ilan kendi satırında 'traded' olarak, 'stok tükendi'den ayrı sayılır", () => {
    const result = buildListingRemovalBreakdown(range, {
      byReason: [
        { reason: "traded", ...counted(3) },
        { reason: "out_of_stock", ...counted(2) },
      ],
      byPlatform: [],
      byViolation: [],
    });

    expect(result.byReason.find((r) => r.reason === "traded")).toEqual({
      reason: "traded",
      actor: "system",
      count: 3,
    });
    expect(result.byReason.find((r) => r.reason === "out_of_stock")?.count).toBe(
      2,
    );
    expect(result.total).toBe(5);
  });

  it("ihlal kodları çoktan aza; kodsuz (eski) red null olarak kalır", () => {
    const result = buildListingRemovalBreakdown(range, {
      byReason: [{ reason: "policy_violation", ...counted(5) }],
      byPlatform: [],
      byViolation: [
        { violationCode: null, ...counted(1) },
        { violationCode: "counterfeit_replica", ...counted(3) },
        { violationCode: "duplicate_listing", ...counted(1) },
      ],
    });

    expect(result.byViolation).toEqual([
      { violationCode: "counterfeit_replica", count: 3 },
      { violationCode: null, count: 1 },
      { violationCode: "duplicate_listing", count: 1 },
    ]);
  });
});

describe("AdminDashboardRemovalsService", () => {
  const makeService = () => {
    const groupBy = jest.fn(async ({ by }: { by: string[] }) => {
      if (by[0] === "reason") {
        return [
          { reason: ListingRemovalReason.sold_elsewhere, _count: { _all: 2 } },
          { reason: ListingRemovalReason.out_of_stock, _count: { _all: 1 } },
        ];
      }
      if (by[0] === "platform") {
        return [{ platform: "instagram", _count: { _all: 2 } }];
      }
      return [];
    });
    const prisma = {
      productRemovalEvent: { groupBy },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const cache = {
      // Gerçek imza: (anahtar, üretici, { ttl }) — servis üçünü de geçirir.
      getOrSet: jest.fn(
        async (
          _key: string,
          factory: () => Promise<unknown>,
          _options?: { ttl?: number },
        ) => factory(),
      ),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const service = new AdminDashboardRemovalsService(
      prisma as any,
      cache as any,
    );
    return { service, groupBy, cache };
  };

  it("seçili dönemi OLAY anıyla (createdAt) süzer ve test şeridini dışlar", async () => {
    const { service, groupBy } = makeService();

    const result = await service.getRemovals({
      period: "custom",
      from: "2025-09-01",
      to: "2025-09-30",
    });

    const reasonCall = groupBy.mock.calls.find(
      ([args]) => (args as { by: string[] }).by[0] === "reason",
    )![0] as any;
    expect(reasonCall.where.createdAt.gte).toEqual(
      istanbulDayStart("2025-09-01"),
    );
    expect(reasonCall.where.product).toEqual({
      seller: { isTestAccount: false },
    });
    // Yalnız vitrinden düşüşler sayılır (kayıt anında yazılan bayrak).
    expect(reasonCall.where.fromStorefront).toBe(true);
    // Platform ve ihlal kırılımları aynı pencereden, kendi nedenleriyle.
    const platformCall = groupBy.mock.calls.find(
      ([args]) => (args as { by: string[] }).by[0] === "platform",
    )![0] as any;
    // Platform kırılımı: aynı pencere + test şeridi hariç; vitrinden düşüşler
    // YA DA geç gelen "başka platformda sattım" cevapları. `fromStorefront`
    // tek başına süzmez (toplam gibi) — yoksa geç cevap kaybolurdu.
    expect(platformCall.where).toEqual({
      reason: ListingRemovalReason.sold_elsewhere,
      createdAt: reasonCall.where.createdAt,
      product: reasonCall.where.product,
      OR: [{ fromStorefront: true }, { lateSoldElsewhere: true }],
    });
    const violationCall = groupBy.mock.calls.find(
      ([args]) => (args as { by: string[] }).by[0] === "violationCode",
    )![0] as any;
    expect(violationCall.where.reason).toBe(
      ListingRemovalReason.policy_violation,
    );

    expect(result.total).toBe(3);
    expect(
      result.soldElsewhereByPlatform.find((p) => p.platform === "instagram")
        ?.count,
    ).toBe(2);
  });

  it("kapalı özel aralık uzun TTL ile, kendi önekiyle önbelleğe alınır", async () => {
    const { service, cache } = makeService();

    await service.getRemovals({
      period: "custom",
      from: "2025-09-01",
      to: "2025-09-30",
    });

    const [key, , options] = cache.getOrSet.mock.calls[0];
    expect(key).toMatch(/^admin:dashboard:removals:v2:custom:/);
    expect(options).toEqual({
      ttl: AdminDashboardRemovalsService.CLOSED_RANGE_CACHE_TTL_SECONDS,
    });
  });

  it("'yenile' kırılımın önbelleğini düşürür", async () => {
    const { service, cache } = makeService();
    await service.invalidate();
    expect(cache.delPattern).toHaveBeenCalledWith(
      "admin:dashboard:removals:v2:*",
    );
  });
});
