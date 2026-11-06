import * as crypto from "crypto";
import type { ConfigService } from "@nestjs/config";
import {
  CancellationActor,
  OrderStatus,
  Prisma,
  type FiscalInvoice,
} from "@prisma/client";
import { disconnectPrisma, getPrisma } from "../test-utils/db";
import {
  createGroupOrder,
  createGroupPayment,
  createRateSnapshot,
} from "../factories/installment.factory";
import { CommissionLedgerService } from "../../src/modules/commission/commission-ledger.service";
import { InvoiceDeliveryService } from "../../src/modules/invoicing/invoice-delivery.service";
import { InvoiceDocumentService } from "../../src/modules/invoicing/invoice-document.service";
import { InvoiceIssuingService } from "../../src/modules/invoicing/invoice-issuing.service";
import { InvoiceReversalService } from "../../src/modules/invoicing/invoice-reversal.service";
import type {
  EInvoiceProvider,
  FiscalDocumentInput,
} from "../../src/modules/invoicing/provider/e-invoice-provider";
import { LedgerService } from "../../src/modules/ledger/ledger.service";
import type { InvoiceRefundReversePayload } from "../../src/modules/outbox/outbox.types";
import { OUTBOX_INVOICE_REFUND_REVERSE } from "../../src/modules/outbox/outbox.types";
import { PaymentCallbackService } from "../../src/modules/payment/checkout/payment-callback.service";
import { PaymentInitiationService } from "../../src/modules/payment/checkout/payment-initiation.service";
import { EscrowHoldService } from "../../src/modules/payment/fulfillment/escrow-hold.service";
import { FulfillmentFinalizer } from "../../src/modules/payment/fulfillment/fulfillment-finalizer.service";
import { PaymentFulfillmentService } from "../../src/modules/payment/fulfillment/payment-fulfillment.service";
import { InstallmentChargeService } from "../../src/modules/payment/installments/installment-charge.service";
import { InstallmentOptionsService } from "../../src/modules/payment/installments/installment-options.service";
import { InstallmentRatesService } from "../../src/modules/payment/installments/installment-rates.service";
import { InstallmentRulesService } from "../../src/modules/payment/installments/installment-rules.service";
import { InstallmentSettingsService } from "../../src/modules/payment/installments/installment-settings.service";
import { PaymentRefundAttemptService } from "../../src/modules/payment/refund/payment-refund-attempt.service";
import { PaymentRefundService } from "../../src/modules/payment/refund/payment-refund.service";
import { PaymentProviderRegistry } from "../../src/modules/payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../src/modules/payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../src/modules/payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../src/modules/payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../src/modules/payment-providers/paytr/paytr.service";

/**
 * The buyer's installment fee (vade farkı) document on a real database
 * (ADR 0019 D4, task A6): capture -> delivery -> `buyer_installment_fee` ->
 * refunds -> return invoices, through the real payment, refund and
 * invoicing services on Prisma (unique `(type, sourceId)`, the gap-free
 * number counter in a Serializable transaction, the fee CHECKs). PayTR and
 * eLogo are fakes: the e-document provider accepts every document and
 * records it.
 *
 * Plan 4.4: a 1,000.00 TL order at 3 installments, card family `world`,
 * r1 = 3 %, r3 = 8 %, default rule: C = 1,066.38, F = 66.38, invoiced as
 * 55.32 + 11.06 VAT; refunded 400.00 then 600.00 of goods, the fee shares
 * 26.55 then 39.83 come back as two return invoices.
 */
