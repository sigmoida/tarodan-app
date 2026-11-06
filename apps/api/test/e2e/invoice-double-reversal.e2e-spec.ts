import { CancellationActor, OrderStatus, Prisma } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import { disconnectPrisma, getPrisma } from "../test-utils/db";
import { CommissionLedgerService } from "../../src/modules/commission/commission-ledger.service";
import { InvoiceDeliveryService } from "../../src/modules/invoicing/invoice-delivery.service";
import { InvoiceDocumentService } from "../../src/modules/invoicing/invoice-document.service";
import { InvoiceIssuingService } from "../../src/modules/invoicing/invoice-issuing.service";
import { InvoiceReversalService } from "../../src/modules/invoicing/invoice-reversal.service";
import type {
  EInvoiceCancelResult,
  EInvoiceProvider,
  FiscalDocumentInput,
} from "../../src/modules/invoicing/provider/e-invoice-provider";
import {
  OUTBOX_INVOICE_REFUND_REVERSE,
  type InvoiceRefundReversePayload,
} from "../../src/modules/outbox/outbox.types";
import { PaymentRefundAttemptService } from "../../src/modules/payment/refund/payment-refund-attempt.service";
import { PaymentRefundService } from "../../src/modules/payment/refund/payment-refund.service";

/**
 * A document cut NET of an early refund is never reversed for it again, on a
 * real database (unique `(type, sourceId)`, the gap-free number counter and
 * the amounts decided inside Serializable transactions, the cancel claim
 * compare-and-set).
 *
 * QA's case: a platform sale of 400.00, 160.00 refunded before delivery; the
 * `platform_sale` document is cut at 240.00 at delivery; the refund's late
 * invoice event then cut a 160.00 return, reversing the refund twice.
 *
 * The real refund service records the refund (payment `refundedOrders`, the
 * attempt, the outbox event); PayTR and eLogo are fakes and nothing leaves
 * the process.
 */
