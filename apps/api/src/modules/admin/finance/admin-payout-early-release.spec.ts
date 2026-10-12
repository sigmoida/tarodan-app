import { AdminPayoutService } from "./admin-payout.service";

/**
 * Erken bırakılan ödemeler: liste süzgeci SUNUCUDA (`releasedAt < releaseAt`,
 * Prisma alan referansı) uygulanır ki sayfalama/toplam doğru kalsın; Excel
 * dökümü aynı süzgeci paylaşır ve gün farkını tek helper'dan (`earlyReleaseDays`)
 * yazar — bkz. admin-payout-export.service.spec.
 */
describe("AdminPayoutService — erken bırakılanlar", () => {
  const RELEASE_AT_REF = { __ref: "payment_holds.release_at" };

  const makeService = (holds: unknown[] = []) => {
    const paymentHold = {
      findMany: jest.fn().mockResolvedValue(holds),
      count: jest.fn().mockResolvedValue(holds.length),
      // Prisma alan referansı: prisma.paymentHold.fields.releaseAt
      fields: { releaseAt: RELEASE_AT_REF },
    };
    const prisma = {
      paymentHold,
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminPayoutService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any, // payoutCore — bu spec'in konusu değil
      {} as any, // scheduledQueue
    );
    return { service, paymentHold };
  };

  it("earlyReleased=true: releasedAt < releaseAt alan referansıyla süzer (liste + sayım)", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsTransactions({ earlyReleased: true } as any);

    const expected = { releasedAt: { lt: RELEASE_AT_REF } };
    expect(paymentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expected) }),
    );
    // Sayım aynı where ile çalışır — toplam sayfalamayla tutarlı kalır.
    expect(paymentHold.count).toHaveBeenCalledWith({
      where: expect.objectContaining(expected),
    });
  });

  it("earlyReleased verilmezse releasedAt koşulu koymaz", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsTransactions({} as any);

    expect(paymentHold.findMany.mock.calls[0][0].where.releasedAt).toBe(
      undefined,
    );
  });

  it("diğer süzgeçlerle birleşir (durum + erken)", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsTransactions({
      earlyReleased: true,
      status: "released",
    } as any);

    expect(paymentHold.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        status: "released",
        releasedAt: { lt: RELEASE_AT_REF },
      }),
    );
  });
});
