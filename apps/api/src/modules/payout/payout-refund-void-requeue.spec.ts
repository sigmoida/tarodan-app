import { PayoutService } from "./payout.service";
import { OrderStatus, PayoutStatus } from "@prisma/client";

/**
 * BLOCKER (ikinci yön): kısmi iade payout'u `failed/order_refunded` yapar ve
 * `paymentHoldId` unique olduğu için `createPayoutsForReleasedHolds` bu hold için
 * bir daha payout ÜRETEMEZ → satıcı kalan hakkını hiç almaz (admin elle retry
 * etmezse). İade terminal olduğunda ve hold'da hâlâ hak edilen net kaldığında
 * payout otomatik olarak yeniden kuyruğa alınmalıdır.
 */
describe("PayoutService — requeue refund-voided payouts", () => {
  const makeService = (payouts: any[], overrides: any = {}) => {
    const updates: any[] = [];
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue(payouts),
        updateMany: jest.fn().mockImplementation((arg: any) => {
          updates.push(arg);
          return Promise.resolve({ count: 1 });
        }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "o1",
          status: OrderStatus.completed,
        }),
      },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
    const service = new PayoutService(
      prisma as any,
      {} as any,
      { get: () => undefined } as any,
      {} as any,
    );
    return { service, updates, prisma };
  };

  const voidedPayout = (holdOverrides: any = {}) => ({
    id: "p1",
    status: PayoutStatus.failed,
    failureReason: "order_refunded",
    netAmount: 85,
    paymentHold: {
      paymentId: "pay1",
      orderId: "o1",
      amount: 85,
      refundedAmount: 30,
      ...holdOverrides,
    },
  });

  it("iade terminal + hold'da bakiye varsa payout tekrar pending'e alınır", async () => {
    const { service, updates } = makeService([voidedPayout()]);

    const requeued = await service.requeueRefundVoidedPayouts();

    expect(requeued).toBe(1);
    const promo = updates.find(
      (u: any) => u.data?.status === PayoutStatus.pending,
    );
    expect(promo).toBeDefined();
    // CAS: yalnız hâlâ failed/order_refunded ise promote edilmeli.
    expect(promo.where.status).toBe(PayoutStatus.failed);
    expect(promo.where.failureReason).toBe("order_refunded");
  });

  it("tamamı iade edilmişse yeniden kuyruğa ALINMAZ", async () => {
    const { service, updates } = makeService([
      voidedPayout({ refundedAmount: 85 }),
    ]);

    const requeued = await service.requeueRefundVoidedPayouts();

    expect(requeued).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("açık iade talebi varken yeniden kuyruğa ALINMAZ", async () => {
    const { service, updates } = makeService([voidedPayout()], {
      refundRequest: { findFirst: jest.fn().mockResolvedValue({ id: "r1" }) },
    });

    const requeued = await service.requeueRefundVoidedPayouts();

    expect(requeued).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("çözülmemiş iade denemesi varken yeniden kuyruğa ALINMAZ", async () => {
    const { service, updates } = makeService([voidedPayout()], {
      refundAttempt: { findFirst: jest.fn().mockResolvedValue({ id: "a1" }) },
    });

    const requeued = await service.requeueRefundVoidedPayouts();

    expect(requeued).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("sipariş payout'a uygun durumda değilse yeniden kuyruğa ALINMAZ", async () => {
    const { service, updates } = makeService([voidedPayout()], {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "o1", status: OrderStatus.cancelled }),
      },
    });

    const requeued = await service.requeueRefundVoidedPayouts();

    expect(requeued).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