describe("installment fee document on a real database (E2E)", () => {
  const prisma = getPrisma();
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
  const ENV: Record<string, string> = {
    PAYTR_MERCHANT_ID: "111111",
    PAYTR_MERCHANT_KEY: "e2e-market-key",
    PAYTR_MERCHANT_SALT: "e2e-market-salt",
    PAYTR_TEST_MODE: "true",
    FRONTEND_URL: "https://app.test",
    ELOGO_INVOICE_PREFIX: "TIF",
    ELOGO_VAT_RATE: "20",
  };
  const config = {
    get: (key: string, fallback?: string) => ENV[key] ?? fallback,
  } as unknown as ConfigService;
  const creds = new PayTRCredentials(config);
  const paytr = new PayTRService(
    creds,
    new PayTRReportService(creds),
    new PayTRTransferService(creds),
    config,
  );
  const registry = new PaymentProviderRegistry(paytr);

  // Redis stand-in; the BIN answer is cached, so PayTR is never asked.
  const store = new Map<string, unknown>([
    [
      "paytr:bin:45467112",
      {
        outcome: "success",
        bank: "Test Bank",
        cardType: "credit",
        family: "world",
        businessCard: false,
      },
    ],
  ]);
  const cache = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => void store.set(key, value),
    del: async () => undefined,
    delPattern: async () => undefined,
    claimKey: async () => "held" as const,
    incr: async () => 1,
    exists: async () => false,
  };
  const noPaytr = {
    resolve: () => {
      throw new Error("PayTR must not be called for options");
    },
  };
  const settings = new InstallmentSettingsService(prisma as never);
  const rates = new InstallmentRatesService(
    prisma as never,
    cache as never,
    noPaytr as never,
    settings,
  );
  const charge = new InstallmentChargeService(
    new InstallmentOptionsService(
      prisma as never,
      cache as never,
      noPaytr as never,
      settings,
      rates,
      new InstallmentRulesService(prisma as never, rates),
    ),
  );
  const initiation = new PaymentInitiationService(
    prisma as never,
    config,
    registry,
    {} as never,
    {} as never,
    {} as never,
    { verifyPaymentFromClient: async () => ({ completed: false }) } as never,
    { record: async () => undefined } as never,
    { ensureForPayment: async () => null } as never,
    { isRecordedForOrder: async () => true } as never,
    charge,
  );

  // ── e-documents: real services, fake integrator ──────────────────────────
  const sent: FiscalDocumentInput[] = [];
  const cancelled: string[] = [];
  const provider: EInvoiceProvider = {
    name: "elogo",
    numbering: "local",
    isEnabled: () => true,
    resolveRecipientKind: async () => ({ kind: "EARCHIVE" }),
    send: async (document) => {
      sent.push(document);
      return { accepted: true, ettn: document.ettn };
    },
    getStatus: async () => ({ state: "unknown" }),
    cancelEArchive: async (ref) => {
      cancelled.push(ref.ettn);
      return { success: true, resultMsg: "cancelled" };
    },
    fetchPdf: async () => null,
    // Like eLogo: a fresh e-Arşiv is cancelled, an older one gets a return.
    eArchiveReversalStrategy: (issuedAt, now = new Date()) =>
      now.getTime() - issuedAt.getTime() < 8 * 24 * 60 * 60 * 1000
        ? "CANCEL"
        : "RETURN_INVOICE",
    classifyError: () => "unknown",
  };
  const documents = new InvoiceDocumentService(
    prisma as never,
    provider,
    config,
  );
  const delivery = new InvoiceDeliveryService(
    prisma as never,
    provider,
    documents,
  );
  const issuing = new InvoiceIssuingService(
    prisma as never,
    documents,
    delivery,
  );
  const reversals = new InvoiceReversalService(
    prisma as never,
    provider,
    documents,
    delivery,
  );

  // ── refunds, with the outbox recorded ────────────────────────────────────
  const outboxEvents: Array<{ type: string; payload: unknown }> = [];
  const outbox = {
    enqueue: async (_tx: unknown, event: { type: string; payload: unknown }) =>
      void outboxEvents.push(event),
  };
  const refundRegistry = {
    resolve: () => ({
      createRefund: async (oid: string) => ({
        status: "success",
        merchant_oid: oid,
      }),
    }),
  };
  const anyCall = new Proxy({}, { get: () => jest.fn(async () => undefined) });
  const ledger = new LedgerService(prisma as never);
  const commissionLedger = new CommissionLedgerService(prisma as never);
  const refunds = new PaymentRefundService(
    prisma as never,
    config,
    refundRegistry as never,
    anyCall as never, // events
    anyCall as never, // notifications
    commissionLedger,
    // The post-commit fast path; the outbox handler below is the durable one.
    { handleOrderRefund: async () => undefined } as never,
    { cancelSuratShipmentIfExists: async () => undefined } as never,
    { record: async () => undefined } as never,
    {} as never, // holdRelease
    new PaymentRefundAttemptService(prisma as never),
    {} as never, // tradeRefunds
    {} as never, // boostTimeline (no boost order here)
    outbox as never,
    ledger,
  );

  const events = {
    emitOrderFulfillmentRequested: jest.fn(async () => undefined),
    emitGroupBuyerOrderPaid: jest.fn(async (_payload: unknown) => undefined),
    emitOrderPaid: jest.fn(async () => undefined),
  };
  const fulfillment = new PaymentFulfillmentService(
    prisma as never,
    cache as never,
    config,
    events as never,
    { notifyStockoutCascade: async () => undefined } as never,
    {} as never,
    {
      decrementForOrder: async () => ({
        cancelledOrders: [],
        cancelledOffers: [],
        stockoutCategoryId: undefined,
        oversold: undefined,
      }),
    } as never,
    anyCall as never,
    new EscrowHoldService(commissionLedger),
    {} as never,
    refunds,
    {} as never,
  );
  const callbacks = new PaymentCallbackService(
    prisma as never,
    config,
    registry,
    { isChargeLikelyLive: () => false } as never,
    fulfillment,
    { syncSavedCardsFromUtoken: async () => undefined } as never,
    { record: async () => undefined } as never,
    cache as never,
  );
  const finalizer = new FulfillmentFinalizer(
    prisma as never,
    events as never,
    { ensure: async () => "created" } as never,
    ledger,
  );

  const unique = () =>
    `${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

  /** One package per order, as checkout creates it. */
  async function packageFor(orderId: string): Promise<string> {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { sellerId: true, buyerId: true, checkoutGroupId: true },
    });
    const pkg = await prisma.orderPackage.create({
      data: {
        packageNumber: `PKG-${unique()}`,
        sellerId: order.sellerId,
        buyerId: order.buyerId,
        checkoutGroupId: order.checkoutGroupId,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { packageId: pkg.id },
    });
    return pkg.id;
  }

  /** One order of 1,000.00 (commission 100) paid alone, in its package. */
  async function singleOrder(shippingAddress?: Prisma.InputJsonValue) {
    const payment = await createGroupPayment({ amount: "1000.00" });
    const { orderId } = await createGroupOrder(payment, {
      totalAmount: "1000.00",
    });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        checkoutGroupId: null,
        commissionAmount: D("100.00"),
        ...(shippingAddress ? { shippingAddress } : {}),
      },
    });
    await prisma.payment.update({
      where: { id: payment.paymentId },
      data: { checkoutGroupId: null, orderId },
    });
    const packageId = await packageFor(orderId);
    return { ...payment, orderId, packageId };
  }

  /** A cart of two sellers' orders, 600.00 and 400.00, a package each. */
  async function cart() {
    const payment = await createGroupPayment({ amount: "1000.00" });
    const orders = { big: "", small: "" };
    const packages = { big: "", small: "" };
    for (const [name, total] of [
      ["big", "600.00"],
      ["small", "400.00"],
    ] as const) {
      const { orderId } = await createGroupOrder(payment, {
        totalAmount: total,
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { commissionAmount: D(total).times("0.1") },
      });
      orders[name] = orderId;
      packages[name] = await packageFor(orderId);
    }
    return { ...payment, orders, packages };
  }

  async function sign(
    target: { buyerId: string; groupId: string; orderId?: string },
    total: number,
  ) {
    const form = await initiation.prepareDirectPayment(target.buyerId, {
      ...(target.orderId
        ? { orderId: target.orderId }
        : { checkoutGroupId: target.groupId }),
      installment: { count: 3, bin: "45467112", expectedTotal: total },
    });
    return Object.fromEntries(form.fields.map((f) => [f.name, f.value]));
  }

  async function capture(
    target: { buyerId: string; groupId: string; orderId?: string },
    paymentId: string,
  ) {
    const fields = await sign(target, 1066.38);
    const oid = fields.merchant_oid;
    const hash = crypto
      .createHmac("sha256", ENV.PAYTR_MERCHANT_KEY)
      .update(`${oid}${ENV.PAYTR_MERCHANT_SALT}success106638`)
      .digest("base64");
    await callbacks.handlePayTRCallback({
      merchant_oid: oid,
      status: "success",
      total_amount: "106638",
      hash,
      payment_type: "card",
      installment_count: "3",
      currency: "TL",
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    const orders = await prisma.order.findMany({
      where: payment.orderId
        ? { id: payment.orderId }
        : { checkoutGroupId: payment.checkoutGroupId },
      include: { buyer: true, seller: true, product: true },
    });
    for (const order of orders) {
      await finalizer.finalizePaidOrder(order, payment, { skipBuyer: true });
    }
  }

  /** The delivery trigger: the lifecycle marks it, the outbox issues. */
  async function deliver(orderId: string) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered, deliveredAt: new Date() },
    });
    await issuing.issueOrderRevenueInvoices(orderId);
  }

  /** Refunds goods and runs the outbox handler of its invoice event. */
  async function refund(orderId: string, goods: number, key: string) {
    const before = outboxEvents.length;
    await refunds.processRefund(orderId, goods, {
      idempotencyKey: key,
      cancelledBy: CancellationActor.buyer,
    });
    const event = outboxEvents
      .slice(before)
      .find((e) => e.type === OUTBOX_INVOICE_REFUND_REVERSE);
    if (!event) throw new Error(`no invoice event for ${key}`);
    const payload = event.payload as InvoiceRefundReversePayload;
    await reversals.handleOrderRefund(payload.orderId, payload);
    return payload;
  }

  const feeDocumentOf = (packageId: string) =>
    prisma.fiscalInvoice.findUnique({
      where: {
        type_sourceId: { type: "buyer_installment_fee", sourceId: packageId },
      },
    });

  const returnsOf = (invoice: FiscalInvoice) =>
    prisma.fiscalInvoice.findMany({
      where: {
        type: "return_invoice",
        billingReference: invoice.invoiceNumber,
      },
      orderBy: { createdAt: "asc" },
    });

  const amounts = (row: FiscalInvoice) => [
    row.total.toFixed(2),
    row.netAmount.toFixed(2),
    row.taxAmount.toFixed(2),
  ];

  beforeAll(async () => {
    await prisma.installmentRule.updateMany({
      where: { archivedAt: null },
      data: { archivedAt: new Date(), archivedBy: "e2e-reset" },
    });
    for (const [settingKey, settingValue, settingType] of [
      ["installments_enabled", "true", "boolean"],
      ["installment_min_amount", "500", "number"],
    ]) {
      await prisma.platformSetting.upsert({
        where: { settingKey },
        update: { settingValue },
        create: { settingKey, settingValue, settingType },
      });
    }
    await createRateSnapshot({
      maxInstallmentNonBusiness: 6,
      rates: { world: { "3": "8", "6": "13" } },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("invoices 66.38 at delivery as 55.32 + 11.06, then reverses 26.55 and 39.83 with the two refunds", async () => {
    const target = await singleOrder({
      guestName: "Ayşe Yılmaz",
      guestEmail: "ayse@example.test",
      city: "İstanbul",
      district: "Kadıköy",
      address: "Örnek Sk. 1",
    });
    await capture(target, target.paymentId);
    // No document before delivery: the fee is collected, not yet invoiced.
    expect(await feeDocumentOf(target.packageId)).toBeNull();

    await deliver(target.orderId);

    const fee = await feeDocumentOf(target.packageId);
    expect(fee).not.toBeNull();
    const doc = fee as FiscalInvoice;
    expect(doc.status).toBe("sent");
    expect(amounts(doc)).toEqual(["66.38", "55.32", "11.06"]);
    expect(doc.vatRate.toFixed(2)).toBe("20.00");
    expect(doc.recipientUserId).toBe(target.buyerId);
    // A guest's document names the real buyer, not the shared account.
    expect([doc.recipientName, doc.recipientEmail]).toEqual([
      "Ayşe Yılmaz",
      "ayse@example.test",
    ]);
    expect(doc.lineItems).toEqual([
      {
        name: "Taksit vade farkı",
        quantity: 1,
        net: 55.32,
        unitPrice: 55.32,
        vatRate: 20,
        taxAmount: 11.06,
      },
    ]);
    const issued = sent.find((d) => d.documentNumber === doc.invoiceNumber);
    expect(issued?.lines).toEqual([
      expect.objectContaining({
        name: "Taksit vade farkı",
        lineExtension: 55.32,
        taxAmount: 11.06,
        vatRate: 20,
      }),
    ]);
    // Delivered again (backfill, retries): still one document.
    await issuing.issueOrderRevenueInvoices(target.orderId);
    expect(
      await prisma.fiscalInvoice.count({
        where: { type: "buyer_installment_fee", sourceId: target.packageId },
      }),
    ).toBe(1);

    const first = await refund(
      target.orderId,
      400,
      `e2e-a6-part-1:${target.paymentId}`,
    );
    const second = await refund(
      target.orderId,
      600,
      `e2e-a6-part-2:${target.paymentId}`,
    );
    // Replays of both events: no second return, no cancel.
    await reversals.handleOrderRefund(first.orderId, first);
    await reversals.handleOrderRefund(second.orderId, second);

    const returns = await returnsOf(doc);
    expect(returns.map((r) => [r.sourceId, ...amounts(r), r.status])).toEqual([
      [`${doc.id}:${first.refundAttemptId}`, "26.55", "22.13", "4.42", "sent"],
      [`${doc.id}:${second.refundAttemptId}`, "39.83", "33.19", "6.64", "sent"],
    ]);
    // The returns sum to the document, net and VAT included.
    const sum = (pick: (r: FiscalInvoice) => Prisma.Decimal) =>
      returns.reduce((acc, r) => acc.plus(pick(r)), D(0)).toFixed(2);
    expect([
      sum((r) => r.total),
      sum((r) => r.netAmount),
      sum((r) => r.taxAmount),
    ]).toEqual(["66.38", "55.32", "11.06"]);
    expect(returns[0].lineItems).toEqual([
      {
        name: "İade edilen taksit vade farkı",
        quantity: 1,
        net: 22.13,
        unitPrice: 22.13,
        vatRate: 20,
        taxAmount: 4.42,
      },
    ]);
    expect(returns.map((r) => r.recipientName)).toEqual([
      "Ayşe Yılmaz",
      "Ayşe Yılmaz",
    ]);
    // A partial first refund keeps the original; it is never cancelled.
    expect((await feeDocumentOf(target.packageId))?.status).toBe("sent");
    expect(cancelled).not.toContain(doc.ettn);
  });

  it("gives each package of a cart its own document, Tarodan's own goods included (AS-F2), net of a refund before delivery", async () => {
    const target = await cart();
    const platformSeller = await prisma.order.findUniqueOrThrow({
      where: { id: target.orders.small },
      select: { sellerId: true },
    });
    await prisma.user.update({
      where: { id: platformSeller.sellerId },
      data: { sellerType: "platform" },
    });
    await capture(target, target.paymentId);
    const fees = await prisma.order.findMany({
      where: { id: { in: [target.orders.big, target.orders.small] } },
      select: { id: true, installmentFeeAmount: true },
    });
    expect(
      Object.fromEntries(
        fees.map((o) => [
          o.id === target.orders.big ? "big" : "small",
          o.installmentFeeAmount.toFixed(2),
        ]),
      ),
    ).toEqual({ big: "39.83", small: "26.55" });

    // 160.00 of the small order's goods back before delivery: fee 10.62.
    const early = await refund(
      target.orders.small,
      160,
      `e2e-a6-cart-small:${target.paymentId}`,
    );
    await deliver(target.orders.big);
    await deliver(target.orders.small);

    const big = (await feeDocumentOf(target.packages.big)) as FiscalInvoice;
    const small = (await feeDocumentOf(target.packages.small)) as FiscalInvoice;
    expect(amounts(big)).toEqual(["39.83", "33.19", "6.64"]);
    // The platform sale's package gets the same separate document, cut
    // net of the fee already given back: 26.55 - 10.62 = 15.93.
    expect(amounts(small)).toEqual(["15.93", "13.28", "2.65"]);
    expect(
      await prisma.fiscalInvoice.count({
        where: { type: "platform_sale", sourceId: target.orders.small },
      }),
    ).toBe(1);

    // The early refund's event, handled after the document was cut, owes
    // nothing: the document already excludes its fee.
    await reversals.handleOrderRefund(early.orderId, early);
    expect(await returnsOf(small)).toEqual([]);

    // The big order refunded in full within 8 days: the e-Arşiv is cancelled.
    await refund(target.orders.big, 600, `e2e-a6-cart-big:${target.paymentId}`);
    expect((await feeDocumentOf(target.packages.big))?.status).toBe(
      "cancelled",
    );
    expect(cancelled).toContain(big.ettn);
    expect(await returnsOf(big)).toEqual([]);
  });

  it("issues no fee document for a single payment", async () => {
    const payment = await createGroupPayment({ amount: "1000.00" });
    const { orderId } = await createGroupOrder(payment, {
      totalAmount: "1000.00",
    });
    const packageId = await packageFor(orderId);
    await prisma.payment.update({
      where: { id: payment.paymentId },
      data: { status: "completed", paidAt: new Date() },
    });

    await deliver(orderId);

    expect(await feeDocumentOf(packageId)).toBeNull();
  });
});
