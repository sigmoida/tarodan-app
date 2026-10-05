import { AdminPayoutService } from "./admin-payout.service";

/**
 * Erken bırakılan ödemeler: liste süzgeci SUNUCUDA (`releasedAt < releaseAt`,
 * Prisma alan referansı) uygulanır ki sayfalama/toplam doğru kalsın; CSV aynı
 * süzgeci paylaşır ve gün farkını tek helper'dan (`earlyReleaseDays`) yazar.
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

  it("CSV aynı süzgeci kullanır", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsExport({ earlyReleased: true } as any);

    expect(paymentHold.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ releasedAt: { lt: RELEASE_AT_REF } }),
    );
  });

  it("CSV hem planlanan hem gerçek tarihi ve erken gün farkını yazar", async () => {
    const hold = (over: Record<string, unknown>) => ({
      id: "h",
      orderId: "o",
      sellerId: "s",
      amount: 100,
      status: "released",
      releaseAt: null,
      releasedAt: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      seller: { displayName: "Satıcı", email: "s@x.com" },
      ...over,
    });
    const { service } = makeService([
      hold({
        id: "early",
        releaseAt: new Date("2026-10-12T09:00:00.000Z"),
        releasedAt: new Date("2026-10-07T09:00:00.000Z"),
      }),
      hold({
        id: "late",
        releaseAt: new Date("2026-10-12T09:00:00.000Z"),
        releasedAt: new Date("2026-10-13T09:00:00.000Z"),
      }),
    ]);

    const { csv } = await service.getPayoutsExport({} as any);
    const [header, early, late] = csv.split("\n");
    const cols = header.split(",");
    const idx = cols.indexOf("earlyReleaseDays");

    expect(cols).toEqual(
      expect.arrayContaining(["releaseAt", "releasedAt", "earlyReleaseDays"]),
    );
    expect(early.split(",")[idx]).toBe("5");
    expect(late.split(",")[idx]).toBe("");
  });
});
