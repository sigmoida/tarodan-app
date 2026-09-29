import { FinanceReconciliationService } from "./finance-reconciliation.service";
import { RevenueSplitService } from "./revenue-split.service";

/**
 * Mutabakat YALNIZ canlı şeridi raporlar. Bir bölümün Σ toplamı bileşenlerinden
 * farklı bir filtreden geçerse ilk test siparişinde sahte fark alarmı çıkar —
 * bu yüzden şerit predicate'i HER aggregate'e uygulanmalıdır.
 */
describe("FinanceReconciliationService — test lane", () => {
  /** Her prisma.<model>.aggregate çağrısının `where`'ini toplayan casus. */
  const build = () => {
    const seen: Array<{ model: string; where: unknown }> = [];
    const agg = (model: string) =>
      jest.fn(async (args: any) => {
        seen.push({ model, where: args?.where });
        return { _sum: {}, _count: { id: 0 } };
      });
    const models = [
      "paymentHold",
      "payoutTransfer",
      "tradeCashPayment",
      "commissionLedger",
      "order",
      "refundFinancialComponent",
      "refundAttempt",
      "refundRequest",
      "ledgerEntry",
      "paytrStatementLine",
      "paytrSettlement",
      "payment",
      "membershipPayment",
    ];
    const prisma: Record<string, any> = {
      // S1 fiziksel bölünme tek SQL — şeridi WHERE is_test = false ile süzer.
      $queryRaw: jest.fn(async () => [{}]),
    };
    for (const m of models)
      prisma[m] = { aggregate: agg(m), findFirst: jest.fn(async () => null) };
    const config = { get: () => undefined } as never;
    // S1 de gerçek servisle koşar: Σ ile bileşenlerin aynı filtreden geçmesi şart.
    const revenueSplit = new RevenueSplitService(prisma as never, config);
    const service = new FinanceReconciliationService(
      prisma as never,
      config,
      revenueSplit,
    );
    return { service, seen, prisma };
  };

  const json = (v: unknown) => JSON.stringify(v ?? {});

  it("applies a lane filter to every money aggregate", async () => {
    const { service, seen } = build();
    await service.build();

    expect(seen.length).toBeGreaterThan(10);
    const unfiltered = seen.filter(({ model, where }) => {
      // paytr* tabloları PSP'nin kendi ekstresi — şerit damgası taşımaz.
      if (model.startsWith("paytr")) return false;
      const w = json(where);
      return !(
        w.includes('"isTest":false') ||
        w.includes('"isTestAccount":false') ||
        w.includes('"isTest":true') // NOT { ... isTest: true } (payout elemesi)
      );
    });
    expect(unfiltered.map((u) => `${u.model} ${json(u.where)}`)).toEqual([]);
  });

  it("keeps the S2 total on the same filter as its components", async () => {
    const { service, seen } = build();
    await service.build();
    const holds = seen.filter((s) => s.model === "paymentHold");
    // Σ toplamı dahil hepsi canlı ödemeye bağlı.
    expect(holds.length).toBeGreaterThan(1);
    for (const h of holds) {
      expect(json(h.where)).toContain('"isTest":false');
    }
  });
});
