import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";
import { BoostTimelineService } from "../../product/boost-timeline/boost-timeline.service";
import {
  CancellationActor,
  SubscriptionStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";

/**
 * Karakterizasyon: sanal sipariş (üyelik/boost) aktivasyonu — god-service'ten çıkarılan
 * in-tx mantık aynen korunmalı. escrow/stok YOK; sipariş terminal `completed`.
 */
describe("VirtualOrderFulfillmentService", () => {
  const makeTx = () => ({
    userMembership: { findUnique: jest.fn(), update: jest.fn() },
    membershipTier: { findUnique: jest.fn() },
    // D1: autoRenew kararı kullanılabilir kayıtlı karta bakar (tx üzerinden).
    savedCard: { findFirst: jest.fn().mockResolvedValue(null) },
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
    productBoost: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Boost activation locks the listing row first.
    $queryRaw: jest.fn().mockResolvedValue([]),
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
      // D1: kullanılabilir kayıtlı kart var → autoRenew açılır.
      tx.savedCard.findFirst.mockResolvedValue({ id: "card-1" });
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

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

    it("D1: kullanılabilir kayıtlı kart YOKSA autoRenew açılmaz", async () => {
      const tx = makeTx() as any;
      tx.userMembership.findUnique.mockResolvedValue(membership("premium"));
      tx.membershipPayment.findUnique.mockResolvedValue(intent("premium"));
      tx.membershipPayment.updateMany.mockResolvedValue({ count: 1 });
      // makeTx varsayılanı: savedCard.findFirst → null (kart yok)
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

      await svc.applyMembershipInTx(tx, payment, "txn-9");

      expect(tx.savedCard.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "buyer-1",
            provider: "paytr",
            requireCvv: false,
          }),
        }),
      );
      expect(tx.userMembership.update).toHaveBeenCalledWith({
        where: { userId: "buyer-1" },
        data: expect.objectContaining({ autoRenew: false }),
      });
    });

    it("free üyelikte ilan rankTier'ı YÜKSELTİLMEZ", async () => {
      const tx = makeTx() as any;
      tx.userMembership.findUnique.mockResolvedValue(membership("free"));
      tx.membershipPayment.findUnique.mockResolvedValue(intent("free"));
      tx.membershipPayment.updateMany.mockResolvedValue({ count: 1 });
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

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
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

      await svc.applyMembershipInTx(tx, payment);

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sib-1", "sib-2"] } },
        // İptal yazan her yol `orderCancelledData` üzerinden geçer: damga da
        // beklenir, yoksa dönemsel iptal metriği bu yolu sessizce kaçırır.
        // Yetim kardeşleri alıcı iptal etmedi; temizliği sistem yapar.
        data: {
          status: OrderStatus.cancelled,
          cancelledAt: expect.any(Date),
          cancelledBy: CancellationActor.system,
        },
      });
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.failed }),
        }),
      );
    });

    it("ödeme niyeti ile siparişteki hedef paket uyuşmazsa üyeliği aktive etmez", async () => {
      const tx = makeTx() as any;
      tx.userMembership.findUnique.mockResolvedValue(membership("premium"));
      tx.membershipPayment.findUnique.mockResolvedValue(intent("premium"));
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

      await expect(
        svc.applyMembershipInTx(tx, {
          ...payment,
          order: {
            ...payment.order,
            productId: "membership-business",
          },
        }),
      ).rejects.toThrow("Membership payment intent mismatch");

      expect(tx.userMembership.update).not.toHaveBeenCalled();
      expect(tx.membershipPayment.updateMany).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
    });
  });

  describe("applyBoostInTx", () => {
    const boostRow = {
      id: "boost-1",
      productId: "prod-1",
      orderId: "ord-1",
      durationDays: 30,
      showcaseOnHome: false,
      status: "pending",
    };

    it("activates the boost through the timeline, completes the order and returns the listing", async () => {
      const tx = makeTx() as any;
      tx.productBoost.findUnique.mockResolvedValue(boostRow);
      tx.product.findUnique.mockResolvedValue({
        boostedUntil: null,
        qualityScore: 10,
        popularityScore: 5,
      });
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

      const productId = await svc.applyBoostInTx(tx, payment);

      expect(productId).toBe("prod-1");
      // the listing row is locked before the timeline is read
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.productBoost.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "boost-1", status: { in: ["pending", "failed"] } },
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

    it("keeps the order terminal but does not stack an already active boost again", async () => {
      const tx = makeTx() as any;
      tx.productBoost.findUnique.mockResolvedValue({
        ...boostRow,
        status: "active",
      });
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

      const productId = await svc.applyBoostInTx(tx, payment);

      expect(productId).toBeNull();
      expect(tx.productBoost.updateMany).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: "ord-1" },
        data: { status: OrderStatus.completed, preparingDeadline: null },
      });
    });

    it("returns null and changes nothing without a matching boost", async () => {
      const tx = makeTx() as any;
      tx.productBoost.findUnique.mockResolvedValue(null);
      const svc = new VirtualOrderFulfillmentService(
        {} as any,
        {} as any,
        new BoostTimelineService(),
      );

      const productId = await svc.applyBoostInTx(tx, payment);
      expect(productId).toBeNull();
      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
    });
  });
});
