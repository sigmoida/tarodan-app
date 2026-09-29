import { OrderOrigin, PaymentStatus } from "@prisma/client";
import { AnalyticsQualityService } from "./analytics-quality.service";

/** Önbellek testte şeffaf: her çağrı hesaplamaya iner. */
const passthroughCache = {
  getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
};

function buildService(counts: number[] = []) {
  const calls: Array<{ model: string; args: unknown }> = [];
  let index = 0;
  const counter = (model: string) =>
    jest.fn((args: unknown) => {
      calls.push({ model, args });
      return Promise.resolve(counts[index++] ?? 0);
    });

  const prisma = {
    order: { count: counter("order") },
    payment: { count: counter("payment") },
    refundRequest: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _count: { _all: 4 }, _sum: { amount: "800.00" } }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  return {
    calls,
    service: new AnalyticsQualityService(
      prisma as never,
      passthroughCache as never,
    ),
  };
}

const orderWheres = (calls: Array<{ model: string; args: unknown }>) =>
  calls
    .filter((call) => call.model === "order")
    .map((call) => (call.args as { where: Record<string, unknown> }).where);

describe("AnalyticsQualityService", () => {
  const query = { from: "2026-06-01", to: "2026-06-30" };

  /**
   * Payda ÖDENEN sipariştir. Açılan sipariş paydası ödenmemiş, terk edilmiş
   * sepetleri de sayıyordu: iptal oranı ödeme yapılmamış siparişlerle
   * seyreltiliyor, aynı ekranda satış sekmesinin "ödenen sipariş" sayısıyla da
   * karşılaştırılamıyordu.
   */
  it("iade ve iptal oranını AYNI ödenen-sipariş paydasına böler", async () => {
    // 1. sayım = ödenen sipariş (100), 2. sayım = iptal (5).
    const { service } = buildService([100, 5, 0, 0]);
    const result = await service.get(query);

    expect(result.metrics.paidOrders.current).toBe(100);
    expect(result.metrics.cancellationRate.current).toBe(5);
    // Aynı payda: 4 iade / 100 ödenen sipariş.
    expect(result.metrics.refundRate.current).toBe(4);
  });

  it("paydayı paylaşılan ödenmiş-sipariş yükleminden alır", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const paid = orderWheres(calls)[0];
    // `paidOrderWhere` imzası: sanal sipariş dışlanır, ödeme iki yoldan aranır.
    expect(paid.origin).toEqual({ not: OrderOrigin.platform_service });
    expect(JSON.stringify(paid)).toContain("paidAt");
    expect(JSON.stringify(paid)).toContain("checkoutGroup");
  });

  /** Artık AÇILAN siparişi sayan ikinci bir sorgu yok — tek payda, tek sorgu. */
  it("açılan sipariş sayımını hiç yapmaz", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const wheres = orderWheres(calls);
    expect(wheres).toHaveLength(2);
    expect(wheres.some((where) => "createdAt" in where)).toBe(false);
    expect(wheres.some((where) => "cancelledAt" in where)).toBe(true);
  });

  /**
   * Başarısız ödeme hiç `paidAt` almaz; deneme sayısı `createdAt`ten okunmalı,
   * yoksa oranın paydası kaybolur.
   */
  it("ödeme denemesini oluşturma anından sayar", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const attempts = calls
      .filter((call) => call.model === "payment")
      .map((call) => (call.args as { where: Record<string, unknown> }).where);

    expect(attempts[0]).toMatchObject({
      status: { in: [PaymentStatus.completed, PaymentStatus.failed] },
    });
    expect(attempts[0]).toHaveProperty("createdAt");
    expect(attempts[1]).toMatchObject({ status: PaymentStatus.failed });
  });
});
