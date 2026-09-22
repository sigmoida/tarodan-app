import { PspReconciliationService } from "./psp-reconciliation.service";

/**
 * PayTR durum-sorgu/yetim-kurtarma tarayıcıları yalnız canlı şeridi görür:
 * test-modu işlemler PayTR'nin canlı raporlarında yoktur ve bir test ödemesi
 * asla "gerçekte tahsil edilmiş" diye kurtarılmamalıdır.
 */
describe("PspReconciliationService — test lane exclusion", () => {
  const build = () => {
    const prisma = { payment: { findMany: jest.fn().mockResolvedValue([]) } };
    const config = { get: jest.fn(() => undefined) };
    const service = new PspReconciliationService(
      prisma as never,
      {} as never,
      config as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  };

  it("reconcilePendingPaytrPayments scans live payments only", async () => {
    const { service, prisma } = build();
    await service.reconcilePendingPaytrPayments();
    expect(prisma.payment.findMany.mock.calls[0][0].where).toMatchObject({
      provider: "paytr",
      isTest: false,
    });
  });

  it("detectOrphanCapturedFailedPayments scans live payments only", async () => {
    const { service, prisma } = build();
    await service.detectOrphanCapturedFailedPayments();
    expect(prisma.payment.findMany.mock.calls[0][0].where).toMatchObject({
      provider: "paytr",
      isTest: false,
    });
  });
});
