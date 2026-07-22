import { AdminPayoutService } from "./admin-payout.service";
import { TradeStatus } from "@prisma/client";

/**
 * MONEY-M8: admin releaseTradePaymentHold artık yalnız `completed` takasta nakit hold'u
 * serbest bırakır. Aksi halde (disputed/returning/...) recipient'e ödenir ve takas sonradan
 * iade/iptal olursa çift kayıp olur.
 */
describe("AdminPayoutService.releaseTradePaymentHold — MONEY-M8 trade-status guard", () => {
  const makeService = (tradeStatus: TradeStatus | null) => {
    const prisma = {
      tradeCashPayment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "tcp-1",
          releasedAt: null,
          refundedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      trade: {
        findUnique: jest
          .fn()
          .mockResolvedValue(tradeStatus ? { status: tradeStatus } : null),
      },
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminPayoutService(
      prisma as any,
      audit as any,
      {} as any, // paymentService
    );
    return { service, prisma };
  };

  it("disputed takas: reddeder, releasedAt YAZILMAZ", async () => {
    const { service, prisma } = makeService(TradeStatus.disputed);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1"),
    ).rejects.toThrow();
    expect(prisma.tradeCashPayment.update).not.toHaveBeenCalled();
  });

  it("returning takas: reddeder", async () => {
    const { service, prisma } = makeService(TradeStatus.returning);

    await expect(
      service.releaseTradePaymentHold("admin-1", "trade-1"),
    ).rejects.toThrow();
    expect(prisma.tradeCashPayment.update).not.toHaveBeenCalled();
  });

  it("completed takas: serbest bırakır", async () => {
    const { service, prisma } = makeService(TradeStatus.completed);

    const res = await service.releaseTradePaymentHold("admin-1", "trade-1");

    expect(res.success).toBe(true);
    expect(prisma.tradeCashPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { releasedAt: expect.any(Date) } }),
    );
  });
});
