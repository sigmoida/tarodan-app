import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";
import { SubscriptionStatus, OrderStatus, PaymentStatus } from "@prisma/client";

/**
 * Karakterizasyon: sanal sipariş (üyelik/boost) aktivasyonu — god-service'ten çıkarılan
 * in-tx mantık aynen korunmalı. escrow/stok YOK; sipariş terminal `completed`.
 */
describe("VirtualOrderFulfillmentService", () => {
  const makeTx = () => ({
    userMembership: { findUnique: jest.fn(), update: jest.fn() },
    membershipTier: { findUnique: jest.fn() },
    product: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membershipPayment: { findUnique: jest.fn(), updateMany: jest.fn() },
    order: {
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    payment: { updateMany: jest.fn() },
    productBoost: { findUnique: jest.fn(), update: jest.fn() },
  });

  const payment = {
    id: "pay-1",
    orderId: "ord-1",
    amount: 100,
    providerPaymentId: "prov-1",
    order: {
      buyerId: "buyer-1",
      productId: "membership-premium",
      totalAmount: 100,
    },
  };

  const membership = (type: "free" | "premium") => ({
    id: "mem-1",
    tierId: "legacy-tier",
    tier: { id: "legacy-tier", type, isActive: true },
    currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
    user: {
      businessStatus: null,
      companyName: null,
      taxId: null,
    },
  });

  const intent = (type: "free" | "premium") => ({
    id: "intent-1",
    orderId: "ord-1",
    membershipId: "mem-1",
    targetTierId: type,
    status: PaymentStatus.pending,
    amount: 100,
    billingPeriod: "monthly",
    periodStart: null,
    periodEnd: null,
    metadata: null,
    targetTier: {
      id: type,
      type,
      isActive: true,
      monthlyPrice: 100,
      yearlyPrice: 1000,
    },
  });

  describe("applyMembershipInTx", () => {
    it("premium üyeliği aktive eder, ilanları rankTier=1 yükseltir, siparişi completed yapar", async () => {
      const tx = makeTx() as any;
      tx.userMembership.findUnique.mockResolvedValue(membership("premium"));
      tx.membershipPayment.findUnique.mockResolvedValue(intent("premium"));
      tx.membershipPayment.updateMany.mockResolvedValue({ count: 1 });
      const svc = new VirtualOrderFulfillmentService({} as any, {} as any);

      await svc.applyMembershipInTx(tx, payment, "txn-9");

      expect(tx.userMembership.update).toHaveBeenCalledWith({
        where: { userId: "buyer-1" },
        data: expect.objectContaining({
          status: SubscriptionStatus.active,
          cancelledAt: null,
          autoRenew: true,
          tier: { connect: { id: "premium" } },
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
        }),
      });
      // premium → boost'suz aktif ilanları rankTier 0→1
      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sellerId: "buyer-1", rankTier: 0 }),
          data: expect.objectContaining({ rankTier: 1 }),
        }),
      );
      expect(tx.membershipPayment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "intent-1", status: "pending" },
          data: expect.objectContaining({
            status: "completed",
            providerPaymentId: "txn-9",
          }),
        }),
      );
      // sipariş terminal completed
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: "ord-1" },
        data: { status: OrderStatus.completed, preparingDeadline: null },
      });
    });

    it("free üyelikte ilan rankTier'ı YÜKSELTİLMEZ", async () => {
      const tx = makeTx() as any;
      tx.userMembership.findUnique.mockResolvedValue(membership("free"));
      tx.membershipPayment.findUnique.mockResolvedValue(intent("free"));
      tx.membershipPayment.updateMany.mockResolvedValue({ count: 1 });
      const svc = new VirtualOrderFulfillmentService({} as any, {} as any);

      await svc.applyMembershipInTx(tx, {
        ...payment,
        order: { ...payment.order, productId: "membership-free" },
      });
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it("yetim pending kardeş siparişleri iptal + ödemeleri failed yapar", async () => {
      const tx = makeTx() as any;
      tx.userMembership.findUnique.mockResolvedValue(membership("premium"));
      tx.membershipPayment.findUnique.mockResolvedValue(intent("premium"));
      tx.membershipPayment.updateMany.mockResolvedValue({ count: 1 });
      tx.order.findMany.mockResolvedValue([{ id: "sib-1" }, { id: "sib-2" }]);
      const svc = new VirtualOrderFulfillmentService({} as any, {} as any);

      await svc.applyMembershipInTx(tx, payment);

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sib-1", "sib-2"] } },
        data: { status: OrderStatus.cancelled },
      });
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.failed }),
        }),
      );
    });
  });

  describe("applyBoostInTx", () => {
    it("boost'u aktive eder (stacking), ürünü rankTier=2 yapar, productId döner", async () => {
      const tx = makeTx() as any;
      tx.productBoost.findUnique.mockResolvedValue({
        id: "boost-1",
        productId: "prod-1",
        orderId: "ord-1",
        durationDays: 30,
      });
      tx.product.findUnique.mockResolvedValue({
        boostedUntil: null,
        qualityScore: 10,
        popularityScore: 5,
      });
      const svc = new VirtualOrderFulfillmentService({} as any, {} as any);

      const productId = await svc.applyBoostInTx(tx, payment);

      expect(productId).toBe("prod-1");
      expect(tx.productBoost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "boost-1" },
          data: expect.objectContaining({ status: "active" }),
        }),
      );
      expect(tx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1" },
          data: expect.objectContaining({ rankTier: 2 }),
        }),
      );
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: "ord-1" },
        data: { status: OrderStatus.completed, preparingDeadline: null },
      });
    });

    it("eşleşen boost yoksa null döner, hiçbir mutasyon yapmaz", async () => {
      const tx = makeTx() as any;
      tx.productBoost.findUnique.mockResolvedValue(null);
      const svc = new VirtualOrderFulfillmentService({} as any, {} as any);

      const productId = await svc.applyBoostInTx(tx, payment);
      expect(productId).toBeNull();
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });
});
