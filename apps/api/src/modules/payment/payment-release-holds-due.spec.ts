import { PaymentRefundService } from "./payment-refund.service";
import { OrderStatus, PaymentHoldStatus } from "@prisma/client";

/**
 * releaseHoldsDue escrow-release güvenlik guard'ları (çekirdek para yolu, önceden testsiz):
 * bir hold ancak (a) held + releaseAt geçmiş + frozenByRefundId null, (b) sipariş releasable
 * statüde (delivered/awaiting/completed), (c) AÇIK iade yoksa serbest bırakılır.
 */
describe("PaymentRefundService.releaseHoldsDue — escrow release guards", () => {
  const makeService = (order: any) => {
    const prisma = {
      paymentHold: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: "hold-1", orderId: "o1", amount: 100, sellerId: "s1" },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const service = new PaymentRefundService(
      prisma as any,
      configService as any,
      {} as any, // paymentProviders
      {} as any, // eventService
      {} as any, // notificationService
      {} as any, // commissionLedger
      {} as any, // elogoInvoicing
      {} as any, // paymentCommon
      { record: jest.fn() } as any, // providerEvents
    );
    return { service, prisma };
  };

  it("releasable statü + açık iade yok → hold serbest bırakılır", async () => {
    const { service, prisma } = makeService({
      status: OrderStatus.delivered,
      refundRequests: [],
    });

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(1);
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "hold-1",
          status: PaymentHoldStatus.held,
          frozenByRefundId: null,
        }),
        data: expect.objectContaining({ status: PaymentHoldStatus.released }),
      }),
    );
  });

  it("AÇIK iade varsa → serbest BIRAKILMAZ", async () => {
    const { service, prisma } = makeService({
      status: OrderStatus.delivered,
      refundRequests: [{ id: "rr-1" }],
    });

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(0);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("releasable OLMAYAN statü (preparing) → serbest BIRAKILMAZ", async () => {
    const { service, prisma } = makeService({
      status: OrderStatus.preparing,
      refundRequests: [],
    });

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(0);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("sipariş bulunamazsa → serbest BIRAKILMAZ", async () => {
    const { service, prisma } = makeService(null);

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(0);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });
});
