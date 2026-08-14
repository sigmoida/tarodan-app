import { AdminPayoutService } from "../finance/admin-payout.service";
import { PaymentStatus, TradeStatus } from "@prisma/client";

/**
 * Admin manuel takas escrow release sözleşmesi:
 *  - MONEY-M8: yalnız `completed` takasta serbest bırakılır.
 *  - Sebep zorunlu + audit (sipariş tarafındaki releasePayout ile simetri).
 *  - Güncelleme FİLTRELİ: yalnız damgalı (holdReleaseAt dolu, süresi geçmiş),
 *    henüz açılmamış/iade edilmemiş satırlar. Damgasız satır = hâlâ iade borcu
 *    (compensate_* çözümünde mağdurun satırı) — dokunulmaz.
 */
describe("AdminPayoutService.releaseTradePaymentHold", () => {
  const makeService = (
    tradeStatus: TradeStatus | null,
    releasedCount = 1,
    existingRows: Array<{
      releasedAt: Date | null;
      refundedAt: Date | null;
    }> = [{ releasedAt: null, refundedAt: null }],
  ) => {
    const prisma = {
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: releasedCount }),
        findMany: jest.fn().mockResolvedValue(existingRows),
      },
      trade: {
        findUnique: jest
          .fn()
          .mockResolvedValue(tradeStatus ? { status: tradeStatus } : null),
      },
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminPayoutService(
      prisma as any,
      audit as any,
      {} as any, // paymentService
    );
    return { service, prisma, audit };
  };

  it("sebep verilmezse reddeder, hiçbir satıra dokunmaz", async () => {
    const { service, prisma } = makeService(TradeStatus.completed);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1", "  "),
    ).rejects.toThrow();
    expect(prisma.tradeCashPayment.updateMany).not.toHaveBeenCalled();
  });

  it("disputed takas: reddeder, releasedAt YAZILMAZ", async () => {
    const { service, prisma } = makeService(TradeStatus.disputed);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1", "manuel"),
    ).rejects.toThrow();
    expect(prisma.tradeCashPayment.updateMany).not.toHaveBeenCalled();
  });

  it("returning takas: reddeder", async () => {
    const { service, prisma } = makeService(TradeStatus.returning);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1", "manuel"),
    ).rejects.toThrow();
    expect(prisma.tradeCashPayment.updateMany).not.toHaveBeenCalled();
  });

  it("completed takas: yalnız damgalı ve süresi dolmuş satırları serbest bırakır", async () => {
    const { service, prisma, audit } = makeService(TradeStatus.completed);

    const res = await service.releaseTradePaymentHold(
      "admin-1",
      "trade-1",
      "cron kaçırdı",
    );

    expect(res.success).toBe(true);
    expect(res.releasedRows).toBe(1);
    const call = prisma.tradeCashPayment.updateMany.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        tradeId: "trade-1",
        status: PaymentStatus.completed,
        releasedAt: null,
        refundedAt: null,
      }),
    );
    // İADE BORCU KORUMASI: damgasız satır (holdReleaseAt=null) kapsam dışı,
    // ve süresi dolmamış damga da açılmaz.
    expect(call.where.holdReleaseAt).toEqual({
      not: null,
      lte: expect.any(Date),
    });
    expect(call.data).toEqual({ releasedAt: expect.any(Date) });
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_cash_hold_release",
      "Trade",
      "trade-1",
      expect.objectContaining({ reason: "cron kaçırdı" }),
      expect.objectContaining({ releasedRows: 1 }),
    );
  });

  it("uygun satır yoksa (ör. compensate_both sonrası) hata verir", async () => {
    const { service, audit } = makeService(TradeStatus.completed, 0);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1", "manuel"),
    ).rejects.toThrow();
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("force (erken bırakma): süre şartını esnetir ama damga şartı KALIR", async () => {
    const { service, prisma, audit } = makeService(TradeStatus.completed);

    const res = await service.releaseTradePaymentHold(
      "admin-1",
      "trade-1",
      "iki taraf teyit etti",
      true,
    );

    expect(res.success).toBe(true);
    const call = prisma.tradeCashPayment.updateMany.mock.calls[0][0];
    // Erken bırakmada lte yok — ama damgasız (iade borçlu) satırlar yine kapsam dışı.
    expect(call.where.holdReleaseAt).toEqual({ not: null });
    expect(call.where).toEqual(
      expect.objectContaining({ releasedAt: null, refundedAt: null }),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_cash_hold_release",
      "Trade",
      "trade-1",
      expect.objectContaining({ action: "force_release_early" }),
      expect.objectContaining({ force: true }),
    );
  });

  it("force bile disputed takası açamaz (MONEY-M8 önce gelir)", async () => {
    const { service, prisma } = makeService(TradeStatus.disputed);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1", "manuel", true),
    ).rejects.toThrow();
    expect(prisma.tradeCashPayment.updateMany).not.toHaveBeenCalled();
  });

  it("tüm satırlar zaten kapanmışsa idempotent başarı döner (retry/çift tıklama)", async () => {
    const { service, audit } = makeService(TradeStatus.completed, 0, [
      { releasedAt: new Date(), refundedAt: null },
      { releasedAt: null, refundedAt: new Date() },
    ]);

    const res = await service.releaseTradePaymentHold(
      "admin-1",
      "trade-1",
      "manuel",
    );

    expect(res.success).toBe(true);
    expect(res.releasedRows).toBe(0);
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });
});
