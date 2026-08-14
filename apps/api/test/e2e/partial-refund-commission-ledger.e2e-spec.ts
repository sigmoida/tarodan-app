import {
  Prisma,
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  CommissionLedgerStatus,
} from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { CommissionLedgerService } from "../../src/modules/commission/commission-ledger.service";
import { PaymentRefundService } from "../../src/modules/payment/refund/payment-refund.service";
import { PaymentRefundAttemptService } from "../../src/modules/payment/refund/payment-refund-attempt.service";
import { ElogoInvoicingService } from "../../src/modules/elogo/elogo-invoicing.service";
import { ElogoDocumentService } from "../../src/modules/elogo/elogo-document.service";
import { ElogoDeliveryService } from "../../src/modules/elogo/elogo-delivery.service";
import { ElogoIssuingService } from "../../src/modules/elogo/elogo-issuing.service";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * #88 — kısmi (adet) iadede CommissionLedger komisyonu PRO-RATE edilir (eskiden yalnız
 * TAM iade işaretleniyor, kısmi iade komisyonu fazla-raporluyordu). Original alanlar
 * korunur; refunded* kümülatif; net = original - refunded → elogo net faturalar. [P0]
 */
describe("Partial-refund commission ledger pro-rating (#88) [P0]", () => {
  let prisma: PrismaService;
  let ledger: CommissionLedgerService;

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    ledger = new CommissionLedgerService(prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  async function makeOrderWithLedger(opts: {
    sellerCommission: number;
    buyerFee: number;
  }): Promise<{ orderId: string; sellerId: string }> {
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
        quantity: 2,
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
        commissionAmount: new Prisma.Decimal(opts.sellerCommission),
        buyerFeeAmount: new Prisma.Decimal(opts.buyerFee),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.paid,
        quantity: 2,
      },
    });
    await ledger.upsertPending({
      orderId: order.id,
      sellerCommission: opts.sellerCommission,
      buyerFee: opts.buyerFee,
    });
    return { orderId: order.id, sellerId: seller.id };
  }

  it("applyRefund: kısmi (0.5) pro-rate eder, original korunur, status refunded OLMAZ", async () => {
    const { orderId } = await makeOrderWithLedger({
      sellerCommission: 10,
      buyerFee: 4,
    });

    const res = await prisma.$transaction((tx) =>
      ledger.applyRefund(orderId, 0.5, tx),
    );
    expect(res.fullyRefunded).toBe(false);

    const l = await prisma.commissionLedger.findUnique({ where: { orderId } });
    expect(Number(l!.sellerCommission)).toBe(10); // original değişmez
    expect(Number(l!.refundedSellerCommission)).toBeCloseTo(5, 2);
    expect(Number(l!.refundedBuyerFee)).toBeCloseTo(2, 2);
    expect(l!.status).not.toBe(CommissionLedgerStatus.refunded);
  });

  it("applyRefund kümülatif: iki kısmi (0.5 + 0.5) tam iadeye ulaşır, clamp + status refunded", async () => {
    const { orderId } = await makeOrderWithLedger({
      sellerCommission: 10,
      buyerFee: 4,
    });

    await prisma.$transaction((tx) => ledger.applyRefund(orderId, 0.5, tx));
    const res2 = await prisma.$transaction((tx) =>
      ledger.applyRefund(orderId, 0.5, tx),
    );
    expect(res2.fullyRefunded).toBe(true);

    const l = await prisma.commissionLedger.findUnique({ where: { orderId } });
    expect(Number(l!.refundedSellerCommission)).toBeCloseTo(10, 2); // clamp = original
    expect(Number(l!.refundedBuyerFee)).toBeCloseTo(4, 2);
    expect(l!.status).toBe(CommissionLedgerStatus.refunded);
    // net = 0
    expect(
      Number(l!.sellerCommission) - Number(l!.refundedSellerCommission),
    ).toBeCloseTo(0, 2);
  });

  it("applyRefund idempotent: zaten refunded olan ledger tekrar çağrıda compound ETMEZ", async () => {
    const { orderId } = await makeOrderWithLedger({
      sellerCommission: 10,
      buyerFee: 4,
    });
    await prisma.$transaction((tx) => ledger.applyRefund(orderId, 1, tx));
    const r = await prisma.$transaction((tx) =>
      ledger.applyRefund(orderId, 0.5, tx),
    );
    expect(r.updated).toBe(false);
    const l = await prisma.commissionLedger.findUnique({ where: { orderId } });
    expect(Number(l!.refundedSellerCommission)).toBeCloseTo(10, 2); // aşmadı
  });

  it("processRefund kısmi iade: ledger komisyonu pro-rate edilir (entegrasyon)", async () => {
    const { orderId, sellerId } = await makeOrderWithLedger({
      sellerCommission: 10,
      buyerFee: 4,
    });
    const payment = await prisma.payment.create({
      data: {
        orderId,
        provider: "paytr",
        providerConversationId: `oid-${orderId.slice(0, 8)}`,
        amount: new Prisma.Decimal(100),
        status: PaymentStatus.completed,
        metadata: {},
      },
    });
    await prisma.paymentHold.create({
      data: {
        paymentId: payment.id,
        orderId,
        sellerId,
        amount: new Prisma.Decimal(85),
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });

    const createRefund = jest.fn().mockResolvedValue({ status: "success" });
    const refundSvc = new PaymentRefundService(
      prisma,
      { get: () => undefined } as any, // config (PAYMENT_BYPASS undefined → PayTR yolu)
      { createRefund } as any,
      { emitPaymentRefunded: async () => {} } as any,
      {
        createInAppNotification: async () => {},
        sendOrderCancelledEmails: async () => {},
      } as any,
      ledger, // GERÇEK commissionLedger
      {
        handleOrderRefund: async () => {},
        issueCommissionInvoice: async () => {},
        issueServiceFeeInvoice: async () => {},
        issuePlatformSaleInvoice: async () => {},
      } as any,
      { cancelSuratShipmentIfExists: async () => {} } as any,
      {} as any, // providerEvents
      {} as any, // holdRelease
      new PaymentRefundAttemptService(prisma as any), // attempts
      {} as any, // tradeRefunds
    );

    // 100 üzerinden 50 kısmi iade → portion 0.5
    await refundSvc.processRefund(orderId, 50);

    expect(createRefund).toHaveBeenCalledTimes(1);
    const l = await prisma.commissionLedger.findUnique({ where: { orderId } });
    expect(Number(l!.refundedSellerCommission)).toBeCloseTo(5, 2); // 10 * 0.5
    expect(Number(l!.sellerCommission)).toBe(10); // original korundu
  });

  it("elogo NET komisyon faturalar: kısmi iade sonrası original değil net kesilir", async () => {
    const { orderId, sellerId } = await makeOrderWithLedger({
      sellerCommission: 10,
      buyerFee: 4,
    });
    // Kısmi iade uygula → refundedSellerCommission = 3
    await prisma.commissionLedger.update({
      where: { orderId },
      data: { refundedSellerCommission: new Prisma.Decimal(3) },
    });

    const documents = new ElogoDocumentService(
      prisma,
      {} as any, // elogo client
      { get: () => "" } as any, // config
    );
    // Kesim GÖNDERIM servisinde yaşıyor; casus da orada olmalı.
    const delivery = new ElogoDeliveryService(
      prisma,
      {} as any, // elogo client
      documents,
    );
    const elogo = new ElogoInvoicingService(
      prisma,
      {} as any, // elogo client
      {} as any, // queries
      documents,
      delivery,
      // Bu spec KESİM yolunu sürüyor (issueCommissionInvoice), o yüzden gerçek
      // kesme servisi — ve casusun izlediği AYNI delivery örneği.
      new ElogoIssuingService(prisma, documents, delivery),
      {} as any, // reversals — bu spec ters kayıt çağırmıyor
    );
    const cutSpy = jest
      .spyOn(delivery as any, "cut")
      .mockResolvedValue(undefined);

    await elogo.issueCommissionInvoice(orderId);

    expect(cutSpy).toHaveBeenCalledTimes(1);
    // net = 10 - 3 = 7 (original 10 DEĞİL)
    expect(cutSpy).toHaveBeenCalledWith("commission", orderId, sellerId, 7);
  });
});
