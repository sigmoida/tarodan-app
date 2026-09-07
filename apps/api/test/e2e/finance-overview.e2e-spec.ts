import * as request from "supertest";
import {
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  PayoutStatus,
  Prisma,
} from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createAdminUser, authHeader } from "../factories/user.factory";

/**
 * Finans Özeti v2 — ciro bölünmesinin (S1) ham SQL'i gerçek veritabanında
 * koşar: direkt sipariş, iki satıcılı sepet (kargo açığı olan alt sipariş dahil),
 * platform kuponlu sipariş ve iptal edilmiş hold. Her bölümün farkı 0 olmalı;
 * bir hold silinince fark tam o tutar kadar kırmızıya döner.
 *
 * Fixture (revenue-split.helper.spec ile aynı sayılar):
 *  A direkt 1120 (hold 834; released → completed payout net 800 / mahsup 34)
 *  Sepet 281,20: B 260 (hold 176, held, refundedAmount 76) + C 21,20 (hold 0, açık 54,40)
 *  D kuponlu 96 (hold 88, cancelled → ödeme refunded)
 *  Tahsilat 1497,20 = 1098 + 0 + 188 + 75,60 + 180 + 10 − 54,40
 */
describe("Finance overview reconciliation (E2E)", () => {
  let ctx: E2ETestApp;
  const prisma = () => getPrisma();
  const D = (n: number) => new Prisma.Decimal(n);

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  async function seedFixture() {
    const db = prisma();
    const uniq = `${Date.now()}`;
    const buyer = await db.user.create({
      data: { email: `b-${uniq}@t.local`, passwordHash: "x", displayName: "B" },
    });
    const seller1 = await db.user.create({
      data: {
        email: `s1-${uniq}@t.local`,
        passwordHash: "x",
        displayName: "S1",
        isSeller: true,
      },
    });
    const seller2 = await db.user.create({
      data: {
        email: `s2-${uniq}@t.local`,
        passwordHash: "x",
        displayName: "S2",
        isSeller: true,
      },
    });
    const category = await db.category.findFirstOrThrow();
    const product = async (sellerId: string, price: number) =>
      db.product.create({
        data: {
          sellerId,
          categoryId: category.id,
          title: `P-${sellerId.slice(0, 6)}-${price}`,
          description: "x",
          price: D(price),
          condition: "new" as any,
          status: "active" as any,
          quantity: 5,
          reservedQuantity: 0,
        },
      });

    type OrderMoney = {
      subtotal: number;
      bShip?: number;
      sShip?: number;
      bFee?: number;
      sFee?: number;
      bST?: number;
      sST?: number;
      wh?: number;
      pfd?: number;
    };
    const total = (m: OrderMoney) =>
      m.subtotal + (m.bShip ?? 0) + (m.bFee ?? 0) + (m.bST ?? 0);
    const makeOrder = async (
      sellerId: string,
      number: string,
      m: OrderMoney,
      extra: Partial<Prisma.OrderUncheckedCreateInput> = {},
    ) =>
      db.order.create({
        data: {
          orderNumber: number,
          buyerId: buyer.id,
          sellerId,
          productId: (await product(sellerId, m.subtotal)).id,
          totalAmount: D(total(m)),
          subtotal: D(m.subtotal),
          commissionAmount: D((m.bFee ?? 0) + (m.sFee ?? 0)),
          buyerFeeAmount: D(m.bFee ?? 0),
          sellerFeeAmount: D(m.sFee ?? 0),
          buyerShippingAmount: D(m.bShip ?? 0),
          sellerShippingAmount: D(m.sShip ?? 0),
          buyerServiceTaxAmount: D(m.bST ?? 0),
          sellerServiceTaxAmount: D(m.sST ?? 0),
          withholdingTaxAmount: D(m.wh ?? 0),
          platformFundedDiscount: D(m.pfd ?? 0),
          paymentExpiresAt: new Date(Date.now() + 3_600_000),
          status: OrderStatus.completed,
          quantity: 1,
          ...extra,
        },
      });

    // A — direkt, released hold + tamamlanmış payout (net 800, mahsup 34)
    const a = await makeOrder(seller1.id, `ORD-A${uniq}`, {
      subtotal: 1000,
      bShip: 50,
      sShip: 30,
      bFee: 50,
      sFee: 100,
      bST: 20,
      sST: 26,
      wh: 10,
    });
    const payA = await db.payment.create({
      data: {
        orderId: a.id,
        amount: D(1120),
        currency: "TRY",
        provider: "paytr",
        status: PaymentStatus.completed,
        paidAt: new Date(),
        providerConversationId: `OIDA${uniq}`,
      },
    });
    const holdA = await db.paymentHold.create({
      data: {
        paymentId: payA.id,
        orderId: a.id,
        sellerId: seller1.id,
        amount: D(834),
        status: PaymentHoldStatus.released,
        releasedAt: new Date(),
      },
    });
    await db.payoutTransfer.create({
      data: {
        paymentHoldId: holdA.id,
        sellerId: seller1.id,
        amount: D(1120),
        commission: D(150),
        netAmount: D(800),
        adjustmentDeduction: D(34),
        merchantOid: `OIDA${uniq}`,
        transId: `PYTA${uniq}`,
        transferIban: "TR330006100519786457841326",
        transferName: "S1",
        status: PayoutStatus.completed,
        processedAt: new Date(),
      },
    });

    // Sepet — tek ödeme 281,20: B (held, 76 iade) + C (kargo açığı, hold 0)
    const group = await db.checkoutGroup.create({
      data: {
        groupNumber: `GRP-${uniq}`,
        buyerId: buyer.id,
        totalAmount: D(281.2),
      },
    });
    const b = await makeOrder(
      seller1.id,
      `ORD-B${uniq}`,
      { subtotal: 200, bShip: 40, bFee: 10, sFee: 20, bST: 10, sST: 4 },
      { checkoutGroupId: group.id },
    );
    const c = await makeOrder(
      seller2.id,
      `ORD-C${uniq}`,
      { subtotal: 20, sShip: 60, bFee: 1, sFee: 2, bST: 0.2, sST: 12.4 },
      { checkoutGroupId: group.id },
    );
    const payG = await db.payment.create({
      data: {
        checkoutGroupId: group.id,
        amount: D(281.2),
        currency: "TRY",
        provider: "paytr",
        status: PaymentStatus.completed,
        paidAt: new Date(),
        providerConversationId: `OIDG${uniq}`,
      },
    });
    await db.paymentHold.create({
      data: {
        paymentId: payG.id,
        orderId: b.id,
        sellerId: seller1.id,
        amount: D(176),
        refundedAmount: D(76),
        status: PaymentHoldStatus.held,
        releaseAt: new Date(Date.now() + 86_400_000),
      },
    });
    await db.paymentHold.create({
      data: {
        paymentId: payG.id,
        orderId: c.id,
        sellerId: seller2.id,
        amount: D(0),
        status: PaymentHoldStatus.held,
        releaseAt: new Date(Date.now() + 86_400_000),
      },
    });

    // D — platform kuponlu, tamamen iade: ödeme refunded, hold cancelled
    const d = await makeOrder(
      seller2.id,
      `ORD-D${uniq}`,
      { subtotal: 90, pfd: 10, bFee: 5, sFee: 10, bST: 1, sST: 2 },
      { status: OrderStatus.refunded },
    );
    const payD = await db.payment.create({
      data: {
        orderId: d.id,
        amount: D(96),
        currency: "TRY",
        provider: "paytr",
        status: PaymentStatus.refunded,
        paidAt: new Date(),
        providerConversationId: `OIDD${uniq}`,
      },
    });
    await db.paymentHold.create({
      data: {
        paymentId: payD.id,
        orderId: d.id,
        sellerId: seller2.id,
        amount: D(88),
        refundedAmount: D(88),
        status: PaymentHoldStatus.cancelled,
      },
    });
    return { holdA };
  }

  const overview = async () => {
    const admin = await createAdminUser(ctx.module);
    const res = await request(ctx.app.getHttpServer())
      .get("/api/admin/finance/overview")
      .set(authHeader(admin))
      .expect(200);
    return res.body as {
      sections: Array<{
        key: string;
        total: { amount: number };
        components: Array<{ key: string; amount: number }>;
        difference: number;
        balanced: boolean;
      }>;
      diagnostics: { ordersWithoutHold: number; paymentsWithoutOrders: number };
    };
  };
  const section = (body: Awaited<ReturnType<typeof overview>>, key: string) =>
    body.sections.find((s) => s.key === key)!;
  const byKey = (s: { components: Array<{ key: string; amount: number }> }) =>
    Object.fromEntries(s.components.map((c) => [c.key, c.amount]));

  it("splits gross collected money exactly and every section reconciles", async () => {
    await seedFixture();

    const body = await overview();

    const s1 = section(body, "revenueSplit");
    expect(s1.total.amount).toBeCloseTo(1497.2, 2);
    expect(byKey(s1)).toMatchObject({
      sellerShare: 1098,
      tradeCounterpart: 0,
      platformFeesNet: 188,
      serviceVat: 75.6,
      shipping: 180,
      withholding: 10,
      shippingDeficit: -54.4,
    });
    expect(s1.difference).toBe(0);
    expect(s1.balanced).toBe(true);
    expect(body.diagnostics).toMatchObject({
      ordersWithoutHold: 0,
      paymentsWithoutOrders: 0,
    });

    const s2 = section(body, "sellerShare");
    expect(byKey(s2)).toMatchObject({
      escrowHeld: 100,
      inTransit: 0,
      paidNet: 800,
      adjustmentDeducted: 34,
      refundedToBuyer: 164,
    });
    expect(s2.balanced).toBe(true);

    for (const s of body.sections) expect(s.balanced).toBe(true);
  });

  it("turns the revenue split red by exactly the missing hold and counts it", async () => {
    const { holdA } = await seedFixture();
    await prisma().payoutTransfer.deleteMany({
      where: { paymentHoldId: holdA.id },
    });
    await prisma().paymentHold.delete({ where: { id: holdA.id } });

    const body = await overview();

    const s1 = section(body, "revenueSplit");
    expect(s1.difference).toBeCloseTo(834, 2);
    expect(s1.balanced).toBe(false);
    expect(body.diagnostics.ordersWithoutHold).toBe(1);
  });
});