describe("invoice double reversal on a real database (E2E)", () => {
  const prisma = getPrisma();
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
  const config = {
    get: (key: string, fallback?: string) =>
      ({ ELOGO_VAT_RATE: "20", ELOGO_INVOICE_PREFIX: "TDR" })[key] ?? fallback,
  } as unknown as ConfigService;

  // ── e-documents: real services, fake integrator ──────────────────────────
  const sent: FiscalDocumentInput[] = [];
  const cancelled: string[] = [];
  let cancelHook: () => Promise<EInvoiceCancelResult> = async () => ({
    success: true,
  });
  const provider = {
    name: "elogo",
    numbering: "local",
    isEnabled: () => true,
    resolveRecipientKind: async () => ({ kind: "EARCHIVE" }),
    send: async (document: FiscalDocumentInput) => {
      sent.push(document);
      return { accepted: true, providerRef: `ref-${sent.length}` };
    },
    getStatus: async () => ({ state: "unknown" }),
    cancelEArchive: async (ref: { ettn: string }) => {
      cancelled.push(ref.ettn);
      return cancelHook();
    },
    fetchPdf: async () => null,
    // Like eLogo: a fresh e-Arşiv is cancelled, an older one gets a return.
    eArchiveReversalStrategy: () => "CANCEL",
    classifyError: () => "unknown",
  } as unknown as EInvoiceProvider;
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
  const anyCall = new Proxy({}, { get: () => jest.fn(async () => undefined) });
  const refunds = new PaymentRefundService(
    prisma as never,
    { get: () => undefined } as never,
    {
      resolve: () => ({
        createRefund: async (oid: string) => ({
          status: "success",
          merchant_oid: oid,
        }),
      }),
    } as never,
    anyCall as never, // events
    anyCall as never, // notifications
    new CommissionLedgerService(prisma as never),
    // The post-commit fast path; the tests run the handlers themselves.
    { handleOrderRefund: async () => undefined } as never,
    { cancelSuratShipmentIfExists: async () => undefined } as never,
    { record: async () => undefined } as never,
    {} as never, // holdRelease
    new PaymentRefundAttemptService(prisma as never),
    {} as never, // tradeRefunds
    {} as never, // boostTimeline (not a boost order)
    {
      enqueue: async (_tx: unknown, e: { type: string; payload: unknown }) =>
        void outboxEvents.push(e),
    } as never,
  );

  const unique = () =>
    `${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

  /**
   * The platform sells its own product: 400.00 = 300.00 product (VAT 20 %
   * inside) + 50.00 shipping + 33.33 buyer fee (VAT 20 % on top), paid.
   */
  async function platformSale() {
    const u = unique();
    const category = await prisma.category.create({
      data: { name: `C-${u}`, slug: `c-${u.toLowerCase()}`, sortOrder: 0 },
    });
    const platform = await prisma.user.create({
      data: {
        email: `platform-${u}@example.test`,
        passwordHash: "x",
        displayName: "Tarodan Official Store",
        isSeller: true,
        sellerType: "platform",
      },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${u}@example.test`,
        passwordHash: "x",
        displayName: "Alıcı",
      },
    });
    const product = await prisma.product.create({
      data: {
        sellerId: platform.id,
        categoryId: category.id,
        title: `Diecast ${u}`,
        description: "x",
        price: D(300),
        condition: "new",
        status: "active",
        quantity: 2,
        reservedQuantity: 0,
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${u}`,
        buyerId: buyer.id,
        sellerId: platform.id,
        productId: product.id,
        totalAmount: D(400),
        subtotal: D(300),
        buyerShippingAmount: D(50),
        buyerFeeAmount: D("33.33"),
        // The platform's own sale: no commission.
        commissionAmount: D(0),
        quantity: 1,
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.paid,
      },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "paytr",
        providerConversationId: `oid-${u}`,
        amount: D(400),
        status: "completed",
        metadata: {},
      },
    });
    return order.id;
  }

  /** Refunds through the real refund service; returns its invoice event. */
  async function refund(
    orderId: string,
    amount: number,
  ): Promise<InvoiceRefundReversePayload> {
    const before = outboxEvents.length;
    await refunds.processRefund(orderId, amount, {
      idempotencyKey: `refund-${unique()}`,
      cancelledBy: CancellationActor.platform,
    });
    const event = outboxEvents
      .slice(before)
      .find((e) => e.type === OUTBOX_INVOICE_REFUND_REVERSE);
    if (!event) throw new Error(`no invoice event for order ${orderId}`);
    return event.payload as InvoiceRefundReversePayload;
  }

  /** The delivery trigger: the lifecycle marks it, the outbox issues. */
  async function deliver(orderId: string) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered, deliveredAt: new Date() },
    });
    await issuing.issueOrderRevenueInvoices(orderId);
    return prisma.fiscalInvoice.findUniqueOrThrow({
      where: {
        type_sourceId: { type: "platform_sale", sourceId: orderId },
      },
    });
  }

  const handle = (event: InvoiceRefundReversePayload) =>
    reversals.handleOrderRefund(event.orderId, event);

  /** Runs handlers at once and keeps going on failure, like the outbox. */
  const together = (...runs: Array<() => Promise<void>>) =>
    Promise.allSettled(runs.map((run) => run()));

  const returnsOf = (invoiceNumber: string | null) =>
    prisma.fiscalInvoice.findMany({
      where: { type: "return_invoice", billingReference: invoiceNumber },
      orderBy: { createdAt: "asc" },
    });
  const totals = (rows: Array<{ total: Prisma.Decimal }>) =>
    rows.map((row) => row.total.toFixed(2));

  beforeEach(() => {
    cancelHook = async () => ({ success: true });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("does not reverse a document cut at 240.00 net of an early 160.00 refund again on its late, replayed and doubled events", async () => {
    const orderId = await platformSale();
    const early = await refund(orderId, 160);
    expect(early).toMatchObject({ refundRatio: 0.4, fullyRefunded: false });

    const doc = await deliver(orderId);
    expect([doc.status, doc.total.toFixed(2)]).toEqual(["sent", "240.00"]);

    await handle(early);
    await handle(early);
    await together(
      () => handle(early),
      () => handle(early),
    );

    expect(await returnsOf(doc.invoiceNumber)).toEqual([]);
    expect(cancelled).not.toContain(doc.ettn);
  });

  it("reverses 160.00 of a document cut at 400.00 once, with both handlers of the attempt at once", async () => {
    const orderId = await platformSale();
    const doc = await deliver(orderId);
    expect(doc.total.toFixed(2)).toBe("400.00");

    const event = await refund(orderId, 160);
    const results = await together(
      () => handle(event),
      () => handle(event),
    );
    await handle(event);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const returns = await returnsOf(doc.invoiceNumber);
    expect(totals(returns)).toEqual(["160.00"]);
    expect(returns[0].sourceId).toBe(`${doc.id}:${event.refundAttemptId}`);
  });

  it("reverses two refunds once each when their handlers run at once (400 -> 140)", async () => {
    const orderId = await platformSale();
    const doc = await deliver(orderId);
    const first = await refund(orderId, 160);
    const second = await refund(orderId, 100);

    await together(
      () => handle(first),
      () => handle(second),
    );
    // Whatever lost a write conflict is retried by the outbox.
    await handle(first);
    await handle(second);

    const returns = await returnsOf(doc.invoiceNumber);
    expect(totals(returns).sort()).toEqual(["100.00", "160.00"]);
  });

  it("takes a document cut net of one refund only down to its target after a second (240 -> 140)", async () => {
    const orderId = await platformSale();
    const early = await refund(orderId, 160);
    const doc = await deliver(orderId);
    const later = await refund(orderId, 100);

    await together(
      () => handle(later),
      () => handle(early),
    );
    await handle(early);
    await handle(later);

    const returns = await returnsOf(doc.invoiceNumber);
    const returned = returns.reduce((sum, r) => sum + Number(r.total), 0);
    expect(returned.toFixed(2)).toBe("100.00");
  });

  it("cancels once on a full refund handled twice at once; the second cancel is never sent and no return is cut", async () => {
    const orderId = await platformSale();
    const doc = await deliver(orderId);
    const full = await refund(orderId, 400);
    expect(full.fullyRefunded).toBe(true);
    let calls = 0;
    cancelHook = async () => {
      const call = ++calls;
      // eLogo is slow; a second cancel of the same document is refused.
      await new Promise((resolve) => setTimeout(resolve, 200));
      return call === 1
        ? { success: true }
        : { success: false, resultMsg: "already cancelled" };
    };

    const results = await together(
      () => handle(full),
      () => handle(full),
    );
    await handle(full);

    expect(calls).toBe(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const after = await prisma.fiscalInvoice.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect([after.status, after.cancelReason]).toEqual(["cancelled", "refund"]);
    expect(await returnsOf(doc.invoiceNumber)).toEqual([]);
  });

  it("keeps another attempt's return off a document being cancelled", async () => {
    const orderId = await platformSale();
    const doc = await deliver(orderId);
    const partial = await refund(orderId, 160);
    const closing = await refund(orderId, 240);
    expect(closing.fullyRefunded).toBe(true);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    cancelHook = async () => {
      await gate;
      return { success: true };
    };

    const cancelling = handle(closing);
    // Wait until the closing handler holds the claim.
    for (let i = 0; i < 100; i++) {
      const row = await prisma.fiscalInvoice.findUniqueOrThrow({
        where: { id: doc.id },
      });
      if (row.cancelReason?.startsWith("refund_cancelling:")) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await expect(handle(partial)).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);
    release();
    await cancelling;
    // The outbox retries the partial refund's event: nothing is left.
    await handle(partial);

    const after = await prisma.fiscalInvoice.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect(after.status).toBe("cancelled");
    expect(await returnsOf(doc.invoiceNumber)).toEqual([]);
  });
});
