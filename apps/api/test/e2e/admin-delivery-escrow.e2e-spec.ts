import { Prisma, OrderStatus, PaymentHoldStatus } from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { PaymentHoldReleaseService } from "../../src/modules/payment/refund/payment-hold-release.service";
import { AdminAnalyticsOrderService } from "../../src/modules/admin/analytics/admin-analytics-order.service";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * Admin ELLE teslim/awaiting geçişi de escrow release'ini planlamalı (poll'daki #83 ile
 * aynı boşluk) VE awaiting'e geçerken confirmationDeadline set etmeli (yoksa auto-complete
 * cron'u siparişi asla almaz → stall). Hafif harness (ES/app bootstrap yok).
 */
describe("Admin updateOrderStatus → escrow release + confirmationDeadline", () => {
  let prisma: PrismaService;
  let admin: AdminAnalyticsOrderService;

  const configStub = {
    get: (k: string) =>
      (
        ({
          RETURN_WINDOW_DAYS: "14",
          PAYOUT_GRACE_DAYS: "1",
          PAYMENT_HOLD_DAYS: "7",
        }) as Record<string, string>
      )[k],
  };

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    const paymentRefund = new PaymentHoldReleaseService(
      prisma,
      configStub as any,
      {} as any, // eventService
      {} as any, // notificationService
    );
    const paymentFacade = {
      scheduleHoldReleaseOnDelivery: (
        orderId: string,
        deliveredAt: Date,
        tx?: any,
      ) =>
        paymentRefund.scheduleHoldReleaseOnDelivery(orderId, deliveredAt, tx),
    };
    admin = new AdminAnalyticsOrderService(
      prisma,
      { createAuditLog: async () => {} } as any, // audit
      {} as any, // searchService
      { del: async () => {}, delPattern: async () => {} } as any, // cache
      {} as any, // common
      { emitDeliveryRevenueInvoices: async () => {} } as any, // orderService
      paymentFacade as any, // paymentService
    );
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  async function setup(): Promise<{ orderId: string; holdId: string }> {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buyer = await prisma.user.create({
      data: { email: `b-${uniq}@t.local`, passwordHash: "x", displayName: "B" },
    });
    const seller = await prisma.user.create({
      data: {
        email: `s-${uniq}@t.local`,
        passwordHash: "x",
        displayName: "S",
        isSeller: true,
      },
    });
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category!.id,
        title: `P-${uniq}`,
        description: "x",
        price: new Prisma.Decimal(100),
        condition: "new" as any,
        status: "active" as any,
        quantity: 1,
        reservedQuantity: 0,
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `O-${uniq}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        totalAmount: new Prisma.Decimal(100),
        subtotal: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(10),
        buyerFeeAmount: new Prisma.Decimal(5),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.shipped,
      },
    });
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        provider: "surat",
        status: "in_transit" as any,
        trackingNumber: order.orderNumber,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "test",
        amount: order.totalAmount,
        status: "completed" as any,
      },
    });
    const hold = await prisma.paymentHold.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        sellerId: seller.id,
        amount: new Prisma.Decimal(85),
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });
    return { orderId: order.id, holdId: hold.id };
  }

  it("delivered: deliveredAt + hold.releaseAt set (satıcı ödeme yolu açılır)", async () => {
    const { orderId, holdId } = await setup();
    await admin.updateOrderStatus("admin-1", orderId, {
      status: OrderStatus.delivered,
    } as any);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.delivered);
    expect(order!.deliveredAt).not.toBeNull();

    const hold = await prisma.paymentHold.findUnique({ where: { id: holdId } });
    expect(hold!.releaseAt).not.toBeNull();
  });

  it("awaiting_buyer_confirmation: confirmationDeadline + releaseAt set (stall yok)", async () => {
    const { orderId, holdId } = await setup();
    await admin.updateOrderStatus("admin-1", orderId, {
      status: OrderStatus.awaiting_buyer_confirmation,
    } as any);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.awaiting_buyer_confirmation);
    expect(order!.confirmationDeadline).not.toBeNull();

    const hold = await prisma.paymentHold.findUnique({ where: { id: holdId } });
    expect(hold!.releaseAt).not.toBeNull();
  });
});
