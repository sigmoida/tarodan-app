import { AdminPayoutService } from "./admin-payout.service";

/**
 * Payouts sayfasının yeni yüzeyleri: gerçek banka TRANSFERLERİ ve satıcı BORÇ
 * mahsupları. İkisinin de admin yüzeyi yoktu — başarısız/iade dönen transfer ve
 * payout'tan kesilecek borçlar görünmez paraydı.
 */
describe("AdminPayoutService — transfer ve borç listeleri", () => {
  const makeService = (overrides: Record<string, unknown> = {}) => {
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      sellerAccountAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
    const service = new AdminPayoutService(prisma as any, {} as any, {} as any);
    return { service, prisma };
  };

  it("transfer listesi: status=all filtre koymaz, spesifik status koyar", async () => {
    const { service, prisma } = makeService();

    await service.getPayoutTransfers({ status: "all", page: 1, limit: 20 });
    expect(
      prisma.payoutTransfer.findMany.mock.calls[0][0].where.status,
    ).toBeUndefined();

    await service.getPayoutTransfers({ status: "failed", page: 1, limit: 20 });
    expect(prisma.payoutTransfer.findMany.mock.calls[1][0].where.status).toBe(
      "failed",
    );
  });

  it("borç listesi: status=open yalnız açık borçları getirir", async () => {
    const { service, prisma } = makeService();

    await service.getPayoutAdjustments({ status: "open", page: 1, limit: 20 });

    expect(
      prisma.sellerAccountAdjustment.findMany.mock.calls[0][0].where.status,
    ).toBe("open");
  });
});

/**
 * Özet kartları escrow gerçeğine göre ayrışır: held (bekleyen) / released ama
 * henüz TRANSFER EDİLMEMİŞ / gerçekten transfer edilen / başarısız transfer.
 * Eski "Ödenen" kartı released hold toplamıydı — para henüz bankaya gitmemiş
 * olabilirdi.
 */
describe("AdminPayoutService.getPayoutsSummary — transfer ayrışması", () => {
  it("released-bekleyen, transfer edilen ve başarısız transfer alanlarını döndürür", async () => {
    const prisma = {
      paymentHold: {
        aggregate: jest
          .fn()
          // held → released → releasedAwaitingTransfer sırasıyla
          .mockResolvedValueOnce({ _sum: { amount: 1000 } })
          .mockResolvedValueOnce({ _sum: { amount: 700 } })
          .mockResolvedValueOnce({ _sum: { amount: 300 } }),
        count: jest
          .fn()
          .mockResolvedValueOnce(4) // held
          .mockResolvedValueOnce(3), // released
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { netAmount: 400 }, _count: { id: 2 } }),
        count: jest.fn().mockResolvedValue(1), // failed/returned
      },
    };
    const service = new AdminPayoutService(prisma as any, {} as any, {} as any);

    const result = await service.getPayoutsSummary();

    expect(result).toMatchObject({
      totalPending: 1000,
      totalReleased: 700,
      releasedAwaitingTransfer: 300,
      transferredTotal: 400,
      transferredCount: 2,
      failedTransferCount: 1,
    });
    // released ama tamamlanmış transferi OLMAYAN hold'lar sorgulanmalı.
    const awaitingWhere = prisma.paymentHold.aggregate.mock.calls[2][0].where;
    expect(awaitingWhere.status).toBe("released");
    expect(awaitingWhere.OR).toBeDefined();
  });
});
