import * as request from "supertest";
import { PaymentStatus, OrderStatus, TradeStatus } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { createAddress } from "../factories/address.factory";
import { signCallback } from "../mocks/paytr.mock";

/**
 * Direct API SENARYO testleri (mock PayTR, GERÇEK akış) — Adım 2 kapsamı:
 *  - Satın alma: yeni kart → direct-form → callback → sipariş ödendi + escrow hold (ortak yol)
 *  - Grup (sepet): checkout → direct-form(checkoutGroupId) → PayTR çağrıldı + payment grup'a bağlı
 *  - Takas nakit: trade + accept → direct-form(tradeId) → PayTR çağrıldı + payment trade-cash'e bağlı
 *
 * (Tekliften ödeme ve üyelik, order hedefiyle aynı kod yolundan geçer — order path
 *  direct-payment.e2e'de zaten kapsanır; oto-yenileme recurring-renewal.e2e'de.)
 */
describe("Direct API scenarios (E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
    jest.restoreAllMocks();
  });

  /** Ödeme bekleyen nakit-farklı takas + TradeCashPayment seed (HTTP create/accept yerine, hafif). */
  async function seedAwaitingCashTrade(
    payerId: string,
    recipientId: string,
    tradeNumber: string,
  ) {
    const prisma = getPrisma();
    const trade = await prisma.trade.create({
      data: {
        tradeNumber,
        initiatorId: payerId,
        receiverId: recipientId,
        responseDeadline: new Date(Date.now() + 7 * 86_400_000),
        status: TradeStatus.awaiting_payment,
        cashAmount: 100,
        cashPayerId: payerId,
      },
    });
    await prisma.tradeCashPayment.create({
      data: {
        tradeId: trade.id,
        payerId,
        recipientId,
        amount: 100,
        commission: 0,
        totalAmount: 100,
        provider: "paytr",
        status: PaymentStatus.pending,
      },
    });
    return trade;
  }

  it("SATIN ALMA: Direct (yeni kart) → callback → sipariş ödendi + escrow hold", async () => {
    const prisma = getPrisma();
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 400,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });

    const buyRes = await request(ctx.app.getHttpServer())
      .post("/api/orders/buy")
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);
    const orderId = buyRes.body.orderId as string;

    // Direct API ile öde (yeni kart) — mock createDirectPaymentForm success döner, payment pending kalır.
    const pay = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, saveCard: false })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);

    const payment = await prisma.payment.findUnique({
      where: { id: pay.body.paymentId },
    });
    expect(payment!.providerConversationId).toBeTruthy();

    // PayTR bildirimi (3D sonrası) → ortak callback → sipariş tamamlanır + hold oluşur.
    await request(ctx.app.getHttpServer())
      .post("/api/payments/callback/paytr")
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: "success",
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      );

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).not.toBe(OrderStatus.pending_payment);
    expect(order!.status).not.toBe(OrderStatus.cancelled);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold).toBeTruthy(); // escrow ortak yoldan oluştu (Direct'e özel değil)
  });

  it("GRUP (sepet): checkout → direct-form(checkoutGroupId) → PayTR çağrıldı + payment gruba bağlı", async () => {
    const prisma = getPrisma();
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const p1 = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 150,
      quantity: 1,
    });
    const p2 = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 250,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });

    const checkoutRes = await request(ctx.app.getHttpServer())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [
          { productId: p1.id, quantity: 1 },
          { productId: p2.id, quantity: 1 },
        ],
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        shippingAddressId: addr.id,
      })
      .expect(201);
    const checkoutGroupId = (checkoutRes.body.checkoutGroupId ||
      checkoutRes.body.id ||
      checkoutRes.body.group?.id) as string;
    expect(checkoutGroupId).toBeTruthy();

    const pay = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ checkoutGroupId })
      .expect(201);

    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    const payment = await prisma.payment.findUnique({
      where: { id: pay.body.paymentId },
    });
    expect(payment!.checkoutGroupId).toBe(checkoutGroupId);
    // PayTR'a giden tutar = grup toplamı (ürünler + kargo/komisyon).
    expect(ctx.paytr.directPaymentCalls[0].amount).toBe(
      Number(payment!.amount),
    );
    expect(Number(payment!.amount)).toBeGreaterThanOrEqual(400);
  });

  it("TAKAS nakit: direct-form(tradeId) → PayTR çağrıldı + payment trade-cash’e bağlı", async () => {
    const prisma = getPrisma();
    const initiator = await createUser(ctx.module, { isSeller: true });
    const receiver = await createUser(ctx.module, { isSeller: true });
    const trade = await seedAwaitingCashTrade(
      initiator.id,
      receiver.id,
      "TR-SCEN-PAY",
    );

    // Nakit ödeyen = initiator. Direct API ile öder (yeni kart).
    const pay = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(initiator))
      .send({ tradeId: trade.id })
      .expect(201);

    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    expect(ctx.paytr.directPaymentCalls[0].amount).toBe(100);
    const cashPayment = await prisma.tradeCashPayment.findFirst({
      where: { tradeId: trade.id },
    });
    const payment = await prisma.payment.findUnique({
      where: { id: pay.body.paymentId },
    });
    expect(payment!.tradeCashPaymentId).toBe(cashPayment!.id);
    expect(payment!.status).toBe(PaymentStatus.pending);
  });

  it("TAKAS: nakit ödeyen olmayan taraf direct-form yapamaz (403)", async () => {
    const initiator = await createUser(ctx.module, { isSeller: true });
    const receiver = await createUser(ctx.module, { isSeller: true });
    const trade = await seedAwaitingCashTrade(
      initiator.id,
      receiver.id,
      "TR-SCEN-403",
    );

    // receiver nakit ödeyen değil (initiator ödüyor) → 403
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(receiver))
      .send({ tradeId: trade.id })
      .expect(403);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });
});
