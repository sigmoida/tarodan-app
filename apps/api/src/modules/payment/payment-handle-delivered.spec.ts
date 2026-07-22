import { PaymentRefundService } from "./payment-refund.service";
import { OrderStatus } from "@prisma/client";

/**
 * handleOrderDelivered kanonik teslim handler'ı (çekirdek escrow tetikleyicisi):
 * teslime uygun (deliveredAt null + terminal olmayan) siparişi CAS ile ilerletir ve
 * escrow release'ini planlar (scheduleHoldReleaseOnDelivery). CAS count===0 → no-op
 * (replay-safe: re-poll deliveredAt'i taşımaz, releaseAt kaymaz).
 */
describe("PaymentRefundService.handleOrderDelivered — escrow trigger", () => {
  const makeService = (updatedCount: number) => {
    const prisma = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
        findUnique: jest.fn().mockResolvedValue({ buyerId: "b1" }),
      },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const service = new PaymentRefundService(
      prisma as any,
      configService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  };

  it("teslime uygun sipariş: acted=true + escrow release planlanır", async () => {
    const { service, prisma } = makeService(1);

    const res = await service.handleOrderDelivered("o1", new Date());

    expect(res.acted).toBe(true);
    // sipariş delivered'a çekilir
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.delivered,
          deliveredAt: expect.any(Date),
        }),
      }),
    );
    // escrow release planlanır (scheduleHoldReleaseOnDelivery → paymentHold.updateMany releaseAt)
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ releaseAt: expect.any(Date) }),
      }),
    );
  });

  it("zaten teslim/terminal (CAS count=0): no-op, escrow planlanmaz (replay-safe)", async () => {
    const { service, prisma } = makeService(0);

    const res = await service.handleOrderDelivered("o1", new Date());

    expect(res.acted).toBe(false);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });
});
