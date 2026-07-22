import { PaymentReconciliationService } from "./payment-reconciliation.service";

/**
 * SEAM-B1: handleExpiredPreparingOrders süre-doldu iptalinde artık KARGO DURUMUNA bakar.
 * Paket Sürat'ta hareket ediyorsa (in_transit vb.) satıcı "kargoladım" tıklamamış olsa
 * bile iptal+iade EDİLMEZ (yoksa alıcı hem malı hem parayı alır). Ayrıca restock artık
 * order.quantity kadar (eskiden sabit +1).
 */
describe("PaymentReconciliationService.handleExpiredPreparingOrders — SEAM-B1", () => {
  const makeService = (expiredOrder: any, shipment: any) => {
    const mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        findUnique: jest.fn().mockResolvedValue({ status: "preparing" }),
        update: jest.fn().mockResolvedValue({}),
      },
      shipment: { findUnique: jest.fn().mockResolvedValue(shipment) },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      product: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      order: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([]) // Phase 1: approaching-deadline warnings
          .mockResolvedValueOnce([expiredOrder]), // Phase 2: expired
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn: any) => fn(mockTx)),
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const commissionLedger = {
      markWaived: jest.fn().mockResolvedValue(undefined),
    };
    const notificationService = {
      notifySellerDidNotShipRefunded: jest.fn().mockResolvedValue(undefined),
    };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new PaymentReconciliationService(
      prisma as any, // prisma
      cache as any, // cache
      {} as any, // configService
      {} as any, // paymentProviders
      {} as any, // invoiceService
      notificationService as any, // notificationService
      commissionLedger as any, // commissionLedger
      paymentRefund as any, // paymentRefund
      {} as any, // eventService
      {} as any, // paymentCommon
      {} as any, // paymentFulfillment
    );
    return { service, prisma, mockTx, paymentRefund };
  };

  const order = (over: any = {}) => ({
    id: "o1",
    orderNumber: "ORD1",
    quantity: 3,
    sellerId: "s1",
    buyerId: "b1",
    product: { id: "prod-1", title: "X", quantity: 10 },
    ...over,
  });

  it("paket HAREKET ediyorsa (in_transit) iptal/iade/restock YAPMAZ", async () => {
    const { service, mockTx, paymentRefund } = makeService(order(), {
      status: "in_transit",
      shippedAt: null,
    });

    const res = await service.handleExpiredPreparingOrders();

    expect(res.cancelled).toBe(0);
    expect(mockTx.order.update).not.toHaveBeenCalled(); // iptal yok
    expect(mockTx.product.update).not.toHaveBeenCalled(); // restock yok
    expect(paymentRefund.processRefund).not.toHaveBeenCalled(); // iade yok
  });

  it("shippedAt set ise (satıcı kargoladı) iptal YAPMAZ", async () => {
    const { service, mockTx, paymentRefund } = makeService(order(), {
      status: "pending",
      shippedAt: new Date(),
    });

    const res = await service.handleExpiredPreparingOrders();

    expect(res.cancelled).toBe(0);
    expect(paymentRefund.processRefund).not.toHaveBeenCalled();
  });

  it("yalnız etiket varsa (label_created, hareket yok) iptal+iade EDER ve order.quantity kadar restock eder", async () => {
    const { service, mockTx, paymentRefund } = makeService(
      order({ quantity: 3 }),
      {
        status: "label_created",
        shippedAt: null,
      },
    );

    const res = await service.handleExpiredPreparingOrders();

    expect(res.cancelled).toBe(1);
    expect(paymentRefund.processRefund).toHaveBeenCalledWith("o1");
    // restock TÜM adet (3), sabit +1 değil
    expect(mockTx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: { increment: 3 } }),
      }),
    );
  });

  it("shipment yoksa iptal+iade EDER", async () => {
    const { service, paymentRefund } = makeService(order(), null);

    const res = await service.handleExpiredPreparingOrders();

    expect(res.cancelled).toBe(1);
    expect(paymentRefund.processRefund).toHaveBeenCalledWith("o1");
  });
});
