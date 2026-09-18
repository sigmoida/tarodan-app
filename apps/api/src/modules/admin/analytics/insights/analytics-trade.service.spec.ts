import { OfferStatus, OrderOrigin } from "@prisma/client";
import { AnalyticsTradeService } from "./analytics-trade.service";

/** Önbellek testte şeffaf: her çağrı hesaplamaya iner. */
const passthroughCache = {
  getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
};

function buildService() {
  const calls: Array<{ model: string; args: unknown }> = [];
  const counter = (model: string) =>
    jest.fn((args: unknown) => {
      calls.push({ model, args });
      return Promise.resolve(0);
    });

  const prisma = {
    trade: { count: counter("trade") },
    offer: { count: counter("offer") },
    order: { count: counter("order") },
    tradeCashPayment: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: {
          tradeFeeAmount: "120.00",
          commission: "30.00",
          commissionTaxAmount: "6.00",
        },
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  return {
    calls,
    prisma,
    service: new AnalyticsTradeService(
      prisma as never,
      passthroughCache as never,
    ),
  };
}

const argsFor = (
  calls: Array<{ model: string; args: unknown }>,
  model: string,
) => calls.filter((call) => call.model === model).map((call) => call.args);

describe("AnalyticsTradeService", () => {
  const query = { from: "2026-06-01", to: "2026-06-30" };

  it("huninin her adımını KENDİ damgasından sayar", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const where = argsFor(calls, "trade").map(
      (args) => (args as { where: Record<string, unknown> }).where,
    );

    expect(where.some((w) => "createdAt" in w)).toBe(true);
    expect(where.some((w) => "acceptedAt" in w)).toBe(true);
    expect(where.some((w) => "completedAt" in w)).toBe(true);
    expect(where.some((w) => "rejectedAt" in w)).toBe(true);
  });

  /**
   * Ret `cancelledAt`i de yazar (para/stok akışı iptal yoluyla çözülür), bu
   * yüzden "iptal" çıkışı reddi İKİNCİ kez saymamak için daraltılmalı.
   */
  it("iptal çıkışından reddedilenleri ayırır", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const cancelled = argsFor(calls, "trade")
      .map((args) => (args as { where: Record<string, unknown> }).where)
      .find((where) => "cancelledAt" in where);

    expect(cancelled).toMatchObject({ rejectedAt: null });
  });

  /**
   * Kabul edilip ödeme penceresi dolan ya da iadeyle kapanan teklif durumunu
   * değiştirir — ama kabul GERÇEKLEŞMİŞTİR. Yalnız duruma bakan bir sayım
   * dönüşüm oranını sistematik olarak düşük gösterirdi.
   */
  it("kabul edilmiş teklifi durumdan VEYA siparişinden tanır", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const accepted = argsFor(calls, "offer")
      .map((args) => (args as { where: Record<string, unknown> }).where)
      .find((where) => "OR" in where);

    expect(accepted!.OR).toEqual([
      { status: OfferStatus.accepted },
      { order: { isNot: null } },
    ]);
  });

  it("cevap oranını bu dönemde AÇILAN tekliflerin kohortundan ölçer", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const responded = argsFor(calls, "offer")
      .map((args) => (args as { where: Record<string, unknown> }).where)
      .find((where) => "respondedAt" in where);

    // Payda da pay da aynı kohorta bakar: "bu dönemde açılan teklif".
    expect(responded).toMatchObject({ respondedAt: { not: null } });
    expect(responded).toHaveProperty("createdAt");
  });

  it("teklif siparişini teklifin kohortundan sayar", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    expect(argsFor(calls, "order")[0]).toMatchObject({
      where: { origin: OrderOrigin.offer },
    });
  });

  /**
   * v1 yüzde bazlı komisyon + KDV alıyordu, v2 sabit hizmet bedeli. Aynı
   * satırda ikisi birden dolu olamaz, bu yüzden üçünü toplamak çifte saymaz ve
   * `pricingVersion`a göre dallanmaya gerek kalmaz.
   */
  it("takas ücretini v1 ve v2 kalemlerini toplayarak bulur", async () => {
    const { service } = buildService();
    const result = await service.get(query);

    expect(result.metrics.tradeFeeRevenue.current).toBe(156);
  });

  it("karşılaştırma istenmedikçe önceki pencereyi ölçmez", async () => {
    const { calls, service } = buildService();
    await service.get(query);

    const created = argsFor(calls, "trade").filter(
      (args) => "createdAt" in (args as { where: Record<string, unknown> }).where,
    );
    expect(created).toHaveLength(1);

    const compared = buildService();
    await compared.service.get({ ...query, compare: true });
    expect(
      argsFor(compared.calls, "trade").filter(
        (args) =>
          "createdAt" in (args as { where: Record<string, unknown> }).where,
      ),
    ).toHaveLength(2);
  });
});
