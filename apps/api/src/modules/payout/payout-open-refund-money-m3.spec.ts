import { PayoutService } from "./payout.service";
import { RefundRequestStatus } from "@prisma/client";

/**
 * MONEY-M3: createPayoutsForReleasedHolds artık AÇIK iade varken payout OLUŞTURMAZ.
 * Yarış: hold release edildikten hemen sonra iade açılırsa freeze (`held` hedefler)
 * `released` hold'u kaçırır → payout satıcıya öder + alıcıya iade → çift kayıp.
 */
describe("PayoutService.createPayoutsForReleasedHolds — MONEY-M3 open-refund guard", () => {
  const makeService = (openRefund: any) => {
    const hold = {
      id: "hold-1",
      orderId: "o1",
      amount: 100,
      refundedAmount: 0,
      sellerId: "s1",
      payment: {
        providerConversationId: "OID",
      },
      seller: { bankAccount: { iban: "TR..", accountHolder: "S" } },
    };
    const order = {
      id: "o1",
      orderNumber: "ORD1",
      totalAmount: 100,
      commissionAmount: 10,
      withholdingTaxAmount: 0,
    };
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([hold]) },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(openRefund) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new PayoutService(
      prisma as any,
      {} as any, // paymentProviders
      {} as any, // configService
      {} as any, // notificationService
    );
    return { service, prisma };
  };

  it("açık iade varsa payout OLUŞTURMAZ (çift kayıp önleme)", async () => {
    const { service, prisma } = makeService({ id: "rr-1" });

    const created = await service.createPayoutsForReleasedHolds();

    expect(created).toBe(0);
    expect(prisma.payoutTransfer.create).not.toHaveBeenCalled();
    // guard doğru açık-statüleri sorgulamalı
    const where = prisma.refundRequest.findFirst.mock.calls[0][0].where;
    expect(where.orderId).toBe("o1");
    expect(where.status.in).toContain(RefundRequestStatus.return_in_transit);
    expect(where.status.in).toContain(RefundRequestStatus.disputed);
  });

  it("açık iade yoksa payout oluşturur", async () => {
    const { service, prisma } = makeService(null);

    const created = await service.createPayoutsForReleasedHolds();

    expect(created).toBe(1);
    expect(prisma.payoutTransfer.create).toHaveBeenCalledTimes(1);
  });
});
